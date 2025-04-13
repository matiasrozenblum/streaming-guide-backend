import { Test, TestingModule } from '@nestjs/testing';
import { ProgramsService } from './programs.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Program } from './programs.entity';
import { NotFoundException } from '@nestjs/common';
import { CreateProgramDto } from './dto/create-program.dto';

describe('ProgramsService', () => {
  let service: ProgramsService;
  let repository: Repository<Program>;

  const mockChannel = {
    id: 1,
    name: 'Luzu TV',
    description: 'Canal de streaming',
    logo_url: 'https://logo.com/luzu.png',
    streaming_url: 'https://youtube.com/luzu',
    programs: [],
  };

  const mockPrograms: Program[] = [
    {
      id: 1,
      name: 'Programa 1',
      description: 'Descripción 1',
      start_time: '10:00',
      end_time: '12:00',
      channel: mockChannel,
      schedules: [],
      panelists: [],
      logo_url: null,
      youtube_url: null,
    },
    {
      id: 2,
      name: 'Programa 2',
      description: 'Descripción 2',
      start_time: '14:00',
      end_time: '16:00',
      channel: mockChannel,
      schedules: [],
      panelists: [],
      logo_url: null,
      youtube_url: null,
    },
  ];

  const mockProgram = {
    id: 1,
    name: 'Test Program',
    description: 'Test Description',
    start_time: '10:00',
    end_time: '11:00',
    youtube_url: 'https://youtube.com/test',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgramsService,
        {
          provide: getRepositoryToken(Program),
          useValue: {
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
          },
        },
      ],
    }).compile();

    service = module.get<ProgramsService>(ProgramsService);
    repository = module.get<Repository<Program>>(getRepositoryToken(Program));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return an array of programs', async () => {
    const result = await service.findAll();
    expect(result).toEqual([mockProgram]);
    expect(repository.find).toHaveBeenCalled();
  });

  it('should return a single program', async () => {
    const result = await service.findOne(1);
    expect(result).toEqual(mockProgram);
    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('should throw NotFoundException for non-existent program', async () => {
    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });

  it('should create a new program', async () => {
    const createDto: CreateProgramDto = {
      name: 'Test Program',
      description: 'Test Description',
      start_time: '10:00',
      end_time: '11:00',
      youtube_url: 'https://youtube.com/test',
    };

    const result = await service.create(createDto);
    expect(result).toEqual(mockProgram);
    expect(repository.create).toHaveBeenCalledWith(createDto);
    expect(repository.save).toHaveBeenCalled();
  });

  it('should remove a program', async () => {
    await service.remove(1);
    expect(repository.delete).toHaveBeenCalledWith(1);
  });
});
