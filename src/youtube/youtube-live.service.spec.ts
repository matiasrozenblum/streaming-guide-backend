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
      findAll: jest.fn(),
    } as any;
    redisService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      setNX: jest.fn().mockResolvedValue(true), // Default: always acquire lock
    } as any;
    sentryService = {
      captureMessage: jest.fn(),
      captureException: jest.fn(),
      setTag: jest.fn(),
      addBreadcrumb: jest.fn(),
    } as any;
    
    // Mock TimezoneUtil methods
    jest.spyOn(require('@/utils/timezone.util').TimezoneUtil, 'currentDayOfWeek').mockReturnValue('monday');
    jest.spyOn(require('@/utils/timezone.util').TimezoneUtil, 'currentTimeInMinutes').mockReturnValue(8 * 60 + 30); // 08:30
    jest.spyOn(require('@/utils/timezone.util').TimezoneUtil, 'currentTimeString').mockReturnValue('08:30:00');
    const mockChannelsRepository = {
      find: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      findOne: jest.fn(),
    } as any;

    const mockEmailService = {
      sendEmail: jest.fn(),
    } as any;
    
    service = new YoutubeLiveService(configService, schedulesService, redisService, sentryService, mockEmailService, mockChannelsRepository);
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
      redisService.get.mockImplementation(async (key: string) => key === 'videoIdNotFound:handle' ? '1' : null);
      const result = await service.getLiveVideoId('cid', 'handle', 100, 'cron');
      expect(result).toBe('__SKIPPED__');
    });

    it('returns cached primary videoId if it is live', async () => {
      const cachedStatus = { 
        channelId: 'cid', 
        handle: 'handle', 
        isLive: true, 
        streamUrl: 'https://www.youtube.com/embed/cachedId?autoplay=1',
        videoId: 'cachedId', 
        streamCount: 1,
        streams: [{ videoId: 'cachedId', title: '', description: '', publishedAt: '', thumbnailUrl: '' }],
        lastUpdated: Date.now(),
        ttl: 100,
        blockEndTime: 1440,
        validationCooldown: Date.now() + 1800000,
        lastValidation: Date.now()
      };
      redisService.get.mockImplementation(async (key: string) => 
        key === 'liveStatusByHandle:handle' ? cachedStatus : null
      );
      jest.spyOn(service as any, 'isVideoLive').mockResolvedValue(true);
      const result = await service.getLiveVideoId('cid', 'handle', 100, 'cron');
      expect(result).toBe('cachedId');
    });

    it('deletes cached status if it is not live', async () => {
      const cachedStatus = { 
        channelId: 'cid', 
        handle: 'handle', 
        isLive: true, 
        streamUrl: 'https://www.youtube.com/embed/cachedId?autoplay=1',
        videoId: 'cachedId', 
        streamCount: 1,
        streams: [{ videoId: 'cachedId', title: '', description: '', publishedAt: '', thumbnailUrl: '' }],
        lastUpdated: Date.now(),
        ttl: 100,
        blockEndTime: 1440,
        validationCooldown: Date.now() + 1800000,
        lastValidation: Date.now()
      };
      redisService.get.mockImplementation(async (key: string) => 
        key === 'liveStatusByHandle:handle' ? cachedStatus : null
      );
      jest.spyOn(service as any, 'isVideoLive').mockResolvedValue(false);
      redisService.del.mockResolvedValue(undefined);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } });
      const result = await service.getLiveVideoId('cid', 'handle', 100, 'cron');
      expect(redisService.del).toHaveBeenCalledWith('liveStatusByHandle:handle');
      expect(result).toBe(null);
    });

    it('fetches from YouTube and caches status', async () => {
      redisService.get.mockResolvedValue(null);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [{ id: { videoId: 'vid123' } }] } });
      jest.spyOn(service as any, 'isVideoLive').mockResolvedValue(false);
      const result = await service.getLiveVideoId('cid', 'handle', 100, 'cron');
      expect(redisService.set).toHaveBeenCalledWith('liveStatusByHandle:handle', expect.objectContaining({
        channelId: 'cid',
        handle: 'handle',
        videoId: 'vid123',
        isLive: true,
        streams: expect.any(Array),
        streamCount: 1
      }), 100);
      // Should clear both not-found keys when video is found
      expect(redisService.del).toHaveBeenCalledWith('videoIdNotFound:handle');
      expect(redisService.del).toHaveBeenCalledWith('notFoundAttempts:handle');
      expect(result).toBe('vid123');
    });

    it('returns null and sets notFoundKey if no videoId found', async () => {
      redisService.get.mockResolvedValue(null);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } });
      const result = await service.getLiveVideoId('cid', 'handle', 100, 'cron');
      // Should set both the not-found key and attempt tracking
      expect(redisService.set).toHaveBeenCalledWith('videoIdNotFound:handle', '1', 900);
      expect(redisService.set).toHaveBeenCalledWith('notFoundAttempts:handle', expect.any(Object), expect.any(Number));
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
      schedulesService.findAll.mockResolvedValue([]);
      const spy = jest.spyOn(service, 'getLiveVideoId');
      await service.fetchLiveVideoIdsMain();
      expect(spy).not.toHaveBeenCalled();
    });

    it('calls getLiveStreams for channels with schedule', async () => {
      const schedules = [
        { program: { channel: { youtube_channel_id: 'cid1', handle: 'h1', is_visible: true }, is_live: true, name: 'Test Program 1' }, start_time: '08:00', end_time: '10:00', day_of_week: 'monday' },
        { program: { channel: { youtube_channel_id: 'cid2', handle: 'h2', is_visible: true }, is_live: true, name: 'Test Program 2' }, start_time: '08:00', end_time: '12:00', day_of_week: 'monday' },
      ];
      schedulesService.findAll.mockResolvedValue(schedules as any);
      
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
      
      jest.spyOn(service, 'getLiveStreamsMain').mockResolvedValueOnce(individualResults[0]);
      jest.spyOn(service, 'getLiveStreamsMain').mockResolvedValueOnce(individualResults[1]);
      jest.spyOn(require('@/utils/getBlockTTL.util'), 'getCurrentBlockTTL').mockResolvedValue(100);
      
      await service.fetchLiveVideoIdsMain();
      
      expect(service.getLiveStreamsMain).toHaveBeenCalledTimes(2);
      expect(service.getLiveStreamsMain).toHaveBeenCalledWith('cid1', 'h1', 100);
      expect(service.getLiveStreamsMain).toHaveBeenCalledWith('cid2', 'h2', 100);
    });

    it('passes SentryService to getCurrentBlockTTL', async () => {
      const schedules = [
        { program: { channel: { youtube_channel_id: 'cid1', handle: 'h1', is_visible: true }, is_live: true, name: 'Test Program' }, start_time: '08:00', end_time: '10:00', day_of_week: 'monday' },
      ];
      schedulesService.findAll.mockResolvedValue(schedules as any);
      jest.spyOn(service, 'getLiveStreamsMain').mockResolvedValue({
        streams: [{ videoId: 'vid1', title: 'Test Stream', publishedAt: '2023-01-01', description: 'Test', thumbnailUrl: '', channelTitle: 'Test Channel' }],
        primaryVideoId: 'vid1',
        streamCount: 1
      });
      
      const getCurrentBlockTTLSpy = jest.spyOn(require('@/utils/getBlockTTL.util'), 'getCurrentBlockTTL').mockResolvedValue(100);
      
      await service.fetchLiveVideoIdsMain();
      
      expect(getCurrentBlockTTLSpy).toHaveBeenCalledWith('cid1', schedules, sentryService);
    });
  });

  describe('validateCachedVideoId', () => {
    it('passes SentryService to getCurrentBlockTTL when refreshing video ID', async () => {
      const channelId = 'test-channel';
      const handle = 'test-handle';
      
      // Mock that there's a cached video ID with unified cache structure
      redisService.get.mockImplementation(async (key: string) => {
        if (key === 'liveStatusByHandle:test-handle') {
          return {
            channelId: 'test-channel',
            handle: 'test-handle',
            isLive: true,
            videoId: 'cached-video-id',
            lastUpdated: Date.now(),
            ttl: 100,
            blockEndTime: null,
            validationCooldown: Date.now() + 1800000,
            lastValidation: Date.now(),
            streams: [],
            streamCount: 0
          };
        }
        return null;
      });
      
      // Mock that the video is no longer live by mocking the private method
      (service as any).isVideoLive = jest.fn().mockResolvedValue(false);
      
      // Mock schedules service
      schedulesService.findByDay.mockResolvedValue([]);
      
      // Mock getLiveStreams to return a new streams result
      jest.spyOn(service, 'getLiveStreamsMain').mockResolvedValue({
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
      const result = await service.getLiveStreamsMain('cid', 'handle', 100);
      expect(result).toBe('__SKIPPED__');
    });

    it('returns __SKIPPED__ if notFoundKey is set in redis', async () => {
      redisService.get.mockImplementation(async (key: string) => key === 'videoIdNotFound:handle' ? '1' : null);
      const result = await service.getLiveStreamsMain('cid', 'handle', 100);
      expect(result).toBe('__SKIPPED__');
    });

    it('returns cached streams if they are still live', async () => {
      const mockStreams = [
        { videoId: 'vid1', title: 'Stream 1', publishedAt: '2023-01-01', description: 'Desc 1' },
        { videoId: 'vid2', title: 'Stream 2', publishedAt: '2023-01-01', description: 'Desc 2' }
      ];
      const cachedStatus = {
        channelId: 'cid',
        handle: 'handle',
        isLive: true,
        streamUrl: 'https://www.youtube.com/embed/vid1?autoplay=1',
        videoId: 'vid1',
        streams: mockStreams,
        streamCount: 2,
        lastUpdated: Date.now(),
        ttl: 100,
        blockEndTime: 1440,
        validationCooldown: Date.now() + 1800000,
        lastValidation: Date.now()
      };
      redisService.get.mockImplementation(async (key: string) => 
        key === 'liveStatusByHandle:handle' ? cachedStatus : null
      );
      jest.spyOn(service as any, 'isVideoLive').mockResolvedValue(true);
      
      const result = await service.getLiveStreamsMain('cid', 'handle', 100);
      
      expect(result).toEqual({
        streams: mockStreams,
        primaryVideoId: 'vid1',
        streamCount: 2
      });
    });

    it('deletes cached status if it is not live', async () => {
      const mockStreams = [{ videoId: 'vid1', title: 'Stream 1', publishedAt: '2023-01-01', description: 'Desc 1' }];
      const cachedStatus = {
        channelId: 'cid',
        handle: 'handle',
        isLive: true,
        streamUrl: 'https://www.youtube.com/embed/vid1?autoplay=1',
        videoId: 'vid1',
        streams: mockStreams,
        streamCount: 1,
        lastUpdated: Date.now(),
        ttl: 100,
        blockEndTime: 1440,
        validationCooldown: Date.now() + 1800000,
        lastValidation: Date.now()
      };
      redisService.get.mockImplementation(async (key: string) => 
        key === 'liveStatusByHandle:handle' ? cachedStatus : null
      );
      jest.spyOn(service as any, 'isVideoLive').mockResolvedValue(false);
      redisService.del.mockResolvedValue(undefined);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } });
      
      const result = await service.getLiveStreamsMain('cid', 'handle', 100);
      
      expect(redisService.del).toHaveBeenCalledWith('liveStatusByHandle:handle');
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
      jest.spyOn(service as any, 'isVideoLive').mockResolvedValue(true);
      
      const result = await service.getLiveStreamsMain('cid', 'handle', 100);
      
      expect(redisService.set).toHaveBeenCalledWith(
        'liveStatusByHandle:handle',
        expect.objectContaining({
          channelId: 'cid',
          handle: 'handle',
          videoId: 'vid1',
          isLive: true,
          streamUrl: 'https://www.youtube.com/embed/vid1?autoplay=1',
          lastUpdated: expect.any(Number),
          ttl: 100,
          blockEndTime: null,
          validationCooldown: expect.any(Number),
          lastValidation: expect.any(Number),
          streams: expect.arrayContaining([
            expect.objectContaining({
              videoId: 'vid1',
              title: 'Stream 1',
              publishedAt: '2023-01-01T00:00:00Z',
              description: 'Description 1',
              thumbnailUrl: 'thumb1.jpg',
              channelTitle: 'Test Channel'
            }),
            expect.objectContaining({
              videoId: 'vid2',
              title: 'Stream 2',
              publishedAt: '2023-01-01T01:00:00Z',
              description: 'Description 2',
              thumbnailUrl: 'thumb2.jpg',
              channelTitle: 'Test Channel'
            })
          ]),
          streamCount: 2
        }),
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
      
      const result = await service.getLiveStreamsMain('cid', 'handle', 100);
      
      expect(redisService.set).toHaveBeenCalledWith('videoIdNotFound:handle', '1', 900);
      expect(result).toBe(null);
    });

    it('returns null on axios error', async () => {
      redisService.get.mockResolvedValue(null);
      jest.spyOn(axios, 'get').mockRejectedValue(new Error('API Error'));
      
      const result = await service.getLiveStreamsMain('cid', 'handle', 100);
      
      expect(result).toBe(null);
    });

    it('handles malformed cached status gracefully', async () => {
      redisService.get.mockImplementation(async (key: string) => 
        key === 'liveStatusByHandle:handle' ? 'invalid-json' : null
      );
      redisService.del.mockResolvedValue(undefined);
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } });
      
      const result = await service.getLiveStreamsMain('cid', 'handle', 100);
      
      expect(redisService.del).toHaveBeenCalledWith('liveStatusByHandle:handle');
      expect(result).toBe(null);
    });
  });

  describe('Escalating Not-Found Strategy', () => {
    let mockEmailService: any;

    beforeEach(() => {
      mockEmailService = {
        sendEmail: jest.fn(),
      };
      service = new YoutubeLiveService(configService, schedulesService, redisService, sentryService, mockEmailService, {
        findOne: jest.fn(),
      } as any);
      configService.canFetchLive.mockResolvedValue(true);
    });

    describe('handleNotFoundEscalationMain', () => {
      it('creates first attempt tracking when no previous attempts exist', async () => {
        redisService.get.mockResolvedValue(null);
        redisService.set.mockResolvedValue(undefined);

        await (service as any).handleNotFoundEscalationMain('cid', 'handle', 'videoIdNotFound:handle');

        expect(redisService.set).toHaveBeenCalledWith('notFoundAttempts:handle', expect.any(Object), expect.any(Number));
        expect(redisService.set).toHaveBeenCalledWith('videoIdNotFound:handle', '1', 900);
        
        const trackingCall = redisService.set.mock.calls.find(call => call[0] === 'notFoundAttempts:handle');
        expect(trackingCall).toBeDefined();
        const trackingData = trackingCall![1];
        expect(trackingData).toMatchObject({
          attempts: 1,
          firstAttempt: expect.any(Number),
          lastAttempt: expect.any(Number),
          escalated: false
        });
      });

      it('increments attempt count on second attempt', async () => {
        const existingTracking = {
          attempts: 1,
          firstAttempt: Date.now() - 10000,
          lastAttempt: Date.now() - 10000,
          escalated: false
        };
        redisService.get.mockResolvedValue(existingTracking);
        redisService.set.mockResolvedValue(undefined);

        await (service as any).handleNotFoundEscalationMain('cid', 'handle', 'videoIdNotFound:handle');

        expect(redisService.set).toHaveBeenCalledWith('notFoundAttempts:handle', expect.any(Object), expect.any(Number));
        expect(redisService.set).toHaveBeenCalledWith('videoIdNotFound:handle', '1', 900);
        
        const trackingCall = redisService.set.mock.calls.find(call => call[0] === 'notFoundAttempts:handle');
        expect(trackingCall).toBeDefined();
        const trackingData = trackingCall![1];
        expect(trackingData.attempts).toBe(2);
        expect(trackingData.escalated).toBe(false);
      });

      it('escalates to program duration on third attempt', async () => {
        const existingTracking = {
          attempts: 2,
          firstAttempt: Date.now() - 20000,
          lastAttempt: Date.now() - 10000,
          escalated: false
        };
        redisService.get.mockResolvedValue(existingTracking);
        redisService.set.mockResolvedValue(undefined);
        
        // Mock getCurrentProgramEndTime to return a future timestamp
        jest.spyOn(service as any, 'getCurrentProgramEndTime').mockResolvedValue(Date.now() + 3600000); // 1 hour from now
        jest.spyOn(service as any, 'sendEscalationEmail').mockResolvedValue(undefined);

        await (service as any).handleNotFoundEscalationMain('cid', 'handle', 'videoIdNotFound:handle');

        expect(redisService.set).toHaveBeenCalledWith('notFoundAttempts:handle', expect.any(Object), expect.any(Number));
        expect(redisService.set).toHaveBeenCalledWith('videoIdNotFound:handle', '1', expect.any(Number));
        
        const trackingCall = redisService.set.mock.calls.find(call => call[0] === 'notFoundAttempts:handle');
        expect(trackingCall).toBeDefined();
        const trackingData = trackingCall![1];
        expect(trackingData.attempts).toBe(3);
        expect(trackingData.escalated).toBe(true);
        expect(trackingData.programEndTime).toBeDefined();
        
        expect((service as any).sendEscalationEmail).toHaveBeenCalledWith('cid', 'handle');
      });

      it('falls back to 1 hour TTL when program end time cannot be determined', async () => {
        const existingTracking = {
          attempts: 2,
          firstAttempt: Date.now() - 20000,
          lastAttempt: Date.now() - 10000,
          escalated: false
        };
        redisService.get.mockResolvedValue(existingTracking);
        redisService.set.mockResolvedValue(undefined);
        
        jest.spyOn(service as any, 'getCurrentProgramEndTime').mockResolvedValue(null);

        await (service as any).handleNotFoundEscalationMain('cid', 'handle', 'videoIdNotFound:handle');

        expect(redisService.set).toHaveBeenCalledWith('videoIdNotFound:handle', '1', 3600);
      });

      it('does not set not-found mark for back-to-back-fix cron on first attempt', async () => {
        redisService.get.mockResolvedValue(null);
        redisService.set.mockResolvedValue(undefined);
        jest.spyOn(service as any, 'getCurrentProgramEndTime').mockResolvedValue(Date.now() + 3600000);

        await (service as any).handleNotFoundEscalationBackToBack('cid', 'handle', 'videoIdNotFound:handle');

        expect(redisService.set).toHaveBeenCalledWith('notFoundAttempts:handle', expect.any(Object), expect.any(Number));
        expect(redisService.set).not.toHaveBeenCalledWith('videoIdNotFound:handle', '1', 900);
      });

      it('does not renew not-found mark for back-to-back-fix cron on second attempt', async () => {
        const existingTracking = {
          attempts: 1,
          firstAttempt: Date.now() - 20000,
          lastAttempt: Date.now() - 10000,
          escalated: false
        };
        redisService.get.mockResolvedValue(existingTracking);
        redisService.set.mockResolvedValue(undefined);
        jest.spyOn(service as any, 'getCurrentProgramEndTime').mockResolvedValue(Date.now() + 3600000);

        await (service as any).handleNotFoundEscalationBackToBack('cid', 'handle', 'videoIdNotFound:handle');

        expect(redisService.set).toHaveBeenCalledWith('notFoundAttempts:handle', expect.any(Object), expect.any(Number));
        expect(redisService.set).not.toHaveBeenCalledWith('videoIdNotFound:handle', '1', 900);
      });
    });

    describe('getCurrentProgramEndTime', () => {
      it('returns program end time for current program', async () => {
        const mockSchedules = [
          {
            program: { channel: { youtube_channel_id: 'cid' } },
            start_time: '14:30',
            end_time: '16:30'
          }
        ];
        schedulesService.findAll.mockResolvedValue(mockSchedules as any);
        
        // Mock TimezoneUtil methods directly
        jest.spyOn(require('@/utils/timezone.util').TimezoneUtil, 'currentDayOfWeek').mockReturnValue('tuesday'); // Tuesday
        jest.spyOn(require('@/utils/timezone.util').TimezoneUtil, 'currentTimeInMinutes').mockReturnValue(15 * 60); // 15:00
        jest.spyOn(require('@/utils/timezone.util').TimezoneUtil, 'todayAtTime').mockImplementation((time: string) => {
          const [hours, minutes] = time.split(':').map(Number);
          const date = new Date();
          date.setHours(hours, minutes, 0, 0);
          return { valueOf: () => date.getTime() };
        });

        const result = await (service as any).getCurrentProgramEndTime('cid');

        expect(result).toBeDefined();
        expect(typeof result).toBe('number');
      });

      it('returns null when no current program is found', async () => {
        schedulesService.findAll.mockResolvedValue([]);

        const result = await (service as any).getCurrentProgramEndTime('cid');

        expect(result).toBeNull();
      });

      it('handles errors gracefully', async () => {
        schedulesService.findAll.mockRejectedValue(new Error('Database error'));

        const result = await (service as any).getCurrentProgramEndTime('cid');

        expect(result).toBeNull();
      });
    });

    describe('sendEscalationEmail', () => {
      it('sends escalation email with correct details', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        
        const mockChannel = {
          name: 'Test Channel',
          programs: []
        };
        const mockChannelsRepository = {
          findOne: jest.fn().mockResolvedValue(mockChannel)
        } as any;
        service = new YoutubeLiveService(configService, schedulesService, redisService, sentryService, mockEmailService, mockChannelsRepository);

        const mockSchedules = [
          {
            program: { 
              channel: { youtube_channel_id: 'cid' },
              name: 'Test Program'
            },
            start_time: '14:00', // Start at 14:00
            end_time: '16:00'    // End at 16:00
          }
        ];
        schedulesService.findAll.mockResolvedValue(mockSchedules as any);
        
        // Mock TimezoneUtil methods directly
        jest.spyOn(require('@/utils/timezone.util').TimezoneUtil, 'currentDayOfWeek').mockReturnValue('tuesday'); // Tuesday
        jest.spyOn(require('@/utils/timezone.util').TimezoneUtil, 'currentTimeInMinutes').mockReturnValue(15 * 60); // 15:00 (900 minutes)

        await (service as any).sendEscalationEmail('cid', 'test_handle');

        expect(mockEmailService.sendEmail).toHaveBeenCalledWith({
          to: 'admin@laguiadelstreaming.com',
          subject: '🚨 Programa marcado como no encontrado - Test Program',
          html: expect.stringContaining('Test Program'),
          emailType: 'admin_alert',
        });
        
        process.env.NODE_ENV = originalEnv;
      });

      it('handles missing channel gracefully', async () => {
        const mockChannelsRepository = {
          findOne: jest.fn().mockResolvedValue(null)
        } as any;
        service = new YoutubeLiveService(configService, schedulesService, redisService, sentryService, mockEmailService, mockChannelsRepository);

        await (service as any).sendEscalationEmail('cid', 'test_handle');

        expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
      });

      it('handles email sending errors gracefully', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        
        const mockChannel = {
          name: 'Test Channel',
          programs: []
        };
        const mockChannelsRepository = {
          findOne: jest.fn().mockResolvedValue(mockChannel)
        } as any;
        service = new YoutubeLiveService(configService, schedulesService, redisService, sentryService, mockEmailService, mockChannelsRepository);

        mockEmailService.sendEmail.mockRejectedValue(new Error('Email error'));
        schedulesService.findAll.mockResolvedValue([]);

        await (service as any).sendEscalationEmail('cid', 'test_handle');

        expect(sentryService.captureException).toHaveBeenCalled();
        
        process.env.NODE_ENV = originalEnv;
      });
    });

    describe('convertTimeToMinutes', () => {
      it('converts time string to minutes correctly', () => {
        expect((service as any).convertTimeToMinutes('14:30')).toBe(870); // 14*60 + 30
        expect((service as any).convertTimeToMinutes('09:15')).toBe(555); // 9*60 + 15
        expect((service as any).convertTimeToMinutes('23:59')).toBe(1439); // 23*60 + 59
      });
    });

    describe('getBatchLiveStreams - Escalation Logic', () => {
      it('skips channels with active not-found flags', async () => {
        redisService.get.mockImplementation(async (key: string) => {
          if (key === 'videoIdNotFound:handle') return '1';
          return null;
        });

        const result = await (service as any).getBatchLiveStreams(
          ['cid'],
          'cron',
          new Map([['cid', 100]]),
          new Map([['cid', 'handle']]),
          'main'
        );

        expect(result.get('cid')).toBe('__SKIPPED__');
      });

      it('escalates on expiration when attempts >= 2', async () => {
        const attemptTracking = {
          attempts: 2,
          firstAttempt: Date.now() - 20000,
          lastAttempt: Date.now() - 10000,
          escalated: false
        };
        
        redisService.get.mockImplementation(async (key: string) => {
          if (key === 'notFoundAttempts:handle') return attemptTracking;
          return null; // No active not-found flag (expired)
        });
        
        redisService.set.mockResolvedValue(undefined);
        jest.spyOn(service as any, 'getCurrentProgramEndTime').mockResolvedValue(Date.now() + 3600000);
        jest.spyOn(service as any, 'sendEscalationEmail').mockResolvedValue(undefined);

        const result = await (service as any).getBatchLiveStreams(
          ['cid'],
          'cron',
          new Map([['cid', 100]]),
          new Map([['cid', 'handle']]),
          'main'
        );

        expect(result.get('cid')).toBe('__SKIPPED__');
        expect(redisService.set).toHaveBeenCalledWith('videoIdNotFound:handle', '1', expect.any(Number));
        expect(redisService.set).toHaveBeenCalledWith('notFoundAttempts:handle', expect.any(Object), expect.any(Number));
        expect((service as any).sendEscalationEmail).toHaveBeenCalledWith('cid', 'handle');
      });

      it('ignores not-found flags for back-to-back-fix cron and increments attempt counter', async () => {
        redisService.get.mockImplementation(async (key: string) => {
          if (key === 'videoIdNotFound:handle') return '1';
          if (key === 'notFoundAttempts:handle') return { attempts: 1, firstAttempt: Date.now(), lastAttempt: Date.now(), escalated: false };
          return null;
        });
        
        jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } });

        const result = await (service as any).getBatchLiveStreams(
          ['cid'],
          'cron',
          new Map([['cid', 100]]),
          new Map([['cid', 'handle']]),
          'back-to-back-fix'
        );

        expect(result.get('cid')).toBe(null); // Should attempt fetch, not skip
        
        // Should call incrementNotFoundAttempts which updates attempt counter without setting new not-found flags
        expect(redisService.set).toHaveBeenCalledWith('notFoundAttempts:handle', expect.any(Object), expect.any(Number));
        // Should NOT set videoIdNotFound since back-to-back-fix doesn't set new not-found flags
        expect(redisService.set).not.toHaveBeenCalledWith('videoIdNotFound:handle', '1', 900);
      });

      it('ignores not-found flags for manual cron', async () => {
        redisService.get.mockImplementation(async (key: string) => {
          if (key === 'videoIdNotFound:handle') return '1';
          return null;
        });
        
        jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } });

        const result = await (service as any).getBatchLiveStreams(
          ['cid'],
          'cron',
          new Map([['cid', 100]]),
          new Map([['cid', 'handle']]),
          'manual'
        );

        expect(result.get('cid')).toBe(null); // Should attempt fetch, not skip
      });

      it('skips escalated channels until program end', async () => {
        const attemptTracking = {
          attempts: 3,
          firstAttempt: Date.now() - 30000,
          lastAttempt: Date.now() - 20000,
          escalated: true,
          programEndTime: Date.now() + 1800000 // 30 minutes from now
        };
        
        redisService.get.mockImplementation(async (key: string) => {
          if (key === 'videoIdNotFound:handle') return '1';
          if (key === 'notFoundAttempts:handle') return JSON.stringify(attemptTracking);
          return null;
        });

        const result = await (service as any).getBatchLiveStreams(
          ['cid'],
          'cron',
          new Map([['cid', 100]]),
          new Map([['cid', 'handle']]),
          'main'
        );

        expect(result.get('cid')).toBe('__SKIPPED__');
      });
    });

    describe('sendEscalationEmail', () => {
      it('skips sending email in non-production environments', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'staging';
        
        const loggerSpy = jest.spyOn(service['logger'], 'debug').mockImplementation();
        
        await (service as any).sendEscalationEmail('cid', 'handle');
        
        expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Escalation email skipped'));
        
        process.env.NODE_ENV = originalEnv;
        loggerSpy.mockRestore();
      });

      it('sends email in production environment', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        
        const mockChannel = { name: 'Test Channel', programs: [] };
        const mockChannelsRepository = {
          findOne: jest.fn().mockResolvedValue(mockChannel)
        } as any;
        
        service = new YoutubeLiveService(configService, schedulesService, redisService, sentryService, mockEmailService, mockChannelsRepository);
        schedulesService.findAll.mockResolvedValue([]);
        mockEmailService.sendEmail.mockResolvedValue(undefined);
        
        await (service as any).sendEscalationEmail('cid', 'handle');
        
        expect(mockEmailService.sendEmail).toHaveBeenCalled();
        
        process.env.NODE_ENV = originalEnv;
      });
    });
  });
}); 