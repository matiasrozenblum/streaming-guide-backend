import { Test, TestingModule } from '@nestjs/testing';
import { ProgramsService } from './programs.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Program } from './programs.entity';
import { Panelist } from '../panelists/panelists.entity';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { CreateProgramDto } from './dto/create-program.dto';

describe('ProgramsService', () => {
  let service: ProgramsService;
  let programRepository: Partial<Repository<Program>>;
  let panelistRepository: Partial<Repository<Panelist>>;

  const mockChannel = {
    id: 1,
    name: 'Luzu TV',
    description: 'Canal de streaming',
    logo_url: 'https://logo.com/luzu.png',
    streaming_url: 'https://youtube.com/luzu',
    programs: [],
    youtube_channel_id: 'test-channel-id',
  };

  const mockPrograms: Program[] = [
    {
      id: 1,
      name: 'Programa 1',
      description: 'Descripción 1',
      channel: mockChannel,
      schedules: [],
      panelists: [],
      logo_url: null,
      youtube_url: null,
      is_live: false,
      stream_url: null,
    },
    {
      id: 2,
      name: 'Programa 2',
      description: 'Descripción 2',
      channel: mockChannel,
      schedules: [],
      panelists: [],
      logo_url: null,
      youtube_url: null,
      is_live: false,
      stream_url: null, 
    },
  ];

  const mockProgram = {
    id: 1,
    name: 'Test Program',
    description: 'Test Description',
    channel: mockChannel,
    schedules: [],
    panelists: [],
    logo_url: null,
    youtube_url: 'https://youtube.com/test',
    is_live: false,
    stream_url: null,
  };

  beforeEach(async () => {
    programRepository = {
      find: jest.fn().mockResolvedValue([mockProgram]),
      findOne: jest.fn().mockImplementation(({ where: { id } }) => {
        if (id === 1) {
          return Promise.resolve(mockProgram);
        }
        return Promise.resolve(null);
      }),
      create: jest.fn().mockReturnValue(mockProgram),
      save: jest.fn().mockResolvedValue(mockProgram),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    panelistRepository = {
      findOne: jest.fn(),
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
      ],
    }).compile();

    service = module.get<ProgramsService>(ProgramsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return an array of programs', async () => {
    const result = await service.findAll();
    expect(result).toEqual([mockProgram]);
    expect(programRepository.find).toHaveBeenCalled();
  });

  it('should return a single program', async () => {
    const result = await service.findOne(1);
    expect(result).toEqual(mockProgram);
    expect(programRepository.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      relations: ['panelists'],
    });
  });

  it('should throw NotFoundException for non-existent program', async () => {
    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });

  it('should create a new program', async () => {
    const createDto: CreateProgramDto = {
      name: 'Test Program',
      description: 'Test Description',
      youtube_url: 'https://youtube.com/test',
    };

    const result = await service.create(createDto);
    expect(result).toEqual(mockProgram);
    expect(programRepository.create).toHaveBeenCalledWith(createDto);
    expect(programRepository.save).toHaveBeenCalled();
  });

  it('should remove a program', async () => {
    await service.remove(1);
    expect(programRepository.delete).toHaveBeenCalledWith(1);
  });
});
