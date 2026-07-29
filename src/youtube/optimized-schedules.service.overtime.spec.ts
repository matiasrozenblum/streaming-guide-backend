import { Test, TestingModule } from '@nestjs/testing';
import { OptimizedSchedulesService } from './optimized-schedules.service';
import { SchedulesService } from '../schedules/schedules.service';
import { WeeklyOverridesService } from '../schedules/weekly-overrides.service';
import { RedisService } from '../redis/redis.service';

// "Now" is Monday 15:15 — just past a 13:00–15:00 block.
jest.mock('../utils/timezone.util', () => ({
  TimezoneUtil: {
    currentDayOfWeek: jest.fn().mockReturnValue('monday'),
    previousDayOfWeek: jest.fn().mockReturnValue('sunday'),
    currentTimeInMinutes: jest.fn().mockReturnValue(915),
    currentDateString: jest.fn().mockReturnValue('2026-07-27'),
    isTimeInRange: jest.fn((start: number, end: number, current: number) => {
      if (end <= start) return current >= start || current < end;
      return current >= start && current < end;
    }),
  },
}));

describe('OptimizedSchedulesService — overtime enrichment', () => {
  let service: OptimizedSchedulesService;
  let redisService: any;

  const CHANNEL_ID = 'CHANNEL_123';
  const HANDLE = 'testchannel';
  const OVERTIME_URL = 'https://www.youtube.com/embed/VIDEO_123?autoplay=1';

  const buildSchedule = (overrides: Record<string, any> = {}) => ({
    id: 42,
    day_of_week: 'monday',
    start_time: '13:00',
    end_time: '15:00',
    program: {
      id: 7,
      name: 'Programa de las 13',
      is_visible: true,
      stream_url: 'https://www.youtube.com/@testchannel',
      youtube_url: null,
      channel: {
        youtube_channel_id: CHANNEL_ID,
        handle: HANDLE,
        is_visible: true,
      },
    },
    ...overrides,
  });

  const buildLiveStatus = (overtime: any[] | undefined) => ({
    channelId: CHANNEL_ID,
    handle: HANDLE,
    isLive: !!overtime?.length,
    streamUrl: OVERTIME_URL,
    videoId: 'VIDEO_123',
    overtime,
    streams: [{ videoId: 'VIDEO_123', title: 'Programa de las 13' }],
    streamCount: 1,
  });

  const enrich = (schedules: any[], liveStatus: any) => {
    redisService.mget.mockImplementation((keys: string[]) => {
      const prefix = keys[0] ?? '';
      if (prefix.startsWith('liveStatusByHandle:')) {
        return Promise.resolve([liveStatus]);
      }
      return Promise.resolve(keys.map(() => null));
    });
    return (service as any).enrichWithCachedLiveStatusFast(schedules);
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OptimizedSchedulesService,
        { provide: SchedulesService, useValue: { findAll: jest.fn() } },
        {
          provide: WeeklyOverridesService,
          useValue: {
            applyWeeklyOverrides: jest.fn(),
            getWeekStartDate: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            mget: jest.fn(),
            // Global fetch_enabled true, no holiday configured.
            get: jest.fn((key: string) =>
              Promise.resolve(
                key === 'config:fetch_enabled:youtube.fetch_enabled'
                  ? true
                  : null,
              ),
            ),
          },
        },
      ],
    }).compile();

    service = module.get(OptimizedSchedulesService);
    redisService = module.get(RedisService);
  });

  afterEach(() => jest.clearAllMocks());

  it('keeps a finished program live while its stream is in overtime', async () => {
    const overtime = [
      { scheduleId: '42', videoId: 'VIDEO_123', streamUrl: OVERTIME_URL },
    ];

    const [result] = await enrich([buildSchedule()], buildLiveStatus(overtime));

    expect(result.program.is_live).toBe(true);
    expect(result.program.live_overtime).toBe(true);
    // Not the program's stored channel link — the actual running broadcast.
    expect(result.program.stream_url).toBe(OVERTIME_URL);
  });

  it('does not extend when another program already took over the channel', async () => {
    const overtime = [
      { scheduleId: '42', videoId: 'VIDEO_123', streamUrl: OVERTIME_URL },
    ];
    const nextProgram = buildSchedule({
      id: 43,
      start_time: '15:00',
      end_time: '17:00',
    });

    const results = await enrich(
      [buildSchedule(), nextProgram],
      buildLiveStatus(overtime),
    );

    const finished = results.find((r: any) => r.id === 42);
    const onAir = results.find((r: any) => r.id === 43);

    expect(finished.program.is_live).toBe(false);
    expect(finished.program.live_overtime).toBe(false);
    expect(onAir.program.is_live).toBe(true);
  });

  it('ignores overtime belonging to a different program', async () => {
    const overtime = [
      { scheduleId: '99', videoId: 'VIDEO_999', streamUrl: OVERTIME_URL },
    ];

    const [result] = await enrich([buildSchedule()], buildLiveStatus(overtime));

    expect(result.program.is_live).toBe(false);
    expect(result.program.live_overtime).toBe(false);
  });

  it('matches virtual schedule ids used by special weekly programs', async () => {
    const virtualId = 'virtual_special_channel_7_especial_monday';
    const overtime = [
      { scheduleId: virtualId, videoId: 'VIDEO_123', streamUrl: OVERTIME_URL },
    ];

    const [result] = await enrich(
      [buildSchedule({ id: virtualId })],
      buildLiveStatus(overtime),
    );

    expect(result.program.is_live).toBe(true);
    expect(result.program.live_overtime).toBe(true);
  });

  it('leaves live_overtime false for a program inside its own block', async () => {
    const onAir = buildSchedule({
      id: 43,
      start_time: '15:00',
      end_time: '17:00',
    });

    const [result] = await enrich([onAir], buildLiveStatus(undefined));

    expect(result.program.is_live).toBe(true);
    expect(result.program.live_overtime).toBe(false);
  });
});
