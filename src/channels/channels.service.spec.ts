import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ChannelsService } from './channels.service';
import { Channel } from './channels.entity';
import { Program } from '../programs/programs.entity';
import { Schedule } from '../schedules/schedules.entity';
import { UserSubscription } from '../users/user-subscription.entity';
import { Device } from '../users/device.entity';
import { Category } from '../categories/categories.entity';
import { RedisService } from '../redis/redis.service';
import { SchedulesService } from '../schedules/schedules.service';
import { OptimizedSchedulesService } from '../youtube/optimized-schedules.service';
import { YoutubeDiscoveryService } from '../youtube/youtube-discovery.service';
import { YoutubeLiveService } from '../youtube/youtube-live.service';
import { ConfigService } from '../config/config.service';
import { WeeklyOverridesService } from '../schedules/weekly-overrides.service';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';

describe('ChannelsService - Channel Handle Change Detection', () => {
  let service: ChannelsService;
  let channelsRepository: Repository<Channel>;
  let redisService: RedisService;
  let schedulesService: SchedulesService;
  let youtubeDiscoveryService: YoutubeDiscoveryService;

  const mockChannel = {
    id: 1,
    name: 'Test Channel',
    handle: '@oldhandle',
    youtube_channel_id: 'OLD_YOUTUBE_ID_123',
    logo_url: 'test-logo.png',
    description: 'Test description',
    order: 1,
    is_visible: true,
    background_color: '#000000',
    show_only_when_scheduled: false,
  };

  const mockUpdateDto = {
    handle: '@newhandle',
    name: 'Updated Channel',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsService,
        {
          provide: getRepositoryToken(Channel),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Program),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Schedule),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserSubscription),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Device),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Category),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findByIds: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            del: jest.fn(),
            get: jest.fn(),
            set: jest.fn(),
          },
        },
        {
          provide: SchedulesService,
          useValue: {
            warmSchedulesCache: jest.fn(),
          },
        },
        {
          provide: OptimizedSchedulesService,
          useValue: {},
        },
        {
          provide: YoutubeDiscoveryService,
          useValue: {
            getChannelIdFromHandle: jest.fn(),
          },
        },
        {
          provide: YoutubeLiveService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: {
            canFetchLive: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: WeeklyOverridesService,
          useValue: {},
        },
        {
          provide: NotifyAndRevalidateUtil,
          useValue: {
            notifyAndRevalidate: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
    channelsRepository = module.get<Repository<Channel>>(getRepositoryToken(Channel));
    redisService = module.get<RedisService>(RedisService);
    schedulesService = module.get<SchedulesService>(SchedulesService);
    youtubeDiscoveryService = module.get<YoutubeDiscoveryService>(YoutubeDiscoveryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Channel Handle Change Detection', () => {
    it('should invalidate live status caches when handle changes', async () => {
      // Arrange
      const mockChannelWithNewHandle = {
        ...mockChannel,
        handle: '@newhandle',
        youtube_channel_id: 'NEW_YOUTUBE_ID_456',
      };

      jest.spyOn(channelsRepository, 'findOne').mockResolvedValue(mockChannel as any);
      jest.spyOn(channelsRepository, 'save').mockResolvedValue(mockChannelWithNewHandle as any);
      jest.spyOn(youtubeDiscoveryService, 'getChannelIdFromHandle').mockResolvedValue({
        channelId: 'NEW_YOUTUBE_ID_456',
        title: 'New Channel Title',
      });
      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);

      // Act
      await service.update(1, mockUpdateDto);

      // Assert
      expect(youtubeDiscoveryService.getChannelIdFromHandle).toHaveBeenCalledWith('@newhandle');
      expect(redisService.del).toHaveBeenCalledWith('liveStatus:OLD_YOUTUBE_ID_123');
    });

    it('should not invalidate live status caches when handle does not change', async () => {
      // Arrange
      const mockUpdateDtoNoHandleChange = {
        name: 'Updated Channel Name',
        description: 'Updated description',
      };

      jest.spyOn(channelsRepository, 'findOne').mockResolvedValue(mockChannel as any);
      jest.spyOn(channelsRepository, 'save').mockResolvedValue(mockChannel as any);
      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);

      // Act
      await service.update(1, mockUpdateDtoNoHandleChange);

      // Assert
      expect(youtubeDiscoveryService.getChannelIdFromHandle).not.toHaveBeenCalled();
      expect(redisService.del).not.toHaveBeenCalledWith(expect.stringContaining('liveStreamsByChannel:'));
      expect(redisService.del).not.toHaveBeenCalledWith(expect.stringContaining('liveStatus:background:'));
    });

    it('should handle YouTube channel ID resolution failure gracefully', async () => {
      // Arrange
      const mockChannelWithOldHandle = {
        ...mockChannel,
        handle: '@oldhandle', // Old handle
        youtube_channel_id: 'OLD_YOUTUBE_ID_123',
      };
      
      jest.spyOn(channelsRepository, 'findOne').mockResolvedValue(mockChannelWithOldHandle as any);
      jest.spyOn(channelsRepository, 'save').mockResolvedValue(mockChannelWithOldHandle as any);
      jest.spyOn(youtubeDiscoveryService, 'getChannelIdFromHandle').mockResolvedValue(null);
      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);

      // Act
      await service.update(1, mockUpdateDto);

      // Assert
      expect(youtubeDiscoveryService.getChannelIdFromHandle).toHaveBeenCalledWith('@newhandle');
      // Should still invalidate old caches even if new channel ID resolution fails
      expect(redisService.del).toHaveBeenCalledWith('liveStatus:OLD_YOUTUBE_ID_123');
    });

    it('should handle cache invalidation errors gracefully', async () => {
      // Arrange
      const mockChannelWithOldHandle = {
        ...mockChannel,
        handle: '@oldhandle', // Old handle
        youtube_channel_id: 'OLD_YOUTUBE_ID_123',
      };
      
      const mockChannelWithNewHandle = {
        ...mockChannel,
        handle: '@newhandle',
        youtube_channel_id: 'NEW_YOUTUBE_ID_456',
      };

      jest.spyOn(channelsRepository, 'findOne').mockResolvedValue(mockChannelWithOldHandle as any);
      jest.spyOn(channelsRepository, 'save').mockResolvedValue(mockChannelWithNewHandle as any);
      jest.spyOn(youtubeDiscoveryService, 'getChannelIdFromHandle').mockResolvedValue({
        channelId: 'NEW_YOUTUBE_ID_456',
        title: 'New Channel Title',
      });
      jest.spyOn(redisService, 'del').mockRejectedValue(new Error('Redis error'));

      // Act & Assert - should not throw
      await expect(service.update(1, mockUpdateDto)).resolves.not.toThrow();
      expect(youtubeDiscoveryService.getChannelIdFromHandle).toHaveBeenCalledWith('@newhandle');
      // Note: The cache invalidation error is handled gracefully in the service
    });

    it('should not invalidate caches when YouTube channel ID remains the same', async () => {
      // Arrange
      const mockChannelWithOldHandle = {
        ...mockChannel,
        handle: '@oldhandle', // Old handle
        youtube_channel_id: 'OLD_YOUTUBE_ID_123',
      };
      
      const mockChannelWithSameYouTubeId = {
        ...mockChannel,
        handle: '@newhandle',
        youtube_channel_id: 'OLD_YOUTUBE_ID_123', // Same YouTube ID
      };

      jest.spyOn(channelsRepository, 'findOne').mockResolvedValue(mockChannelWithOldHandle as any);
      jest.spyOn(channelsRepository, 'save').mockResolvedValue(mockChannelWithSameYouTubeId as any);
      jest.spyOn(youtubeDiscoveryService, 'getChannelIdFromHandle').mockResolvedValue({
        channelId: 'OLD_YOUTUBE_ID_123', // Same YouTube ID
        title: 'Same Channel Title',
      });
      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);

      // Act
      await service.update(1, mockUpdateDto);

      // Assert
      expect(youtubeDiscoveryService.getChannelIdFromHandle).toHaveBeenCalledWith('@newhandle');
      // Should not invalidate caches since YouTube channel ID is the same
      expect(redisService.del).not.toHaveBeenCalledWith('liveStatus:OLD_YOUTUBE_ID_123');
    });
  });
});