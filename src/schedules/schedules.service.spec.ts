import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesService } from './schedules.service';
import { Schedule } from './schedules.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Program } from '../programs/programs.entity';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

describe('SchedulesService', () => {
  let service: SchedulesService;
  let schedulesRepo: Repository<Schedule>;
  let programsRepo: Repository<Program>;
  let cacheManager: Cache;

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
      name: 'Programa A',
      description: 'desc',
      channel: mockChannel,
      panelists: [],
      logo_url: null,
      youtube_url: null,
      schedules: [],
    },
  ];

  const mockSchedules: Schedule[] = [
    {
      id: 1,
      day_of_week: 'monday',
      start_time: '10:00',
      end_time: '12:00',
      program: mockPrograms[0],
    },
  ];

  const mockSchedulesRepository = {
    find: jest.fn(),
    findOne: jest.fn().mockImplementation(({ where: { id } }) =>
      Promise.resolve(mockSchedules.find(s => s.id === id))
    ),
    findAndCount: jest.fn().mockResolvedValue([mockSchedules, mockSchedules.length]),
    save: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    create: jest.fn().mockImplementation((data) => ({
      id: 2,
      ...data,
    })),
  };

  const mockProgramRepo = {
    findOne: jest.fn().mockImplementation(({ where: { id } }) =>
      Promise.resolve(mockPrograms.find(p => p.id === id))
    ),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulesService,
        {
          provide: getRepositoryToken(Schedule),
          useValue: mockSchedulesRepository,
        },
        {
          provide: getRepositoryToken(Program),
          useValue: mockProgramRepo,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
      ],
    }).compile();

    service = module.get<SchedulesService>(SchedulesService);
    schedulesRepo = module.get(getRepositoryToken(Schedule));
    programsRepo = module.get(getRepositoryToken(Program));
    cacheManager = module.get(CACHE_MANAGER);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('debería devolver todos los schedules', async () => {
    const result = await service.findAll();
    expect(result).toEqual({
      data: mockSchedules,
      total: mockSchedules.length
    });
    expect(schedulesRepo.findAndCount).toHaveBeenCalled();
  });

  it('debería devolver un schedule por ID', async () => {
    const result = await service.findOne('1');
    expect(result).toEqual(mockSchedules[0]);
    expect(schedulesRepo.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      relations: ['program', 'program.channel', 'program.panelists'],
    });
  });

  it('debería lanzar NotFoundException si el schedule no existe', async () => {
    mockSchedulesRepository.findOne.mockResolvedValueOnce(null);
    await expect(service.findOne('999')).rejects.toThrow(NotFoundException);
  });

  it('debería crear un nuevo schedule si el programa existe', async () => {
    const dto = {
      dayOfWeek: 'monday',
      startTime: '08:00',
      endTime: '10:00',
      programId: '1',
      channelId: '1',
    };

    const result = await service.create(dto);
    expect(result).toMatchObject({
      id: 2,
      day_of_week: 'monday',
      start_time: '08:00',
      end_time: '10:00',
      program: mockPrograms[0],
    });
    expect(programsRepo.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(schedulesRepo.save).toHaveBeenCalled();
  });

  it('debería lanzar NotFoundException si el programa no existe', async () => {
    mockProgramRepo.findOne.mockResolvedValueOnce(null);

    const dto = {
      dayOfWeek: 'monday',
      startTime: '08:00',
      endTime: '10:00',
      programId: '999',
      channelId: '1',
    };

    await expect(service.create(dto)).rejects.toThrow(NotFoundException);
  });

  it('debería eliminar un schedule', async () => {
    const result = await service.remove('1');
    expect(result).toBe(true);
    expect(schedulesRepo.delete).toHaveBeenCalledWith('1');
  });
});
