import { Test, TestingModule } from '@nestjs/testing';
import { ProgramsService } from './programs.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Program } from './programs.entity';
import { NotFoundException } from '@nestjs/common';
import { CreateProgramDto } from './dto/create-program.dto';

describe('ProgramsService', () => {
  let service: ProgramsService;
  let repo: Repository<Program>;

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

  const mockRepository = {
    find: jest.fn().mockResolvedValue(mockPrograms),
    findOne: jest.fn().mockImplementation(({ where: { id } }) =>
      Promise.resolve(mockPrograms.find((p) => p.id === id)),
    ),
    create: jest.fn().mockImplementation((dto) => ({ id: 3, ...dto })),
    save: jest.fn().mockImplementation((program) => Promise.resolve(program)),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgramsService,
        {
          provide: getRepositoryToken(Program),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ProgramsService>(ProgramsService);
    repo = module.get<Repository<Program>>(getRepositoryToken(Program));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return all programs', async () => {
    const result = await service.findAll();
    expect(result).toEqual(mockPrograms);
    expect(repo.find).toHaveBeenCalledWith({ relations: ['channel'] });
  });

  it('should return a program by ID', async () => {
    const result = await service.findOne('1');
    expect(result).toEqual(mockPrograms[0]);
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('should throw NotFoundException if program not found', async () => {
    mockRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
  });

  it('should create and save a program', async () => {
    const dto: CreateProgramDto = {
      name: 'Nuevo Programa',
      description: 'Descripción nueva',
    };

    const result = await service.create(dto);
    expect(result).toMatchObject({
      id: 3,
      name: 'Nuevo Programa',
      description: 'Descripción nueva',
    });
    expect(repo.create).toHaveBeenCalledWith(dto);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining(dto));
  });

  it('should delete a program', async () => {
    await service.remove('1');
    expect(repo.delete).toHaveBeenCalledWith('1');
  });
});
