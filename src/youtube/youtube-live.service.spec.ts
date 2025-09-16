import { YoutubeLiveService } from './youtube-live.service';
import { ConfigService } from '../config/config.service';
import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';
import { SentryService } from '../sentry/sentry.service';
import axios from 'axios';
import * as dayjs from 'dayjs';

describe('YoutubeLiveService', () => {
  let service: YoutubeLiveService;
  let configService: jest.Mocked<ConfigService>;
  let schedulesService: jest.Mocked<SchedulesService>;
  let redisService: jest.Mocked<RedisService>;
  let sentryService: jest.Mocked<SentryService>;

  beforeEach(() => {
    configService = {
      isYoutubeFetchEnabledFor: jest.fn(),
      getBoolean: jest.fn(),
      canFetchLive: jest.fn(),
    } as any;
    schedulesService = {
      findByDay: jest.fn(),
      enrichSchedules: jest.fn((schedules) => Promise.resolve(schedules)),
    } as any;
    redisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
    } as any;
    sentryService = {
      captureMessage: jest.fn(),
      captureException: jest.fn(),
      setTag: jest.fn(),
      addBreadcrumb: jest.fn(),
    } as any;
    service = new YoutubeLiveService(configService, schedulesService, redisService, sentryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getLiveVideoId', () => {
    beforeEach(() => {
      configService.canFetchLive.mockResolvedValue(true);
    });

    it('returns __SKIPPED__ if canFetchLive is false', async () => {
      configService.canFetchLive.mockResolvedValue(false);
      const result = await service.getLiveVideoId('cid', 'handle', 100, 'cron');
      expect(result).toBe('__SKIPPED__');
    });

    it('returns __SKIPPED__ if notFoundKey is set in redis', async () => {
      redisService.get.mockImplementation(async (key: string) => key === 'videoIdNotFound:cid' ? '1' : null);
      const result = await service.getLiveVideoId('cid', 'handle', 100, 'cron');
      expect(result).toBe('__SKIPPED__');
    });

    it('returns cachedId if it is live', async () => {
      redisService.get.mockImplementation(async (key: string) => key === 'liveVideoIdByChannel:cid' ? 'cachedId' : null);
      jest.spyOn(service as any, 'isVideoLive').mockResolvedValue(true);
      const result = await service.getLiveVideoId('cid', 'handle', 100, 'cron');
      expect(result).toBe('cachedId');
    });

    it('deletes cachedId if it is not live', async () => {
      redisService.get.mockImplementation(async (key: string) => key === 'liveVideoIdByChannel:cid' ? 'cachedId' : null);
      jest.spyOn(service as any, 'isVideoLive').mockResolvedValue(false);
      redisService.del.mockResolvedValue(undefined);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } });
      const result = await service.getLiveVideoId('cid', 'handle', 100, 'cron');
      expect(redisService.del).toHaveBeenCalledWith('liveVideoIdByChannel:cid');
      expect(result).toBe(null);
    });

    it('fetches from YouTube and caches videoId', async () => {
      redisService.get.mockResolvedValue(null);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [{ id: { videoId: 'vid123' } }] } });
      jest.spyOn(service as any, 'isVideoLive').mockResolvedValue(false);
      const result = await service.getLiveVideoId('cid', 'handle', 100, 'cron');
      expect(redisService.set).toHaveBeenCalledWith('liveVideoIdByChannel:cid', 'vid123', 100);
      expect(result).toBe('vid123');
    });

    it('returns null and sets notFoundKey if no videoId found', async () => {
      redisService.get.mockResolvedValue(null);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } });
      const result = await service.getLiveVideoId('cid', 'handle', 100, 'cron');
      expect(redisService.set).toHaveBeenCalledWith('videoIdNotFound:cid', '1', 900);
      expect(result).toBe(null);
    });

    it('returns null on axios error', async () => {
      redisService.get.mockResolvedValue(null);
      jest.spyOn(axios, 'get').mockRejectedValue(new Error('fail'));
      const result = await service.getLiveVideoId('cid', 'handle', 100, 'cron');
      expect(result).toBe(null);
    });
  });

  describe('fetchLiveVideoIds', () => {
    it('does nothing if no schedules', async () => {
      schedulesService.findByDay.mockResolvedValue([]);
      const spy = jest.spyOn(service, 'getLiveVideoId');
      await service.fetchLiveVideoIds();
      expect(spy).not.toHaveBeenCalled();
    });

    it('calls getLiveVideoId for each channel with schedule', async () => {
      const schedules = [
        { program: { channel: { youtube_channel_id: 'cid1', handle: 'h1' }, is_live: true } },
        { program: { channel: { youtube_channel_id: 'cid2', handle: 'h2' }, is_live: true } },
      ];
      schedulesService.findByDay.mockResolvedValue(schedules as any);
      jest.spyOn(service, 'getLiveVideoId').mockResolvedValue('vid');
      jest.spyOn(require('@/utils/getBlockTTL.util'), 'getCurrentBlockTTL').mockResolvedValue(100);
      await service.fetchLiveVideoIds();
      expect(service.getLiveVideoId).toHaveBeenCalledTimes(2);
    });

    it('passes SentryService to getCurrentBlockTTL', async () => {
      const schedules = [
        { program: { channel: { youtube_channel_id: 'cid1', handle: 'h1' }, is_live: true } },
      ];
      schedulesService.findByDay.mockResolvedValue(schedules as any);
      jest.spyOn(service, 'getLiveVideoId').mockResolvedValue('vid');
      
      const getCurrentBlockTTLSpy = jest.spyOn(require('@/utils/getBlockTTL.util'), 'getCurrentBlockTTL').mockResolvedValue(100);
      
      await service.fetchLiveVideoIds();
      
      expect(getCurrentBlockTTLSpy).toHaveBeenCalledWith('cid1', schedules, sentryService);
    });
  });

  describe('validateCachedVideoId', () => {
    it('passes SentryService to getCurrentBlockTTL when refreshing video ID', async () => {
      const channelId = 'test-channel';
      const handle = 'test-handle';
      
      // Mock that there's a cached video ID
      redisService.get.mockResolvedValue('cached-video-id');
      
      // Mock that the video is no longer live by mocking the private method
      (service as any).isVideoLive = jest.fn().mockResolvedValue(false);
      
      // Mock schedules service
      schedulesService.findByDay.mockResolvedValue([]);
      
      // Mock getLiveVideoId to return a new video ID
      jest.spyOn(service, 'getLiveVideoId').mockResolvedValue('new-video-id');
      
      const getCurrentBlockTTLSpy = jest.spyOn(require('@/utils/getBlockTTL.util'), 'getCurrentBlockTTL').mockResolvedValue(100);
      
      // Call the private method through the service
      await (service as any).validateCachedVideoId(channelId, handle);
      
      expect(getCurrentBlockTTLSpy).toHaveBeenCalledWith(channelId, [], sentryService);
    });
  });
}); 