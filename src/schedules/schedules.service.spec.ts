import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesService } from './schedules.service';
import { Schedule } from './schedules.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Program } from '../programs/programs.entity';
import { NotFoundException } from '@nestjs/common';
import { channel } from 'diagnostics_channel';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

describe('SchedulesService', () => {
  let service: SchedulesService;
  let schedulesRepo: Repository<Schedule>;
  let programsRepo: Repository<Program>;
  let cacheManager: Cache;

  const mockSchedules: Schedule[] = [
    {
      id: 1,
      day_of_week: 'monday',
      start_time: '10:00',
      end_time: '12:00',
      program: { id: 1 } as Program,
    },
  ];

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

  const mockScheduleRepo = {
    find: jest.fn().mockResolvedValue(mockSchedules),
    findOne: jest.fn().mockImplementation((options) => {
      const id = options.where.id;
      const schedule = mockSchedules.find(s => s.id === id);
      if (schedule && options.relations) {
        return {
          ...schedule,
          program: {
            ...schedule.program,
            channel: mockChannel,
            panelists: [],
          },
        };
      }
      return schedule;
    }),
    create: jest.fn().mockImplementation((data) => ({ id: 2, ...data })),
    save: jest.fn().mockImplementation((schedule) => Promise.resolve(schedule)),
    delete: jest.fn().mockResolvedValue(undefined),
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
          useValue: mockScheduleRepo,
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
    expect(result).toEqual(mockSchedules);
    expect(schedulesRepo.find).toHaveBeenCalled();
  });

  it('debería devolver un schedule por ID', async () => {
    const result = await service.findOne('1');
    expect(result).toEqual({
      ...mockSchedules[0],
      program: {
        ...mockSchedules[0].program,
        channel: mockChannel,
        panelists: [],
      },
    });
    expect(schedulesRepo.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      relations: ['program', 'program.channel', 'program.panelists'],
    });
  });

  it('debería lanzar NotFoundException si el schedule no existe', async () => {
    mockScheduleRepo.findOne.mockResolvedValueOnce(null);
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
    expect(schedulesRepo.create).toHaveBeenCalled();
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
    await service.remove('1');
    expect(schedulesRepo.delete).toHaveBeenCalledWith('1');
  });
});
