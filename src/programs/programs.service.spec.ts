import { Test, TestingModule } from '@nestjs/testing';
import { ProgramsService } from './programs.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Program } from './programs.entity';
import { Panelist } from '../panelists/panelists.entity';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { CreateProgramDto } from './dto/create-program.dto';
import { Channel } from '../channels/channels.entity';
import { Schedule } from '../schedules/schedules.entity';
import { RedisService } from '../redis/redis.service';
import { SchedulesService } from '../schedules/schedules.service';
import { WeeklyOverridesService } from '../schedules/weekly-overrides.service';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';

describe('ProgramsService', () => {
  let service: ProgramsService;
  let programRepository: Partial<Repository<Program>>;
  let panelistRepository: Partial<Repository<Panelist>>;
  let channelRepository: Partial<Repository<Channel>>;
  let weeklyOverridesService: { deleteOverridesForProgram: jest.Mock };
  let mockQueryBuilder: any;
  let notifyUtil: NotifyAndRevalidateUtil;

  const mockChannel = {
    id: 1,
    name: 'Luzu TV',
    description: 'Canal de streaming',
    logo_url: 'https://logo.com/luzu.png',
    handle: 'luzu',
    programs: [],
    youtube_channel_id: 'test-channel-id',
    is_visible: true,
  };

  const _mockProgram = {
    id: 1,
    name: 'Test Program',
    description: 'Test Description',
    channel_id: 1,
    panelists: [],
    logo_url: null,
    youtube_url: 'https://youtube.com/test',
    is_live: false,
    stream_url: null,
  };

  const mockProgramWithChannel = {
    id: 1,
    name: 'Test Program',
    description: 'Test Description',
    channel: {
      id: 1,
      name: 'Luzu TV',
      description: 'Canal de streaming',
      logo_url: 'https://logo.com/luzu.png',
      handle: 'luzu',
      programs: [],
      youtube_channel_id: 'test-channel-id',
      is_visible: true,
    },
    panelists: [],
    logo_url: null,
    youtube_url: 'https://youtube.com/test',
    is_live: false,
    stream_url: null,
    is_visible: true,
    is_premiere: false,
    style_override: null,
    link_group_id: null,
  };

  const mockProgramResponse = {
    id: 1,
    name: 'Test Program',
    description: 'Test Description',
    panelists: [],
    logo_url: null,
    youtube_url: 'https://youtube.com/test',
    is_live: false,
    stream_url: null,
    is_visible: true,
    is_premiere: false,
    style_override: null,
    link_group_id: null,
    channel_id: 1,
    channel_name: 'Luzu TV',
  };

  beforeEach(async () => {
    let queryId: number | null = null;

    mockQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockImplementation((condition, params) => {
        if (params?.id) {
          queryId = params.id;
        }
        return mockQueryBuilder;
      }),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockProgramWithChannel]),
      getOne: jest.fn().mockImplementation(() => {
        if (queryId === 999) {
          return Promise.resolve(null);
        }
        return Promise.resolve(mockProgramWithChannel);
      }),
    };

    programRepository = {
      find: jest.fn().mockResolvedValue([mockProgramWithChannel]),
      findOne: jest.fn().mockImplementation(({ where: { id } }) => {
        if (id === 1) {
          return Promise.resolve(mockProgramWithChannel);
        }
        return Promise.resolve(null);
      }),
      create: jest.fn().mockReturnValue(mockProgramWithChannel),
      save: jest.fn().mockResolvedValue(mockProgramWithChannel),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    panelistRepository = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };

    channelRepository = {
      findOne: jest.fn().mockResolvedValue(mockChannel),
    };

    weeklyOverridesService = {
      deleteOverridesForProgram: jest.fn().mockResolvedValue(2),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgramsService,
        {
          provide: getRepositoryToken(Program),
          useValue: programRepository,
        },
        {
          provide: getRepositoryToken(Panelist),
          useValue: panelistRepository,
        },
        {
          provide: getRepositoryToken(Channel),
          useValue: channelRepository,
        },
        {
          provide: getRepositoryToken(Schedule),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            save: jest.fn(),
            create: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            delByPattern: jest.fn(),
          },
        },
        {
          provide: WeeklyOverridesService,
          useValue: weeklyOverridesService,
        },
        {
          provide: SchedulesService,
          useValue: {
            warmSchedulesCache: jest.fn(),
            debouncedWarmSchedulesCache: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProgramsService>(ProgramsService);
    notifyUtil = new NotifyAndRevalidateUtil(
      module.get<RedisService>(RedisService),
      'https://frontend.test',
      'testsecret',
    );
    service['notifyUtil'] = notifyUtil;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return an array of programs', async () => {
    const result = await service.findAll();
    expect(result).toEqual([mockProgramResponse]);
    expect(programRepository.createQueryBuilder).toHaveBeenCalledWith(
      'program',
    );
  });

  it('should return a single program', async () => {
    const result = await service.findOne(1);
    expect(result).toEqual(mockProgramResponse);
    expect(programRepository.createQueryBuilder).toHaveBeenCalledWith(
      'program',
    );
  });

  it('should throw NotFoundException for non-existent program', async () => {
    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });

  it('should create a new program', async () => {
    const createDto: CreateProgramDto = {
      name: 'Test Program',
      description: 'Test Description',
      youtube_url: 'https://youtube.com/test',
      channel_id: 1,
    };

    const spy = jest
      .spyOn(service['notifyUtil'], 'notifyAndRevalidate')
      .mockResolvedValue(undefined as any);
    const result = await service.create(createDto);
    expect(result).toEqual(mockProgramResponse);
    expect(programRepository.create).toHaveBeenCalledWith(createDto);
    expect(programRepository.save).toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
  });

  it('should update an existing program', async () => {
    const updateDto: CreateProgramDto = {
      name: 'Updated Program',
      description: 'Updated Description',
      youtube_url: 'https://youtube.com/updated',
      channel_id: 1,
    };

    const spy = jest
      .spyOn(service['notifyUtil'], 'notifyAndRevalidate')
      .mockResolvedValue(undefined as any);
    const result = await service.update(1, updateDto);
    expect(result).toEqual({
      id: 1,
      name: 'Updated Program',
      description: 'Updated Description',
      panelists: [],
      logo_url: null,
      youtube_url: 'https://youtube.com/updated',
      is_live: false,
      stream_url: null,
      is_visible: true,
      is_premiere: false,
      style_override: null,
      link_group_id: null,
      channel_id: 1,
      channel_name: 'Luzu TV',
    });
    expect(programRepository.createQueryBuilder).toHaveBeenCalledWith(
      'program',
    );
    expect(programRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        name: 'Updated Program',
        description: 'Updated Description',
        youtube_url: 'https://youtube.com/updated',
        channel: mockChannel,
      }),
    );
    expect(spy).toHaveBeenCalled();
  });

  it('should update program channel_id correctly', async () => {
    const newChannel = {
      id: 2,
      name: 'New Channel',
      description: 'New channel description',
      logo_url: 'https://logo.com/new.png',
      handle: 'newchannel',
      programs: [],
      youtube_channel_id: 'new-channel-id',
      is_visible: true,
    };

    (channelRepository.findOne as jest.Mock).mockResolvedValueOnce(newChannel);

    const updateDto = {
      name: 'Updated Program',
      channel_id: 2,
    };

    // Mock the save method to return the updated program
    const updatedProgram = {
      id: 1,
      name: 'Updated Program',
      description: 'Test Description',
      channel: newChannel,
      panelists: [],
      logo_url: null,
      youtube_url: 'https://youtube.com/test',
      is_live: false,
      stream_url: null,
    };
    (programRepository.save as jest.Mock).mockResolvedValueOnce(updatedProgram);

    const spy = jest
      .spyOn(service['notifyUtil'], 'notifyAndRevalidate')
      .mockResolvedValue(undefined as any);
    const result = await service.update(1, updateDto);

    expect(result).toEqual({
      id: 1,
      name: 'Updated Program',
      description: 'Test Description',
      panelists: [],
      logo_url: null,
      youtube_url: 'https://youtube.com/test',
      is_live: false,
      stream_url: null,
      is_visible: undefined,
      is_premiere: undefined,
      style_override: undefined,
      link_group_id: null,
      channel_id: 2,
      channel_name: 'New Channel',
    });

    expect(channelRepository.findOne).toHaveBeenCalledWith({
      where: { id: 2 },
    });
    expect(programRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        name: 'Updated Program',
        channel: newChannel,
      }),
    );
    expect(spy).toHaveBeenCalled();
  });

  it('should throw NotFoundException when updating to non-existent channel', async () => {
    (channelRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

    const updateDto = {
      name: 'Updated Program',
      channel_id: 999,
    };

    await expect(service.update(1, updateDto)).rejects.toThrow(
      NotFoundException,
    );
    expect(channelRepository.findOne).toHaveBeenCalledWith({
      where: { id: 999 },
    });
  });

  it('should remove a program and delete its weekly overrides', async () => {
    // Mock program with schedules
    const programWithSchedules = {
      ...mockProgramWithChannel,
      schedules: [{ id: 10 }, { id: 11 }],
    };
    (programRepository.findOne as jest.Mock).mockResolvedValueOnce(
      programWithSchedules,
    );
    const spy = jest
      .spyOn(service['notifyUtil'], 'notifyAndRevalidate')
      .mockResolvedValue(undefined as any);
    await service.remove(1);
    expect(
      weeklyOverridesService.deleteOverridesForProgram,
    ).toHaveBeenCalledWith(1, [10, 11]);
    expect(programRepository.delete).toHaveBeenCalledWith(1);
    expect(spy).toHaveBeenCalled();
  });

  describe('panelist propagation to linked programs', () => {
    const panelist = { id: 7, name: 'Panelista' };

    const linkedProgram = (id: number, panelists: any[]) => ({
      ...mockProgramWithChannel,
      id,
      link_group_id: 'group-1',
      panelists,
    });

    beforeEach(() => {
      jest
        .spyOn(service['notifyUtil'], 'notifyAndRevalidate')
        .mockResolvedValue(undefined as any);
    });

    it('addPanelist batches the linked saves and cache deletions into one call each', async () => {
      const source = linkedProgram(1, []);
      const other2 = linkedProgram(2, []);
      const other3 = linkedProgram(3, []);
      mockQueryBuilder.getOne.mockResolvedValueOnce(source);
      (panelistRepository.findOne as jest.Mock).mockResolvedValueOnce(panelist);
      (programRepository.find as jest.Mock).mockResolvedValueOnce([
        source,
        other2,
        other3,
      ]);

      await service.addPanelist(1, 7);

      // 1 save for the source program + 1 batched save for the linked ones
      expect(programRepository.save).toHaveBeenCalledTimes(2);
      expect(programRepository.save).toHaveBeenLastCalledWith([other2, other3]);
      expect(other2.panelists).toContain(panelist);
      expect(other3.panelists).toContain(panelist);

      const redis = service['redisService'];
      expect(redis.del).toHaveBeenCalledWith(['programs:2', 'programs:3']);
    });

    it('addPanelist skips linked programs that already have the panelist', async () => {
      const source = linkedProgram(1, []);
      const alreadyHasIt = linkedProgram(2, [panelist]);
      mockQueryBuilder.getOne.mockResolvedValueOnce(source);
      (panelistRepository.findOne as jest.Mock).mockResolvedValueOnce(panelist);
      (programRepository.find as jest.Mock).mockResolvedValueOnce([
        source,
        alreadyHasIt,
      ]);

      await service.addPanelist(1, 7);

      // only the source program is saved; nothing to propagate
      expect(programRepository.save).toHaveBeenCalledTimes(1);
      const redis = service['redisService'];
      expect(redis.del).not.toHaveBeenCalledWith(['programs:2']);
    });

    it('removePanelist only saves and invalidates the linked programs that changed', async () => {
      const source = linkedProgram(1, [panelist]);
      const hadPanelist = linkedProgram(2, [panelist]);
      const untouched = linkedProgram(3, [{ id: 99, name: 'Otro' }]);
      mockQueryBuilder.getOne.mockResolvedValueOnce(source);
      (programRepository.find as jest.Mock).mockResolvedValueOnce([
        source,
        hadPanelist,
        untouched,
      ]);

      await service.removePanelist(1, 7);

      expect(programRepository.save).toHaveBeenCalledTimes(2);
      expect(programRepository.save).toHaveBeenLastCalledWith([hadPanelist]);
      expect(hadPanelist.panelists).toEqual([]);

      const redis = service['redisService'];
      expect(redis.del).toHaveBeenCalledWith(['programs:2']);
      expect(redis.del).not.toHaveBeenCalledWith(['programs:3']);
    });

    it('does not touch linked programs when the program has no link_group_id', async () => {
      mockQueryBuilder.getOne.mockResolvedValueOnce({
        ...mockProgramWithChannel,
        link_group_id: null,
        panelists: [],
      });
      (panelistRepository.findOne as jest.Mock).mockResolvedValueOnce(panelist);

      await service.addPanelist(1, 7);

      expect(programRepository.find).not.toHaveBeenCalled();
      expect(programRepository.save).toHaveBeenCalledTimes(1);
    });
  });
});
