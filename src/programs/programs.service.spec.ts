import { Test, TestingModule } from '@nestjs/testing';
import { ProgramsService } from './programs.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Program } from './programs.entity';
import { Panelist } from '../panelists/panelists.entity';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { CreateProgramDto } from './dto/create-program.dto';
import { Channel } from '../channels/channels.entity';
import { RedisService } from '../redis/redis.service';

describe('ProgramsService', () => {
  let service: ProgramsService;
  let programRepository: Partial<Repository<Program>>;
  let panelistRepository: Partial<Repository<Panelist>>;
  let channelRepository: Partial<Repository<Channel>>;

  const mockChannel = {
    id: 1,
    name: 'Luzu TV',
    description: 'Canal de streaming',
    logo_url: 'https://logo.com/luzu.png',
    handle: 'luzu',
    programs: [],
    youtube_channel_id: 'test-channel-id',
  };

  const mockProgram = {
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
    },
    panelists: [],
    logo_url: null,
    youtube_url: 'https://youtube.com/test',
    is_live: false,
    stream_url: null,
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
    channel_id: 1,
    channel_name: 'Luzu TV',
  };

  beforeEach(async () => {
    let queryId: number | null = null;

    const mockQueryBuilder = {
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
    };

    channelRepository = {
      findOne: jest.fn().mockResolvedValue(mockChannel),
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
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            delByPattern: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProgramsService>(ProgramsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return an array of programs', async () => {
    const result = await service.findAll();
    expect(result).toEqual([mockProgramResponse]);
    expect(programRepository.createQueryBuilder).toHaveBeenCalledWith('program');
  });

  it('should return a single program', async () => {
    const result = await service.findOne(1);
    expect(result).toEqual(mockProgramResponse);
    expect(programRepository.createQueryBuilder).toHaveBeenCalledWith('program');
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

    const result = await service.create(createDto);
    expect(result).toEqual(mockProgramResponse);
    expect(programRepository.create).toHaveBeenCalledWith(createDto);
    expect(programRepository.save).toHaveBeenCalled();
  });

  it('should remove a program', async () => {
    await service.remove(1);
    expect(programRepository.delete).toHaveBeenCalledWith(1);
  });
});
