import { Test, TestingModule } from '@nestjs/testing';
import { LiveStatusBackgroundService } from './live-status-background.service';
import { YoutubeLiveService } from './youtube-live.service';
import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Channel } from '../channels/channels.entity';

// Mock TimezoneUtil
jest.mock('../utils/timezone.util', () => ({
  TimezoneUtil: {
    currentDayOfWeek: jest.fn().mockReturnValue('monday'),
    currentTimeInMinutes: jest.fn().mockReturnValue(630), // 10:30 AM
    now: jest.fn().mockReturnValue({
      diff: jest.fn().mockReturnValue(1800), // 30 minutes in seconds
      format: jest.fn().mockReturnValue('10:30:00'),
    }),
    todayAtTime: jest.fn().mockReturnValue({
      diff: jest.fn().mockReturnValue(1800), // 30 minutes in seconds
      format: jest.fn().mockReturnValue('11:00:00'),
    }),
    formatForLogging: jest.fn().mockReturnValue('10:30:00'),
  },
}));

describe('LiveStatusBackgroundService (Approach B)', () => {
  let service: LiveStatusBackgroundService;
  let youtubeLiveService: YoutubeLiveService;
  let schedulesService: SchedulesService;
  let redisService: RedisService;
  let configService: ConfigService;

  const mockLiveStatusCache = {
    channelId: 'CHANNEL_123',
    handle: 'testchannel',
    isLive: true,
    streamUrl: 'https://www.youtube.com/embed/VIDEO_123?autoplay=1',
    videoId: 'VIDEO_123',
    lastUpdated: Date.now(),
    ttl: 300,
    blockEndTime: 660, // 11:00 AM
    validationCooldown: Date.now() + (30 * 60 * 1000),
    lastValidation: Date.now(),
    streams: [
      {
        videoId: 'VIDEO_123',
        title: 'Test Live Stream',
        description: 'Test description',
        thumbnailUrl: 'https://example.com/thumb.jpg',
        publishedAt: new Date().toISOString(),
      }
    ],
    streamCount: 1,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiveStatusBackgroundService,
        {
          provide: YoutubeLiveService,
          useValue: {
            getLiveStreams: jest.fn(),
            getLiveStreamsMain: jest.fn(),
            isVideoLive: jest.fn(),
          },
        },
        {
          provide: SchedulesService,
          useValue: {
            findAll: jest.fn(),
            findByDay: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            canFetchLive: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: getRepositoryToken(Channel),
          useValue: {
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LiveStatusBackgroundService>(LiveStatusBackgroundService);
    youtubeLiveService = module.get<YoutubeLiveService>(YoutubeLiveService);
    schedulesService = module.get<SchedulesService>(SchedulesService);
    redisService = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCachedLiveStatus', () => {
    it('should return cached live status for a channel', async () => {
      // Arrange
      const channelId = 'CHANNEL_123';
      jest.spyOn(redisService, 'get').mockResolvedValue(mockLiveStatusCache);

      // Act
      const result = await service.getCachedLiveStatus(channelId);

      // Assert
      expect(redisService.get).toHaveBeenCalledWith(`liveStatus:${channelId}`);
      expect(result).toEqual(mockLiveStatusCache);
    });

    it('should return null when no cached data exists', async () => {
      // Arrange
      const channelId = 'CHANNEL_123';
      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      // Act
      const result = await service.getCachedLiveStatus(channelId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getLiveStatusForChannels', () => {
    it('should return cached data when available and not expired', async () => {
      // Arrange
      const channelIds = ['CHANNEL_123'];
      const mockCached = { ...mockLiveStatusCache, lastUpdated: Date.now() - 1000 }; // 1 second ago
      jest.spyOn(service, 'getCachedLiveStatus').mockResolvedValue(mockCached);
      jest.spyOn(service as any, 'shouldUpdateCache').mockResolvedValue(false);
      jest.spyOn(service as any, 'updateChannelsInBatches').mockResolvedValue(new Map());

      // Act
      const result = await service.getLiveStatusForChannels(channelIds);

      // Assert
      expect(result.get('CHANNEL_123')).toEqual(mockCached);
      expect(service['updateChannelsInBatches']).not.toHaveBeenCalled();
    });

    it('should update cache when data is expired', async () => {
      // Arrange
      const channelIds = ['CHANNEL_123'];
      const mockCached = { ...mockLiveStatusCache, lastUpdated: Date.now() - 10000 }; // 10 seconds ago
      jest.spyOn(service, 'getCachedLiveStatus').mockResolvedValue(mockCached);
      jest.spyOn(service as any, 'shouldUpdateCache').mockResolvedValue(true);
      jest.spyOn(service as any, 'updateChannelsInBatches').mockResolvedValue(new Map([['CHANNEL_123', mockLiveStatusCache]]));

      // Act
      const result = await service.getLiveStatusForChannels(channelIds);

      // Assert
      expect(service['updateChannelsInBatches']).toHaveBeenCalledWith(['CHANNEL_123']);
      expect(result.get('CHANNEL_123')).toEqual(mockLiveStatusCache);
    });
  });

  describe('updateLiveStatusForAllChannels', () => {
    it('should update live status for all visible channels', async () => {
      // Arrange
      const mockChannels = [
        {
          id: 1,
          name: 'Test Channel',
          handle: 'testchannel',
          youtube_channel_id: 'CHANNEL_123',
          logo_url: '',
          description: '',
          order: 1,
          is_visible: true,
          background_color: '',
          show_only_when_scheduled: false,
          created_at: new Date(),
          updated_at: new Date(),
          categories: [],
          programs: []
        }
      ];
      jest.spyOn(service['channelsRepository'], 'find').mockResolvedValue(mockChannels);
      jest.spyOn(service as any, 'updateChannelsInBatches').mockResolvedValue(new Map([['CHANNEL_123', mockLiveStatusCache]]));

      // Act
      await (service as any).updateLiveStatusForAllChannels();

      // Assert
      expect(service['channelsRepository'].find).toHaveBeenCalledWith({
        where: { is_visible: true },
        select: ['id', 'name', 'handle', 'youtube_channel_id']
      });
      expect(service['updateChannelsInBatches']).toHaveBeenCalledWith(['CHANNEL_123']);
    });

    it('should handle no channels gracefully', async () => {
      // Arrange
      jest.spyOn(service['channelsRepository'], 'find').mockResolvedValue([]);
      jest.spyOn(service as any, 'updateChannelsInBatches').mockResolvedValue(new Map());

      // Act
      await (service as any).updateLiveStatusForAllChannels();

      // Assert
      expect(service['updateChannelsInBatches']).not.toHaveBeenCalled();
    });

    it('should handle repository errors gracefully', async () => {
      // Arrange
      jest.spyOn(service['channelsRepository'], 'find').mockRejectedValue(new Error('Database error'));

      // Act & Assert
      await expect((service as any).updateLiveStatusForAllChannels()).resolves.not.toThrow();
    });
  });

  describe('unified cache structure', () => {
    it('should store streams data in the unified cache', async () => {
      // Arrange
      const channelId = 'CHANNEL_123';
      const mockLiveStreamsResult = {
        streams: [
          {
            videoId: 'VIDEO_123',
            title: 'Test Live Stream',
            description: 'Test description',
            thumbnailUrl: 'https://example.com/thumb.jpg',
            publishedAt: new Date().toISOString(),
          }
        ],
        primaryVideoId: 'VIDEO_123',
        streamCount: 1,
      };
      
      // Create a schedule that is currently live (current time is 10:30 AM, so 10:00-11:00 works)
      const mockSchedules = [
        {
          id: 1,
          day_of_week: 'monday', // Matches the mocked currentDayOfWeek
          start_time: '10:00:00', // Starts at 10:00 AM
          end_time: '11:00:00',   // Ends at 11:00 AM (current time 10:30 AM is between these)
          program: {
            id: 1,
            name: 'Test Program',
            channel: {
              id: 1,
              youtube_channel_id: channelId,
              handle: 'testchannel',
            }
          }
        }
      ];

      jest.spyOn(schedulesService, 'findAll').mockImplementation((options) => {
        // Mock the findAll method to return schedules when called with the expected parameters
        if (options?.dayOfWeek && options?.liveStatus === false && options?.applyOverrides === true) {
          return Promise.resolve(mockSchedules);
        }
        return Promise.resolve([]);
      });
      jest.spyOn(schedulesService, 'findByDay').mockResolvedValue(mockSchedules);
      jest.spyOn(youtubeLiveService, 'getLiveStreamsMain').mockResolvedValue(mockLiveStreamsResult);
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);
      jest.spyOn(configService, 'canFetchLive').mockResolvedValue(true);

      // Act
      const result = await (service as any).updateChannelLiveStatus(channelId);

      // Assert
      expect(result).toEqual(expect.objectContaining({
        channelId,
        isLive: true,
        streams: mockLiveStreamsResult.streams,
        streamCount: 1,
      }));
      expect(redisService.set).toHaveBeenCalledWith(
        `liveStatus:${channelId}`,
        expect.objectContaining({
          streams: mockLiveStreamsResult.streams,
          streamCount: 1,
        }),
        expect.any(Number)
      );
    });
  });
});
