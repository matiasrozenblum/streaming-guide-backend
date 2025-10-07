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
    const mockChannelsRepository = {
      find: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      findOne: jest.fn(),
    } as any;
    
    service = new YoutubeLiveService(configService, schedulesService, redisService, sentryService, mockChannelsRepository);
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

    it('returns cached primary videoId if it is live', async () => {
      const cachedStreams = JSON.stringify({ primaryVideoId: 'cachedId', streamCount: 1 });
      redisService.get.mockImplementation(async (key: string) => 
        key === 'liveStreamsByChannel:cid' ? cachedStreams : null
      );
      jest.spyOn(service as any, 'isVideoLive').mockResolvedValue(true);
      const result = await service.getLiveVideoId('cid', 'handle', 100, 'cron');
      expect(result).toBe('cachedId');
    });

    it('deletes cached streams if they are not live', async () => {
      const cachedStreams = JSON.stringify({ primaryVideoId: 'cachedId', streamCount: 1 });
      redisService.get.mockImplementation(async (key: string) => 
        key === 'liveStreamsByChannel:cid' ? cachedStreams : null
      );
      jest.spyOn(service as any, 'isVideoLive').mockResolvedValue(false);
      redisService.del.mockResolvedValue(undefined);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } });
      const result = await service.getLiveVideoId('cid', 'handle', 100, 'cron');
      expect(redisService.del).toHaveBeenCalledWith('liveStreamsByChannel:cid');
      expect(result).toBe(null);
    });

    it('fetches from YouTube and caches streams', async () => {
      redisService.get.mockResolvedValue(null);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [{ id: { videoId: 'vid123' } }] } });
      jest.spyOn(service as any, 'isVideoLive').mockResolvedValue(false);
      const result = await service.getLiveVideoId('cid', 'handle', 100, 'cron');
      expect(redisService.set).toHaveBeenCalledWith('liveStreamsByChannel:cid', expect.any(String), 100);
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

    it('calls getLiveStreams for channels with schedule', async () => {
      const schedules = [
        { program: { channel: { youtube_channel_id: 'cid1', handle: 'h1', is_visible: true }, is_live: true } },
        { program: { channel: { youtube_channel_id: 'cid2', handle: 'h2', is_visible: true }, is_live: true } },
      ];
      schedulesService.findByDay.mockResolvedValue(schedules as any);
      schedulesService.enrichSchedules.mockResolvedValue(schedules as any);
      
      const individualResults = [
        {
          streams: [{ videoId: 'vid1', title: 'Test Stream 1', publishedAt: '2023-01-01', description: 'Test' }],
          primaryVideoId: 'vid1',
          streamCount: 1
        },
        {
          streams: [{ videoId: 'vid2', title: 'Test Stream 2', publishedAt: '2023-01-01', description: 'Test' }],
          primaryVideoId: 'vid2',
          streamCount: 1
        }
      ];
      
      jest.spyOn(service, 'getLiveStreams').mockResolvedValueOnce(individualResults[0]);
      jest.spyOn(service, 'getLiveStreams').mockResolvedValueOnce(individualResults[1]);
      jest.spyOn(require('@/utils/getBlockTTL.util'), 'getCurrentBlockTTL').mockResolvedValue(100);
      
      await service.fetchLiveVideoIds();
      
      expect(service.getLiveStreams).toHaveBeenCalledTimes(2);
      expect(service.getLiveStreams).toHaveBeenCalledWith('cid1', 'h1', 100, 'cron', false);
      expect(service.getLiveStreams).toHaveBeenCalledWith('cid2', 'h2', 100, 'cron', false);
    });

    it('passes SentryService to getCurrentBlockTTL', async () => {
      const schedules = [
        { program: { channel: { youtube_channel_id: 'cid1', handle: 'h1', is_visible: true }, is_live: true } },
      ];
      schedulesService.findByDay.mockResolvedValue(schedules as any);
      schedulesService.enrichSchedules.mockResolvedValue(schedules as any);
      jest.spyOn(service, 'getLiveStreams').mockResolvedValue({
        streams: [{ videoId: 'vid1', title: 'Test Stream', publishedAt: '2023-01-01', description: 'Test', thumbnailUrl: '', channelTitle: 'Test Channel' }],
        primaryVideoId: 'vid1',
        streamCount: 1
      });
      
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
      
      // Mock getLiveStreams to return a new streams result
      jest.spyOn(service, 'getLiveStreams').mockResolvedValue({
        streams: [{ videoId: 'new-video-id', title: 'Test Stream', publishedAt: '2023-01-01', description: 'Test' }],
        primaryVideoId: 'new-video-id',
        streamCount: 1
      });
      
      const getCurrentBlockTTLSpy = jest.spyOn(require('@/utils/getBlockTTL.util'), 'getCurrentBlockTTL').mockResolvedValue(100);
      
      // Call the private method through the service
      await (service as any).validateCachedVideoId(channelId, handle);
      
      expect(getCurrentBlockTTLSpy).toHaveBeenCalledWith(channelId, [], sentryService);
    });
  });

  describe('getLiveStreams', () => {
    beforeEach(() => {
      configService.canFetchLive.mockResolvedValue(true);
    });

    it('returns __SKIPPED__ if canFetchLive is false', async () => {
      configService.canFetchLive.mockResolvedValue(false);
      const result = await service.getLiveStreams('cid', 'handle', 100, 'cron');
      expect(result).toBe('__SKIPPED__');
    });

    it('returns __SKIPPED__ if notFoundKey is set in redis', async () => {
      redisService.get.mockImplementation(async (key: string) => key === 'videoIdNotFound:cid' ? '1' : null);
      const result = await service.getLiveStreams('cid', 'handle', 100, 'cron');
      expect(result).toBe('__SKIPPED__');
    });

    it('returns cached streams if they are still live', async () => {
      const mockStreams = [
        { videoId: 'vid1', title: 'Stream 1', publishedAt: '2023-01-01', description: 'Desc 1' },
        { videoId: 'vid2', title: 'Stream 2', publishedAt: '2023-01-01', description: 'Desc 2' }
      ];
      redisService.get.mockImplementation(async (key: string) => 
        key === 'liveStreamsByChannel:cid' ? JSON.stringify(mockStreams) : null
      );
      jest.spyOn(service as any, 'isVideoLive').mockResolvedValue(true);
      
      const result = await service.getLiveStreams('cid', 'handle', 100, 'cron');
      
      expect(result).toEqual({
        streams: mockStreams,
        primaryVideoId: 'vid1',
        streamCount: 2
      });
    });

    it('deletes cached streams if they are not live', async () => {
      const mockStreams = [{ videoId: 'vid1', title: 'Stream 1', publishedAt: '2023-01-01', description: 'Desc 1' }];
      redisService.get.mockImplementation(async (key: string) => 
        key === 'liveStreamsByChannel:cid' ? JSON.stringify(mockStreams) : null
      );
      jest.spyOn(service as any, 'isVideoLive').mockResolvedValue(false);
      redisService.del.mockResolvedValue(undefined);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } });
      
      const result = await service.getLiveStreams('cid', 'handle', 100, 'cron');
      
      expect(redisService.del).toHaveBeenCalledWith('liveStreamsByChannel:cid');
      expect(result).toBe(null);
    });

    it('fetches from YouTube and caches multiple streams', async () => {
      const mockApiResponse = {
        data: {
          items: [
            {
              id: { videoId: 'vid1' },
              snippet: {
                title: 'Stream 1',
                publishedAt: '2023-01-01T00:00:00Z',
                description: 'Description 1',
                thumbnails: { medium: { url: 'thumb1.jpg' } },
                channelTitle: 'Test Channel'
              }
            },
            {
              id: { videoId: 'vid2' },
              snippet: {
                title: 'Stream 2',
                publishedAt: '2023-01-01T01:00:00Z',
                description: 'Description 2',
                thumbnails: { medium: { url: 'thumb2.jpg' } },
                channelTitle: 'Test Channel'
              }
            }
          ]
        }
      };
      
      redisService.get.mockResolvedValue(null);
      jest.spyOn(axios, 'get').mockResolvedValue(mockApiResponse);
      jest.spyOn(service as any, 'isVideoLive').mockResolvedValue(false);
      
      const result = await service.getLiveStreams('cid', 'handle', 100, 'cron');
      
      expect(redisService.set).toHaveBeenCalledWith(
        'liveStreamsByChannel:cid',
        JSON.stringify([
          {
            videoId: 'vid1',
            title: 'Stream 1',
            publishedAt: '2023-01-01T00:00:00Z',
            description: 'Description 1',
            thumbnailUrl: 'thumb1.jpg',
            channelTitle: 'Test Channel'
          },
          {
            videoId: 'vid2',
            title: 'Stream 2',
            publishedAt: '2023-01-01T01:00:00Z',
            description: 'Description 2',
            thumbnailUrl: 'thumb2.jpg',
            channelTitle: 'Test Channel'
          }
        ]),
        100
      );
      
      expect(result).toEqual({
        streams: [
          {
            videoId: 'vid1',
            title: 'Stream 1',
            publishedAt: '2023-01-01T00:00:00Z',
            description: 'Description 1',
            thumbnailUrl: 'thumb1.jpg',
            channelTitle: 'Test Channel'
          },
          {
            videoId: 'vid2',
            title: 'Stream 2',
            publishedAt: '2023-01-01T01:00:00Z',
            description: 'Description 2',
            thumbnailUrl: 'thumb2.jpg',
            channelTitle: 'Test Channel'
          }
        ],
        primaryVideoId: 'vid1',
        streamCount: 2
      });
    });

    it('returns null and sets notFoundKey if no streams found', async () => {
      redisService.get.mockResolvedValue(null);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } });
      
      const result = await service.getLiveStreams('cid', 'handle', 100, 'cron');
      
      expect(redisService.set).toHaveBeenCalledWith('videoIdNotFound:cid', '1', 900);
      expect(result).toBe(null);
    });

    it('returns null on axios error', async () => {
      redisService.get.mockResolvedValue(null);
      jest.spyOn(axios, 'get').mockRejectedValue(new Error('API Error'));
      
      const result = await service.getLiveStreams('cid', 'handle', 100, 'cron');
      
      expect(result).toBe(null);
    });

    it('handles malformed cached streams gracefully', async () => {
      redisService.get.mockImplementation(async (key: string) => 
        key === 'liveStreamsByChannel:cid' ? 'invalid-json' : null
      );
      redisService.del.mockResolvedValue(undefined);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } });
      
      const result = await service.getLiveStreams('cid', 'handle', 100, 'cron');
      
      expect(redisService.del).toHaveBeenCalledWith('liveStreamsByChannel:cid');
      expect(result).toBe(null);
    });
  });
}); 