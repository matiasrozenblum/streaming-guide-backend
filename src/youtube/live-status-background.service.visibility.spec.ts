import { Test, TestingModule } from '@nestjs/testing';
import { LiveStatusBackgroundService } from './live-status-background.service';
import { YoutubeLiveService } from './youtube-live.service';
import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
import { SentryService } from '../sentry/sentry.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Channel } from '../channels/channels.entity';
import { TimezoneUtil } from '../utils/timezone.util';
import * as dayjs from 'dayjs';

const CHANNEL_ID = 'UCvCTWHCbBC0b9UIeLeNs8ug';
const HANDLE = 'VorterixOficial';

/**
 * Regression tests for the Vorterix incident (2026-08-13):
 * - A hidden program ("Dejá que entre el sol", is_visible=false, 10:00-13:00) was compared
 *   against the live video title of the visible program ("Y QUÉ?", same slot), producing a
 *   0% match and forcing needless validations.
 * - When no live stream was found while a program was on-air, the negative result was cached
 *   for the whole block, freezing the channel as not-live until the program ended.
 */
describe('LiveStatusBackgroundService visibility + negative cache', () => {
  let service: LiveStatusBackgroundService;
  let schedulesService: { findAll: jest.Mock };
  let redisService: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    setNX: jest.Mock;
  };
  let youtubeLiveService: {
    isVideoLive: jest.Mock;
    getLiveStreamsMain: jest.Mock;
  };
  let configService: {
    canFetchLive: jest.Mock;
    isTitleMatchDisabled: jest.Mock;
  };

  /**
   * Freezes both the "minutes since midnight" helper and `now()` so block TTL calculations
   * (which diff `todayAtTime(blockEnd)` against `now()`) stay consistent with the simulated clock.
   */
  const setSimulatedTime = (minutes: number) => {
    jest.spyOn(TimezoneUtil, 'currentTimeInMinutes').mockReturnValue(minutes);
    jest
      .spyOn(TimezoneUtil, 'now')
      .mockImplementation(
        () => dayjs().startOf('day').add(minutes, 'minute') as any,
      );
  };

  const makeSchedule = (
    programName: string,
    start: string,
    end: string,
    isVisible = true,
  ) => ({
    day_of_week: 'thursday',
    start_time: start,
    end_time: end,
    program: {
      name: programName,
      is_visible: isVisible,
      channel: {
        handle: HANDLE,
        youtube_channel_id: CHANNEL_ID,
        is_visible: true,
      },
    },
  });

  beforeEach(async () => {
    schedulesService = { findAll: jest.fn().mockResolvedValue([]) };
    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      setNX: jest.fn().mockResolvedValue(true),
    };
    youtubeLiveService = {
      isVideoLive: jest.fn().mockResolvedValue(true),
      getLiveStreamsMain: jest.fn().mockResolvedValue(null),
    };
    configService = {
      canFetchLive: jest.fn().mockResolvedValue(true),
      isTitleMatchDisabled: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveStatusBackgroundService,
        { provide: YoutubeLiveService, useValue: youtubeLiveService },
        { provide: SchedulesService, useValue: schedulesService },
        { provide: RedisService, useValue: redisService },
        { provide: ConfigService, useValue: configService },
        {
          provide: SentryService,
          useValue: {
            captureException: jest.fn(),
            captureMessage: jest.fn(),
            setTag: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Channel),
          useValue: { find: jest.fn(), findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(LiveStatusBackgroundService);

    jest.spyOn(TimezoneUtil, 'currentDayOfWeek').mockReturnValue('thursday');
    jest.spyOn(TimezoneUtil, 'previousDayOfWeek').mockReturnValue('wednesday');
    setSimulatedTime(12 * 60); // 12:00
  });

  afterEach(() => jest.restoreAllMocks());

  describe('hidden programs', () => {
    it('matches the live video title against the visible program, not the hidden one', async () => {
      // Both programs cover 10:00-13:00; the hidden one is listed first (as the DB returned it)
      schedulesService.findAll.mockResolvedValue([
        makeSchedule('Dejá que entre el sol', '10:00', '13:00', false),
        makeSchedule('Y QUÉ?', '10:00', '13:00', true),
      ]);

      redisService.get.mockImplementation(async (key: string) => {
        if (key === `liveStatusByHandle:${HANDLE}`) {
          return {
            channelId: CHANNEL_ID,
            handle: HANDLE,
            isLive: true,
            streamUrl: 'https://www.youtube.com/embed/T555fdNUTZ4?autoplay=1',
            videoId: 'T555fdNUTZ4',
            lastUpdated: Date.now(),
            ttl: 3600,
            blockEndTime: 13 * 60,
            validationCooldown: Date.now() + 30 * 60 * 1000,
            lastValidation: Date.now(), // fresh: no age-based validation
            streams: [
              {
                videoId: 'T555fdNUTZ4',
                title:
                  '🔴 Y QUÉ? con Guille Aquino, Damián Kuc, Navaja Crimen y Anacleta | VORTERIX EN VIVO',
              },
            ],
            streamCount: 1,
          };
        }
        return null;
      });

      const result = await (service as any).updateChannelLiveStatus(CHANNEL_ID);

      // Title matches the visible program → cached video kept, no extra validation, no fetch
      expect(result.videoId).toBe('T555fdNUTZ4');
      expect(youtubeLiveService.isVideoLive).not.toHaveBeenCalled();
      expect(youtubeLiveService.getLiveStreamsMain).not.toHaveBeenCalled();
    });

    it('does not mark a channel live when only a hidden program is on-air', async () => {
      schedulesService.findAll.mockResolvedValue([
        makeSchedule('Dejá que entre el sol', '10:00', '13:00', false),
      ]);

      const result = await (service as any).updateChannelLiveStatus(CHANNEL_ID);

      // No visible schedules at all for this channel → nothing to update
      expect(result).toBeNull();
      expect(youtubeLiveService.getLiveStreamsMain).not.toHaveBeenCalled();
    });

    it('excludes channels whose only on-air program is hidden from the cron', async () => {
      schedulesService.findAll.mockResolvedValue([
        makeSchedule('Dejá que entre el sol', '10:00', '13:00', false),
      ]);

      await service.updateLiveStatusBackground();

      expect(redisService.get).not.toHaveBeenCalledWith(
        `liveStatusByHandle:${HANDLE}`,
      );
    });
  });

  describe('negative cache TTL', () => {
    it('caches a not-found result with a short TTL while the program is on-air', async () => {
      schedulesService.findAll.mockResolvedValue([
        makeSchedule('No se pudo', '13:00', '15:00'),
      ]);
      setSimulatedTime(13 * 60 + 2); // 13:02, block ends at 15:00

      youtubeLiveService.getLiveStreamsMain.mockResolvedValue(null);

      const result = await (service as any).updateChannelLiveStatus(CHANNEL_ID);

      expect(result.isLive).toBe(false);
      // 2 minutes, not the ~2 hours left in the block
      expect(result.ttl).toBe(2 * 60);
      expect(redisService.set).toHaveBeenCalledWith(
        `liveStatusByHandle:${HANDLE}`,
        expect.objectContaining({ isLive: false, ttl: 2 * 60 }),
        2 * 60,
      );
    });

    it('keeps the full block TTL when a live stream is found', async () => {
      schedulesService.findAll.mockResolvedValue([
        makeSchedule('No se pudo', '13:00', '15:00'),
      ]);
      setSimulatedTime(13 * 60 + 2);

      youtubeLiveService.getLiveStreamsMain.mockResolvedValue({
        streams: [{ videoId: 'abc123', title: '#NOSEPUDO' }],
        primaryVideoId: 'abc123',
        streamCount: 1,
      });

      const result = await (service as any).updateChannelLiveStatus(CHANNEL_ID);

      expect(result.isLive).toBe(true);
      expect(result.ttl).toBeGreaterThan(2 * 60);
    });
  });
});
