import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LiveStatusBackgroundService } from './live-status-background.service';
import { YoutubeLiveService } from './youtube-live.service';
import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
import { SentryService } from '../sentry/sentry.service';
import { Channel } from '../channels/channels.entity';

/**
 * Overtime: a program whose scheduled block ended but whose stream is still
 * broadcasting stays live so viewers who closed the player can get back to it.
 */
describe('LiveStatusBackgroundService — overtime', () => {
  let service: LiveStatusBackgroundService;
  let youtubeLiveService: jest.Mocked<YoutubeLiveService>;
  let redisService: any;
  let configService: any;
  let channelsRepository: any;

  const HANDLE = 'testchannel';
  const CHANNEL_ID = 'CHANNEL_123';
  const LAST_LIVE_KEY = `lastLiveVideo:${HANDLE}`;
  const STATUS_KEY = `liveStatusByHandle:${HANDLE}`;

  const buildMarker = (overrides: Record<string, any> = {}) => ({
    channelId: CHANNEL_ID,
    handle: HANDLE,
    scheduleId: '42',
    programName: 'Programa de las 13',
    videoId: 'VIDEO_123',
    streamUrl: 'https://www.youtube.com/embed/VIDEO_123?autoplay=1',
    stream: { videoId: 'VIDEO_123', title: 'Programa de las 13 — EN VIVO' },
    overtimeStartedAt: null,
    updatedAt: Date.now(),
    ...overrides,
  });

  const runOvertime = (liveChannelIds: string[] = []) =>
    (service as any).processOvertimeChannels(new Set(liveChannelIds));

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveStatusBackgroundService,
        {
          provide: YoutubeLiveService,
          useValue: { isVideoLive: jest.fn() },
        },
        { provide: SchedulesService, useValue: { findAll: jest.fn() } },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            mget: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { canFetchLive: jest.fn().mockResolvedValue(true) },
        },
        { provide: SentryService, useValue: { captureException: jest.fn() } },
        {
          provide: getRepositoryToken(Channel),
          useValue: { find: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(LiveStatusBackgroundService);
    youtubeLiveService = module.get(YoutubeLiveService);
    redisService = module.get(RedisService);
    configService = module.get(ConfigService);
    channelsRepository = module.get(getRepositoryToken(Channel));

    channelsRepository.find.mockResolvedValue([
      { handle: HANDLE, youtube_channel_id: CHANNEL_ID },
    ]);
  });

  afterEach(() => jest.clearAllMocks());

  it('keeps the program live when its stream is still broadcasting', async () => {
    redisService.mget.mockResolvedValue([buildMarker()]);
    youtubeLiveService.isVideoLive.mockResolvedValue(true);

    await runOvertime();

    expect(youtubeLiveService.isVideoLive).toHaveBeenCalledWith('VIDEO_123');
    expect(redisService.set).toHaveBeenCalledWith(
      STATUS_KEY,
      expect.objectContaining({
        isLive: true,
        videoId: 'VIDEO_123',
        streamUrl: 'https://www.youtube.com/embed/VIDEO_123?autoplay=1',
        overtime: [
          expect.objectContaining({ scheduleId: '42', videoId: 'VIDEO_123' }),
        ],
      }),
      150,
    );
  });

  it('ends overtime and publishes not-live once the stream stops', async () => {
    redisService.mget.mockResolvedValue([buildMarker()]);
    youtubeLiveService.isVideoLive.mockResolvedValue(false);

    await runOvertime();

    expect(redisService.del).toHaveBeenCalledWith(LAST_LIVE_KEY);
    expect(redisService.set).toHaveBeenCalledWith(
      STATUS_KEY,
      expect.objectContaining({ isLive: false, videoId: null }),
      expect.any(Number),
    );
  });

  it('does not extend a channel that already handed over to the next program', async () => {
    redisService.mget.mockResolvedValue([buildMarker()]);

    // Channel has a program on air right now.
    await runOvertime([CHANNEL_ID]);

    expect(redisService.mget).not.toHaveBeenCalled();
    expect(youtubeLiveService.isVideoLive).not.toHaveBeenCalled();
  });

  it('stops extending once the cap is reached, without spending quota', async () => {
    redisService.mget.mockResolvedValue([
      buildMarker({ overtimeStartedAt: Date.now() - 181 * 60 * 1000 }),
    ]);

    await runOvertime();

    expect(youtubeLiveService.isVideoLive).not.toHaveBeenCalled();
    expect(redisService.del).toHaveBeenCalledWith(LAST_LIVE_KEY);
  });

  it('does not extend channels with live fetching disabled', async () => {
    redisService.mget.mockResolvedValue([buildMarker()]);
    configService.canFetchLive.mockResolvedValue(false);

    await runOvertime();

    expect(youtubeLiveService.isVideoLive).not.toHaveBeenCalled();
    expect(redisService.del).toHaveBeenCalledWith(LAST_LIVE_KEY);
  });

  it('preserves the start time across cycles instead of resetting the cap', async () => {
    const startedAt = Date.now() - 30 * 60 * 1000;
    redisService.mget.mockResolvedValue([
      buildMarker({ overtimeStartedAt: startedAt }),
    ]);
    youtubeLiveService.isVideoLive.mockResolvedValue(true);

    await runOvertime();

    expect(redisService.set).toHaveBeenCalledWith(
      STATUS_KEY,
      expect.objectContaining({
        overtime: [expect.objectContaining({ startedAt })],
      }),
      150,
    );
  });

  it('supports special weekly programs, whose schedule ids are virtual strings', async () => {
    redisService.mget.mockResolvedValue([
      buildMarker({ scheduleId: 'virtual_special_channel_7_especial_monday' }),
    ]);
    youtubeLiveService.isVideoLive.mockResolvedValue(true);

    await runOvertime();

    expect(redisService.set).toHaveBeenCalledWith(
      STATUS_KEY,
      expect.objectContaining({
        overtime: [
          expect.objectContaining({
            scheduleId: 'virtual_special_channel_7_especial_monday',
          }),
        ],
      }),
      150,
    );
  });

  it('skips channels with no recorded stream', async () => {
    redisService.mget.mockResolvedValue([null]);

    await runOvertime();

    expect(youtubeLiveService.isVideoLive).not.toHaveBeenCalled();
    expect(redisService.set).not.toHaveBeenCalled();
  });
});
