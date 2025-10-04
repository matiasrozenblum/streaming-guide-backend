import { Test, TestingModule } from '@nestjs/testing';
import { ChannelsService } from './channels.service';
import { Channel } from './channels.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DeleteResult } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { DataSource } from 'typeorm';
import { Program } from '../programs/programs.entity';
import { Schedule } from '../schedules/schedules.entity';
import { UserSubscription } from '../users/user-subscription.entity';
import { Device } from '../users/device.entity';
import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';
import { YoutubeDiscoveryService } from '../youtube/youtube-discovery.service';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';
import { ConfigService } from '../config/config.service';
import { WeeklyOverridesService } from '../schedules/weekly-overrides.service';
import { YoutubeLiveService } from '../youtube/youtube-live.service';
import { Category } from '../categories/categories.entity';

describe('ChannelsService', () => {
  let service: ChannelsService;
  let repo: Repository<Channel>;
  let notifyUtil: NotifyAndRevalidateUtil;

  const mockChannels: Channel[] = [
    { id: 1, name: 'Luzu TV', logo_url: 'https://logo1.png', handle: 'stream1', programs: [], description: 'Luzu TV is a streaming channel.', youtube_channel_id: 'channel1', order: 1, is_visible: true, background_color: null, show_only_when_scheduled: false, categories: [] },
    { id: 2, name: 'Olga', logo_url: 'https://logo2.png', handle: 'stream2', programs: [], description: 'Olga is a streaming channel.', youtube_channel_id: 'channel2', order: 2, is_visible: true, background_color: null, show_only_when_scheduled: false, categories: [] },
  ];

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(null),
  };

  const mockRepository = {
    find: jest.fn().mockResolvedValue(mockChannels),
    findOne: jest.fn().mockImplementation(({ where: { id }, relations }) =>
      Promise.resolve(mockChannels.find((c) => c.id === id)),
    ),
    create: jest.fn().mockImplementation((dto) => ({ id: 3, ...dto, programs: [] })),
    save: jest.fn().mockImplementation((channel) => Promise.resolve(channel)),
    delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] } as DeleteResult),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  const mockProgramRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockScheduleRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockUserSubscriptionRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockDeviceRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockCategoryRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    findByIds: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue({
      connect: jest.fn(),
      release: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      manager: {
        save: jest.fn(),
        findOne: jest.fn(),
      },
    }),
    transaction: jest.fn().mockImplementation(async (callback) => {
      const manager = {
        update: jest.fn(),
      };
      return callback(manager);
    }),
  };

  const mockSchedulesService = {
    findAll: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delByPattern: jest.fn(),
  };

  const mockYoutubeDiscoveryService = {
    getChannelIdFromHandle: jest.fn(),
  };

  const mockConfigService = {
    canFetchLive: jest.fn().mockResolvedValue(true),
  };

  const mockWeeklyOverridesService = {
    getWeekStartDate: jest.fn(),
    applyWeeklyOverrides: jest.fn(),
  };

  const mockYoutubeLiveService = {
    getLiveStreams: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelsService,
        {
          provide: getRepositoryToken(Channel),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Program),
          useValue: mockProgramRepository,
        },
        {
          provide: getRepositoryToken(Schedule),
          useValue: mockScheduleRepository,
        },
        {
          provide: getRepositoryToken(UserSubscription),
          useValue: mockUserSubscriptionRepository,
        },
        {
          provide: getRepositoryToken(Device),
          useValue: mockDeviceRepository,
        },
        {
          provide: getRepositoryToken(Category),
          useValue: mockCategoryRepository,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: SchedulesService,
          useValue: mockSchedulesService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: YoutubeDiscoveryService,
          useValue: mockYoutubeDiscoveryService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: WeeklyOverridesService,
          useValue: mockWeeklyOverridesService,
        },
        {
          provide: YoutubeLiveService,
          useValue: mockYoutubeLiveService,
        },
      ],
    }).compile();

    service = module.get<ChannelsService>(ChannelsService);
    repo = module.get<Repository<Channel>>(getRepositoryToken(Channel));
    notifyUtil = new NotifyAndRevalidateUtil(
      mockRedisService as any,
      'https://frontend.test',
      'testsecret'
    );
    service['notifyUtil'] = notifyUtil;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return all channels', async () => {
    const result = await service.findAll();
    expect(result).toEqual(mockChannels);
    expect(repo.find).toHaveBeenCalled();
  });

  it('should return a channel by ID', async () => {
    const result = await service.findOne(1);
    expect(result).toEqual(mockChannels[0]);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      relations: ['categories'],
    });
  });

  it('should throw NotFoundException if channel not found', async () => {
    mockRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });

  it('should create and save a channel', async () => {
    const dto: CreateChannelDto = {
      name: 'Nueva Señal',
      description: 'This is a new channel.',
      logo_url: 'https://logo3.png',
      handle: 'stream3',
    };
    const mockWithOrder = {
      ...dto,
      order: 1,
    };

    const result = await service.create(dto);
    expect(result).toMatchObject({
      id: 3,
      ...dto,
    });
    expect(repo.create).toHaveBeenCalledWith(mockWithOrder);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining(mockWithOrder));
  });

  it('should delete a channel', async () => {
    await service.remove(1);
    expect(repo.delete).toHaveBeenCalledWith(1);
  });

  it('should throw NotFoundException when deleting non-existent channel', async () => {
    jest.spyOn(repo, 'delete').mockResolvedValueOnce({ affected: 0, raw: [] } as DeleteResult);
    await expect(service.remove(999)).rejects.toThrow(NotFoundException);
  });

  describe('create with categories', () => {
    const mockCategories: Category[] = [
      {
        id: 1,
        name: 'Deportes',
        description: 'Canales de deportes',
        color: '#FF6B6B',
        order: 1,
        channels: [],
      },
      {
        id: 2,
        name: 'Noticias',
        description: 'Canales de noticias',
        color: '#4ECDC4',
        order: 2,
        channels: [],
      },
    ];

    it('should create a channel with categories', async () => {
      const createDto: CreateChannelDto = {
        name: 'Test Channel',
        handle: 'test',
        description: 'Test Description',
        category_ids: [1, 2],
      };

      const createdChannel = {
        id: 3,
        ...createDto,
        programs: [],
        categories: mockCategories,
      };

      mockCategoryRepository.findByIds.mockResolvedValue(mockCategories);
      mockRepository.create.mockReturnValue(createdChannel);
      mockRepository.save.mockResolvedValue(createdChannel);

      const result = await service.create(createDto);

      expect(mockCategoryRepository.findByIds).toHaveBeenCalledWith([1, 2]);
      expect(mockRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        name: createDto.name,
        handle: createDto.handle,
        description: createDto.description,
        order: expect.any(Number),
      }));
      expect(mockRepository.save).toHaveBeenCalledWith(createdChannel);
      expect(result).toEqual(createdChannel);
    });

    it('should create a channel without categories', async () => {
      const createDto: CreateChannelDto = {
        name: 'Test Channel',
        handle: 'test',
        description: 'Test Description',
      };

      const createdChannel = {
        id: 3,
        ...createDto,
        programs: [],
        categories: [],
      };

      mockRepository.create.mockReturnValue(createdChannel);
      mockRepository.save.mockResolvedValue(createdChannel);
      mockCategoryRepository.findByIds.mockClear();

      const result = await service.create(createDto);

      expect(mockCategoryRepository.findByIds).not.toHaveBeenCalled();
      expect(mockRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        ...createDto,
        order: expect.any(Number),
      }));
      expect(result).toEqual(createdChannel);
    });

    it('should create a channel with empty category_ids array', async () => {
      const createDto: CreateChannelDto = {
        name: 'Test Channel',
        handle: 'test',
        description: 'Test Description',
        category_ids: [],
      };

      const createdChannel = {
        id: 3,
        ...createDto,
        programs: [],
        categories: [],
      };

      mockRepository.create.mockReturnValue(createdChannel);
      mockRepository.save.mockResolvedValue(createdChannel);
      mockCategoryRepository.findByIds.mockClear();
      mockCategoryRepository.findByIds.mockResolvedValue([]);

      const result = await service.create(createDto);

      expect(mockCategoryRepository.findByIds).not.toHaveBeenCalled();
      expect(result).toEqual(createdChannel);
    });
  });

  describe('update', () => {
    it('should update a channel', async () => {
      const updateDto: UpdateChannelDto = {
        name: 'Updated Channel',
        description: 'Updated Description',
      };

      const existingChannel = { ...mockChannels[0], categories: [] };
      const updatedChannel = { ...existingChannel, ...updateDto };

      mockRepository.findOne.mockResolvedValue(existingChannel);
      mockRepository.save.mockResolvedValue(updatedChannel);

      const result = await service.update(1, updateDto);
      expect(result).toEqual(updatedChannel);
      expect(repo.save).toHaveBeenCalled();
    });

    it('should handle partial updates', async () => {
      const updateDto: UpdateChannelDto = {
        name: 'Updated Channel',
      };

      const existingChannel = { ...mockChannels[0], categories: [] };
      const updatedChannel = { ...existingChannel, ...updateDto };

      mockRepository.findOne.mockResolvedValue(existingChannel);
      mockRepository.save.mockResolvedValue(updatedChannel);

      const result = await service.update(1, updateDto);
      expect(result).toEqual(updatedChannel);
      expect(repo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when channel is not found', async () => {
      jest.spyOn(repo, 'findOne').mockResolvedValueOnce(null);
      await expect(service.update(1, { name: 'Updated Channel' })).rejects.toThrow(NotFoundException);
    });

    it('should update a channel with categories', async () => {
      const mockCategories: Category[] = [
        {
          id: 1,
          name: 'Deportes',
          description: 'Canales de deportes',
          color: '#FF6B6B',
          order: 1,
          channels: [],
        },
      ];

      const updateDto: UpdateChannelDto = {
        name: 'Updated Channel',
        category_ids: [1],
      };

      const existingChannel = {
        ...mockChannels[0],
        categories: [],
      };

      const updatedChannel = {
        ...existingChannel,
        ...updateDto,
        categories: mockCategories,
      };

      mockRepository.findOne.mockResolvedValue(existingChannel);
      mockCategoryRepository.findByIds.mockResolvedValue(mockCategories);
      mockRepository.save.mockResolvedValue(updatedChannel);

      const result = await service.update(1, updateDto);

      expect(mockCategoryRepository.findByIds).toHaveBeenCalledWith([1]);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
        ...existingChannel,
        name: updateDto.name,
        categories: mockCategories,
      }));
      expect(result).toEqual(updatedChannel);
    });

    it('should update a channel by clearing categories', async () => {
      const updateDto: UpdateChannelDto = {
        name: 'Updated Channel',
        category_ids: [],
      };

      const existingChannel = {
        ...mockChannels[0],
        categories: [{ id: 1, name: 'Deportes' } as Category],
      };

      const updatedChannel = {
        ...existingChannel,
        ...updateDto,
        categories: [],
      };

      mockRepository.findOne.mockResolvedValue(existingChannel);
      mockCategoryRepository.findByIds.mockResolvedValue([]);
      mockRepository.save.mockResolvedValue(updatedChannel);

      const result = await service.update(1, updateDto);

      expect(mockCategoryRepository.findByIds).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
        ...existingChannel,
        name: updateDto.name,
        categories: [],
      }));
      expect(result).toEqual(updatedChannel);
    });

    it('should update a channel without changing categories', async () => {
      const updateDto: UpdateChannelDto = {
        name: 'Updated Channel',
      };

      const existingChannel = {
        ...mockChannels[0],
        categories: [{ id: 1, name: 'Deportes' } as Category],
      };

      const updatedChannel = {
        ...existingChannel,
        ...updateDto,
      };

      mockRepository.findOne.mockResolvedValue(existingChannel);
      mockRepository.save.mockResolvedValue(updatedChannel);

      const result = await service.update(1, updateDto);

      expect(mockCategoryRepository.findByIds).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
        ...existingChannel,
        ...updateDto,
        categories: existingChannel.categories,
      }));
      expect(result).toEqual(updatedChannel);
    });
  });

  describe('getChannelsWithSchedules', () => {
    it('should include categories in channels with schedules response', async () => {
      const mockCategories: Category[] = [
        {
          id: 1,
          name: 'Deportes',
          description: 'Canales de deportes',
          color: '#FF6B6B',
          order: 1,
          channels: [],
        },
      ];

      const mockChannelWithCategories = {
        ...mockChannels[0],
        categories: mockCategories,
      };

      const mockSchedules = [
        {
          id: 1,
          day_of_week: 'monday',
          start_time: '10:00:00',
          end_time: '11:00:00',
          program: {
            id: 1,
            name: 'Test Program',
            logo_url: 'test-logo.png',
            description: 'Test Description',
            stream_url: null,
            is_live: false,
            panelists: [],
            style_override: null,
          },
        },
      ];

      jest.spyOn(repo, 'find').mockResolvedValueOnce([mockChannelWithCategories]);
      mockSchedulesService.findAll.mockResolvedValueOnce(mockSchedules);

      const result = await service.getChannelsWithSchedules();

      expect(repo.find).toHaveBeenCalledWith({
        where: { is_visible: true },
        order: { order: 'ASC' },
        relations: ['categories'],
      });

      expect(result).toEqual([
        {
          channel: {
            id: mockChannelWithCategories.id,
            name: mockChannelWithCategories.name,
            logo_url: mockChannelWithCategories.logo_url,
            background_color: mockChannelWithCategories.background_color,
            show_only_when_scheduled: mockChannelWithCategories.show_only_when_scheduled,
            categories: mockCategories,
          },
          schedules: expect.any(Array),
        },
      ]);
    });

    it('should handle channels without categories', async () => {
      const mockChannelWithoutCategories = {
        ...mockChannels[0],
        categories: [],
      };

      const mockSchedules = [];

      jest.spyOn(repo, 'find').mockResolvedValueOnce([mockChannelWithoutCategories]);
      mockSchedulesService.findAll.mockResolvedValueOnce(mockSchedules);

      const result = await service.getChannelsWithSchedules();

      expect(result).toEqual([
        {
          channel: {
            id: mockChannelWithoutCategories.id,
            name: mockChannelWithoutCategories.name,
            logo_url: mockChannelWithoutCategories.logo_url,
            background_color: mockChannelWithoutCategories.background_color,
            show_only_when_scheduled: mockChannelWithoutCategories.show_only_when_scheduled,
            categories: [],
          },
          schedules: [],
        },
      ]);
    });
  });

  describe('notifyAndRevalidate integration', () => {
    it('calls notifyAndRevalidate on create', async () => {
      const spy = jest.spyOn(notifyUtil, 'notifyAndRevalidate').mockResolvedValue(undefined as any);
      jest.spyOn(repo, 'create').mockReturnValue({ id: 1 } as any);
      jest.spyOn(repo, 'save').mockResolvedValue({ id: 1 } as any);
      jest.spyOn(mockYoutubeDiscoveryService, 'getChannelIdFromHandle').mockResolvedValue({ channelId: 'ytid' });
      await service.create({ name: 'Test', handle: 'test' });
      expect(spy).toHaveBeenCalled();
    });
    it('calls notifyAndRevalidate on update', async () => {
      const spy = jest.spyOn(notifyUtil, 'notifyAndRevalidate').mockResolvedValue(undefined as any);
      jest.spyOn(service, 'findOne').mockResolvedValue({ id: 1 } as any);
      jest.spyOn(repo, 'save').mockResolvedValue({ id: 1 } as any);
      await service.update(1, { name: 'Updated' });
      expect(spy).toHaveBeenCalled();
    });
    it('calls notifyAndRevalidate on remove', async () => {
      const spy = jest.spyOn(notifyUtil, 'notifyAndRevalidate').mockResolvedValue(undefined as any);
      jest.spyOn(repo, 'delete').mockResolvedValue({ affected: 1 } as any);
      await service.remove(1);
      expect(spy).toHaveBeenCalled();
    });
    it('calls notifyAndRevalidate on reorder', async () => {
      const spy = jest.spyOn(notifyUtil, 'notifyAndRevalidate').mockResolvedValue(undefined as any);
      jest.spyOn(mockDataSource, 'transaction').mockImplementation(async (cb: any) => { await cb({ update: jest.fn() }); });
      jest.spyOn(mockRedisService, 'delByPattern').mockResolvedValue(undefined as any);
      await service.reorder([1, 2, 3]);
      expect(spy).toHaveBeenCalled();
    });
  });
});
