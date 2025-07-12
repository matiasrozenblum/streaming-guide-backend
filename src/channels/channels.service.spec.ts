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

describe('ChannelsService', () => {
  let service: ChannelsService;
  let repo: Repository<Channel>;
  let notifyUtil: NotifyAndRevalidateUtil;

  const mockChannels: Channel[] = [
    { id: 1, name: 'Luzu TV', logo_url: 'https://logo1.png', handle: 'stream1', programs: [], description: 'Luzu TV is a streaming channel.', youtube_channel_id: 'channel1', order: 1 },
    { id: 2, name: 'Olga', logo_url: 'https://logo2.png', handle: 'stream2', programs: [], description: 'Olga is a streaming channel.', youtube_channel_id: 'channel2', order: 2 },
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

  describe('update', () => {
    it('should update a channel', async () => {
      const updateDto: UpdateChannelDto = {
        name: 'Updated Channel',
        description: 'Updated Description',
      };

      const result = await service.update(1, updateDto);
      expect(result).toEqual(mockChannels[0]);
      expect(repo.save).toHaveBeenCalled();
    });

    it('should handle partial updates', async () => {
      const updateDto: UpdateChannelDto = {
        name: 'Updated Channel',
      };

      const result = await service.update(1, updateDto);
      expect(result).toEqual(mockChannels[0]);
      expect(repo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when channel is not found', async () => {
      jest.spyOn(repo, 'findOne').mockResolvedValueOnce(null);
      await expect(service.update(1, { name: 'Updated Channel' })).rejects.toThrow(NotFoundException);
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
