import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  WeeklyOverridesService,
  WeeklyOverrideDto,
} from './weekly-overrides.service';
import { Schedule } from './schedules.entity';
import { Panelist } from '../panelists/panelists.entity';
import { RedisService } from '../redis/redis.service';
import { SchedulesService } from './schedules.service';
import * as dayjs from 'dayjs';

describe('WeeklyOverridesService', () => {
  let service: WeeklyOverridesService;
  let schedulesRepo: Repository<Schedule>;
  let panelistsRepo: Repository<Panelist>;
  let redisService: RedisService;
  let dataSource: DataSource;

  const mockSchedule = {
    id: 1,
    day_of_week: 'monday',
    start_time: '14:00',
    end_time: '16:00',
    program: {
      id: 1,
      name: 'Test Program',
      description: 'Test Description',
    },
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delByPattern: jest.fn(),
    client: {
      scanStream: jest.fn().mockReturnValue({
        [Symbol.asyncIterator]: jest.fn().mockReturnValue({
          next: jest.fn().mockResolvedValue({ done: true, value: undefined }),
        }),
      }),
      pipeline: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyOverridesService,
        {
          provide: getRepositoryToken(Schedule),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Panelist),
          useValue: {
            find: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: DataSource,
          useValue: {
            query: jest.fn().mockResolvedValue([]),
          },
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

    service = module.get<WeeklyOverridesService>(WeeklyOverridesService);
    schedulesRepo = module.get<Repository<Schedule>>(
      getRepositoryToken(Schedule),
    );
    panelistsRepo = module.get<Repository<Panelist>>(
      getRepositoryToken(Panelist),
    );
    redisService = module.get<RedisService>(RedisService);
    dataSource = module.get<DataSource>(DataSource);
  });

  describe('createWeeklyOverride', () => {
    it('should create a weekly override successfully', async () => {
      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        targetWeek: 'current',
        overrideType: 'cancel',
        reason: 'Host is sick',
        createdBy: 'admin',
      };

      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null); // No existing override
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delByPattern').mockResolvedValue(undefined);

      const result = await service.createWeeklyOverride(dto);

      expect(result).toBeDefined();
      expect(result.scheduleId).toBe(1);
      expect(result.overrideType).toBe('cancel');
      expect(redisService.set).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalledWith('schedules:week:complete');
    });

    it('should create a special program override successfully', async () => {
      const dto: WeeklyOverrideDto = {
        targetWeek: 'current',
        overrideType: 'create',
        newStartTime: '14:00',
        newEndTime: '16:00',
        newDayOfWeek: 'monday',
        reason: 'Special holiday program',
        createdBy: 'admin',
        specialProgram: {
          name: 'Un día rosarino',
          description: 'Special program for Flag Day',
          channelId: 1,
          imageUrl: 'https://example.com/image.jpg',
        },
      };

      jest.spyOn(redisService, 'get').mockResolvedValue(null); // No existing override
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(dataSource, 'query').mockImplementation((sql: string) => {
        if (sql.includes('FROM channel')) {
          return Promise.resolve([
            {
              id: 1,
              name: 'Test Channel',
              handle: 'test',
              youtube_channel_id: 'test123',
              logo_url: null,
              description: null,
              order: 1,
              is_visible: true,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.createWeeklyOverride(dto);

      expect(result).toBeDefined();
      expect(result.overrideType).toBe('create');
      expect(result.specialProgram).toBeDefined();
      expect(result.specialProgram!.name).toBe('Un día rosarino');
      expect(result.specialProgram!.channelId).toBe(1);
      expect(result.specialProgram!.channel).toBeDefined();
      expect(result.specialProgram!.channel!.id).toBe(1);
      expect(result.specialProgram!.channel!.name).toBe('Test Channel');
      expect(redisService.set).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalledWith('schedules:week:complete');
    });

    it('should throw BadRequestException when create override missing special program data', async () => {
      const dto: WeeklyOverrideDto = {
        targetWeek: 'current',
        overrideType: 'create',
        newStartTime: '14:00',
        newEndTime: '16:00',
        newDayOfWeek: 'monday',
        // Missing specialProgram
      };

      await expect(service.createWeeklyOverride(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when create override missing required fields', async () => {
      const dto: WeeklyOverrideDto = {
        targetWeek: 'current',
        overrideType: 'create',
        specialProgram: {
          name: 'Test Program',
          channelId: 1,
        },
        // Missing newStartTime, newEndTime, newDayOfWeek
      };

      await expect(service.createWeeklyOverride(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when schedule does not exist', async () => {
      const dto: WeeklyOverrideDto = {
        scheduleId: 999,
        targetWeek: 'current',
        overrideType: 'cancel',
      };

      jest.spyOn(schedulesRepo, 'findOne').mockResolvedValue(null);

      await expect(service.createWeeklyOverride(dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when override already exists', async () => {
      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        targetWeek: 'current',
        overrideType: 'cancel',
      };

      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue({ id: '1_2024-01-01' }); // Existing override

      await expect(service.createWeeklyOverride(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should validate time_change requires new times', async () => {
      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        targetWeek: 'current',
        overrideType: 'time_change',
        // Missing newStartTime and newEndTime
      };

      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      await expect(service.createWeeklyOverride(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should validate reschedule requires new day', async () => {
      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        targetWeek: 'current',
        overrideType: 'reschedule',
        newStartTime: '15:00',
        newEndTime: '17:00',
        // Missing newDayOfWeek
      };

      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      await expect(service.createWeeklyOverride(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create a program-level override successfully', async () => {
      const dto: WeeklyOverrideDto = {
        programId: 1,
        targetWeek: 'current',
        overrideType: 'cancel',
        reason: 'Program cancelled for the week',
      };

      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delByPattern').mockResolvedValue(undefined);

      const result = await service.createWeeklyOverride(dto);

      expect(result.programId).toBe(1);
      expect(result.overrideType).toBe('cancel');
      expect(result.id).toMatch(/^program_1_\d{4}-\d{2}-\d{2}$/);
    });

    it('should throw BadRequestException when both scheduleId and programId are provided', async () => {
      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        programId: 1,
        targetWeek: 'current',
        overrideType: 'cancel',
      };

      await expect(service.createWeeklyOverride(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when neither scheduleId nor programId is provided for non-create overrides', async () => {
      const dto: WeeklyOverrideDto = {
        targetWeek: 'current',
        overrideType: 'cancel',
      };

      await expect(service.createWeeklyOverride(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when program does not exist', async () => {
      const dto: WeeklyOverrideDto = {
        programId: 999,
        targetWeek: 'current',
        overrideType: 'cancel',
      };

      jest.spyOn(schedulesRepo, 'findOne').mockResolvedValue(null);

      await expect(service.createWeeklyOverride(dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should create a weekly override with panelists successfully', async () => {
      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        targetWeek: 'current',
        overrideType: 'time_change',
        newStartTime: '15:00',
        newEndTime: '17:00',
        panelistIds: [1, 2],
      };

      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue(mockSchedule as any);
      jest.spyOn(panelistsRepo, 'find').mockResolvedValue([
        { id: 1, name: 'Panelist 1', photo_url: null, bio: 'Panelist 1 bio' },
        { id: 2, name: 'Panelist 2', photo_url: null, bio: 'Panelist 2 bio' },
      ] as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);

      const result = await service.createWeeklyOverride(dto);

      expect(result.panelistIds).toEqual([1, 2]); // Keep legacy field for backward compatibility
      expect(result.panelists).toBeDefined();
      expect(result.panelists!.length).toBe(2);
      expect(result.panelists![0].id).toBe(1);
      expect(result.panelists![0].name).toBe('Panelist 1');
      expect(result.panelists![1].id).toBe(2);
      expect(result.panelists![1].name).toBe('Panelist 2');
      expect(panelistsRepo.find).toHaveBeenCalledWith({
        where: { id: expect.any(Object) },
      });
    });

    it('should throw NotFoundException when panelist does not exist', async () => {
      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        targetWeek: 'current',
        overrideType: 'time_change',
        newStartTime: '15:00',
        newEndTime: '17:00',
        panelistIds: [1, 999], // 999 doesn't exist
      };

      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue(mockSchedule as any);
      jest
        .spyOn(panelistsRepo, 'find')
        .mockResolvedValue([{ id: 1, name: 'Panelist 1' }] as any);

      await expect(service.createWeeklyOverride(dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getWeeklyOverride', () => {
    it('should return an override when it exists', async () => {
      const overrideId = '1_2024-01-01';
      const mockOverride = { id: overrideId, scheduleId: 1 };

      jest.spyOn(redisService, 'get').mockResolvedValue(mockOverride);

      const result = await service.getWeeklyOverride(overrideId);

      expect(result).toEqual(mockOverride);
      expect(redisService.get).toHaveBeenCalledWith(
        `weekly_override:${overrideId}`,
      );
    });

    it('should return null when override does not exist', async () => {
      const overrideId = '1_2024-01-01';

      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      const result = await service.getWeeklyOverride(overrideId);

      expect(result).toBeNull();
    });
  });

  describe('deleteWeeklyOverride', () => {
    it('should delete an existing override', async () => {
      const overrideId = '1_2024-01-01';
      const mockOverride = { id: overrideId, scheduleId: 1 };

      jest.spyOn(redisService, 'get').mockResolvedValue(mockOverride);
      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delByPattern').mockResolvedValue(undefined);

      const result = await service.deleteWeeklyOverride(overrideId);

      expect(result).toBe(true);
      expect(redisService.del).toHaveBeenCalledWith([
        `weekly_override:${overrideId}`,
        'schedules:week:complete',
      ]);
    });

    it('should return false when override does not exist', async () => {
      const overrideId = '1_2024-01-01';

      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      const result = await service.deleteWeeklyOverride(overrideId);

      expect(result).toBe(false);
      expect(redisService.del).not.toHaveBeenCalled();
    });
  });

  describe('applyWeeklyOverrides', () => {
    it('should return original schedules when no overrides exist', async () => {
      const schedules = [mockSchedule as any];
      const weekStartDate = '2024-01-01';

      // Mock scanStream to return no keys
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield [];
        },
      };
      jest
        .spyOn(mockRedisService.client, 'scanStream')
        .mockReturnValue(mockStream);

      const result = await service.applyWeeklyOverrides(
        schedules,
        weekStartDate,
      );

      expect(result).toEqual(schedules);
    });

    it('should apply cancel override', async () => {
      const schedules = [mockSchedule as any];
      const weekStartDate = '2024-01-01';
      const override = {
        id: '1_2024-01-01',
        scheduleId: 1,
        overrideType: 'cancel',
      };

      // Mock scanStream to return the override key
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield ['weekly_override:1_2024-01-01'];
        },
      };
      jest
        .spyOn(mockRedisService.client, 'scanStream')
        .mockReturnValue(mockStream);

      // Mock pipeline exec to return the override data
      const mockPipeline = {
        get: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, JSON.stringify(override)]]),
      };
      jest
        .spyOn(mockRedisService.client, 'pipeline')
        .mockReturnValue(mockPipeline);

      const result = await service.applyWeeklyOverrides(
        schedules,
        weekStartDate,
      );

      expect(result).toHaveLength(0); // Schedule should be cancelled
    });

    it('should apply time_change override', async () => {
      const schedules = [mockSchedule as any];
      const weekStartDate = '2024-01-01';
      const override = {
        id: '1_2024-01-01',
        scheduleId: 1,
        overrideType: 'time_change',
        newStartTime: '15:00',
        newEndTime: '17:00',
      };

      // Mock scanStream to return the override key
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield ['weekly_override:1_2024-01-01'];
        },
      };
      jest
        .spyOn(mockRedisService.client, 'scanStream')
        .mockReturnValue(mockStream);

      // Mock pipeline exec to return the override data
      const mockPipeline = {
        get: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, JSON.stringify(override)]]),
      };
      jest
        .spyOn(mockRedisService.client, 'pipeline')
        .mockReturnValue(mockPipeline);

      const result = await service.applyWeeklyOverrides(
        schedules,
        weekStartDate,
      );

      expect(result).toHaveLength(1);
      expect(result[0].start_time).toBe('15:00');
      expect(result[0].end_time).toBe('17:00');
    });

    it('should create virtual schedule for create override', async () => {
      const schedules = [mockSchedule as any];
      const weekStartDate = '2024-01-01';
      const override = {
        id: 'special_un_dia_rosarino_2024-01-01',
        overrideType: 'create',
        newStartTime: '14:00',
        newEndTime: '16:00',
        newDayOfWeek: 'monday',
        specialProgram: {
          name: 'Un día rosarino',
          description: 'Special program for Flag Day',
          channelId: 1,
          channel: {
            id: 1,
            name: 'Test Channel',
            handle: 'test',
            youtube_channel_id: 'test123',
            logo_url: null,
            description: null,
            order: 1,
            is_visible: true,
          },
          imageUrl: 'https://example.com/image.jpg',
        },
      };

      // Mock scanStream to return the override key
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield ['weekly_override:special_un_dia_rosarino_2024-01-01'];
        },
      };
      jest
        .spyOn(mockRedisService.client, 'scanStream')
        .mockReturnValue(mockStream);

      // Mock pipeline exec to return the override data
      const mockPipeline = {
        get: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, JSON.stringify(override)]]),
      };
      jest
        .spyOn(mockRedisService.client, 'pipeline')
        .mockReturnValue(mockPipeline);

      jest.spyOn(dataSource, 'query').mockResolvedValue([
        {
          id: 1,
          name: 'Test Channel',
          handle: 'test',
          youtube_channel_id: 'test123',
          logo_url: null,
          description: null,
          order: 1,
        },
      ]);

      const result = await service.applyWeeklyOverrides(
        schedules,
        weekStartDate,
      );

      expect(result).toHaveLength(2); // Original schedule + virtual schedule
      const virtualSchedule = result.find((s) =>
        String(s.id).startsWith('virtual_'),
      );
      expect(virtualSchedule).toBeDefined();
      expect(virtualSchedule!.program.name).toBe('Un día rosarino');
      expect(virtualSchedule!.start_time).toBe('14:00');
      expect(virtualSchedule!.end_time).toBe('16:00');
      expect(virtualSchedule!.day_of_week).toBe('monday');
      expect((virtualSchedule as any).isWeeklyOverride).toBe(true);
      expect((virtualSchedule as any).overrideType).toBe('create');
    });

    it('should handle mixed overrides (regular + create)', async () => {
      const schedules = [mockSchedule as any];
      const weekStartDate = '2024-01-01';
      const regularOverride = {
        id: '1_2024-01-01',
        scheduleId: 1,
        overrideType: 'time_change',
        newStartTime: '15:00',
        newEndTime: '17:00',
      };
      const createOverride = {
        id: 'special_un_dia_rosarino_2024-01-01',
        overrideType: 'create',
        newStartTime: '14:00',
        newEndTime: '16:00',
        newDayOfWeek: 'monday',
        specialProgram: {
          name: 'Un día rosarino',
          description: 'Special program for Flag Day',
          channelId: 1,
          imageUrl: 'https://example.com/image.jpg',
        },
      };

      // Mock scanStream to return both override keys
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield [
            'weekly_override:1_2024-01-01',
            'weekly_override:special_un_dia_rosarino_2024-01-01',
          ];
        },
      };
      jest
        .spyOn(mockRedisService.client, 'scanStream')
        .mockReturnValue(mockStream);

      // Mock pipeline exec to return both overrides
      const mockPipeline = {
        get: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, JSON.stringify(regularOverride)],
          [null, JSON.stringify(createOverride)],
        ]),
      };
      jest
        .spyOn(mockRedisService.client, 'pipeline')
        .mockReturnValue(mockPipeline);

      jest.spyOn(dataSource, 'query').mockResolvedValue([
        {
          id: 1,
          name: 'Test Channel',
          handle: 'test',
          youtube_channel_id: 'test123',
          logo_url: null,
          description: null,
          order: 1,
        },
      ]);

      const result = await service.applyWeeklyOverrides(
        schedules,
        weekStartDate,
      );

      expect(result).toHaveLength(2);
      expect(result[0].start_time).toBe('15:00');
      expect(result[0].end_time).toBe('17:00');
      expect(result[1].program.name).toBe('Un día rosarino');
    });

    it('should apply program-level cancel override', async () => {
      const schedules = [
        { ...mockSchedule, id: 1, program: { id: 1 } },
        { ...mockSchedule, id: 2, program: { id: 1 } },
        { ...mockSchedule, id: 3, program: { id: 2 } },
      ] as any;
      const weekStartDate = '2024-01-01';
      const override = {
        id: 'program_1_2024-01-01',
        programId: 1,
        overrideType: 'cancel',
      };

      // Mock scanStream to return the override key
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield ['weekly_override:program_1_2024-01-01'];
        },
      };
      jest
        .spyOn(mockRedisService.client, 'scanStream')
        .mockReturnValue(mockStream);

      // Mock pipeline exec to return the override data
      const mockPipeline = {
        get: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, JSON.stringify(override)]]),
      };
      jest
        .spyOn(mockRedisService.client, 'pipeline')
        .mockReturnValue(mockPipeline);

      const result = await service.applyWeeklyOverrides(
        schedules,
        weekStartDate,
      );

      expect(result).toHaveLength(1); // Only program 2's schedule should remain
      expect(result[0].program.id).toBe(2);
    });

    it('should apply program-level time_change override', async () => {
      const schedules = [
        { ...mockSchedule, id: 1, program: { id: 1 } },
        { ...mockSchedule, id: 2, program: { id: 1 } },
        { ...mockSchedule, id: 3, program: { id: 2 } },
      ] as any;
      const weekStartDate = '2024-01-01';
      const override = {
        id: 'program_1_2024-01-01',
        programId: 1,
        overrideType: 'time_change',
        newStartTime: '15:00',
        newEndTime: '17:00',
      };

      // Mock scanStream to return the override key
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield ['weekly_override:program_1_2024-01-01'];
        },
      };
      jest
        .spyOn(mockRedisService.client, 'scanStream')
        .mockReturnValue(mockStream);

      // Mock pipeline exec to return the override data
      const mockPipeline = {
        get: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, JSON.stringify(override)]]),
      };
      jest
        .spyOn(mockRedisService.client, 'pipeline')
        .mockReturnValue(mockPipeline);

      const result = await service.applyWeeklyOverrides(
        schedules,
        weekStartDate,
      );

      expect(result).toHaveLength(3);
      // Program 1's schedules should have new times
      expect(result[0].start_time).toBe('15:00');
      expect(result[0].end_time).toBe('17:00');
      expect(result[1].start_time).toBe('15:00');
      expect(result[1].end_time).toBe('17:00');
      // Program 2's schedule should remain unchanged
      expect(result[2].start_time).toBe('14:00');
      expect(result[2].end_time).toBe('16:00');
    });

    it('should prioritize program-level overrides over schedule-level overrides', async () => {
      const schedules = [{ ...mockSchedule, id: 1, program: { id: 1 } }] as any;
      const weekStartDate = '2024-01-01';
      const programOverride = {
        id: 'program_1_2024-01-01',
        programId: 1,
        overrideType: 'time_change',
        newStartTime: '15:00',
        newEndTime: '17:00',
      };
      const scheduleOverride = {
        id: '1_2024-01-01',
        scheduleId: 1,
        overrideType: 'time_change',
        newStartTime: '16:00',
        newEndTime: '18:00',
      };

      // Mock scanStream to return both override keys
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield [
            'weekly_override:program_1_2024-01-01',
            'weekly_override:1_2024-01-01',
          ];
        },
      };
      jest
        .spyOn(mockRedisService.client, 'scanStream')
        .mockReturnValue(mockStream);

      // Mock pipeline exec to return both overrides
      const mockPipeline = {
        get: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, JSON.stringify(programOverride)],
          [null, JSON.stringify(scheduleOverride)],
        ]),
      };
      jest
        .spyOn(mockRedisService.client, 'pipeline')
        .mockReturnValue(mockPipeline);

      const result = await service.applyWeeklyOverrides(
        schedules,
        weekStartDate,
      );

      expect(result).toHaveLength(1);
      // Program-level override should take precedence
      expect(result[0].start_time).toBe('15:00');
      expect(result[0].end_time).toBe('17:00');
    });
  });

  describe('getWeekStartDate', () => {
    it('should return current week start date', () => {
      const result = service.getWeekStartDate('current');
      const expected = dayjs()
        .tz('America/Argentina/Buenos_Aires')
        .startOf('week')
        .format('YYYY-MM-DD');

      expect(result).toBe(expected);
    });

    it('should return next week start date', () => {
      const result = service.getWeekStartDate('next');
      const expected = dayjs()
        .tz('America/Argentina/Buenos_Aires')
        .add(1, 'week')
        .startOf('week')
        .format('YYYY-MM-DD');

      expect(result).toBe(expected);
    });
  });

  describe('cleanupExpiredOverrides', () => {
    it('should clean up expired overrides', async () => {
      const expiredOverride = {
        id: '1_2024-01-01',
        expiresAt: dayjs().subtract(1, 'day').format('YYYY-MM-DD'), // Yesterday
      };

      // Mock scanStream to return the override key
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield ['weekly_override:1_2024-01-01'];
        },
      };
      jest
        .spyOn(mockRedisService.client, 'scanStream')
        .mockReturnValue(mockStream);

      // Mock pipeline exec to return the override data
      const mockPipeline = {
        get: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockResolvedValue([[null, JSON.stringify(expiredOverride)]]),
      };
      jest
        .spyOn(mockRedisService.client, 'pipeline')
        .mockReturnValue(mockPipeline);

      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delByPattern').mockResolvedValue(undefined);

      const result = await service.cleanupExpiredOverrides();

      expect(result).toBe(1);
      expect(redisService.del).toHaveBeenCalledWith([
        'weekly_override:1_2024-01-01',
      ]);
      expect(redisService.del).toHaveBeenCalledWith('schedules:week:complete');
    });

    it('should not clean up non-expired overrides', async () => {
      const validOverride = {
        id: '1_2024-01-01',
        expiresAt: dayjs().add(1, 'day').format('YYYY-MM-DD'), // Tomorrow
      };

      // Mock scanStream to return the override key
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield ['weekly_override:1_2024-01-01'];
        },
      };
      jest
        .spyOn(mockRedisService.client, 'scanStream')
        .mockReturnValue(mockStream);

      // Mock pipeline exec to return the override data
      const mockPipeline = {
        get: jest.fn().mockReturnThis(),
        exec: jest
          .fn()
          .mockResolvedValue([[null, JSON.stringify(validOverride)]]),
      };
      jest
        .spyOn(mockRedisService.client, 'pipeline')
        .mockReturnValue(mockPipeline);

      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);

      const result = await service.cleanupExpiredOverrides();

      expect(result).toBe(0);
      expect(redisService.del).not.toHaveBeenCalled();
    });
  });

  describe('linked programs — propagateOverrideToLinkedPrograms', () => {
    it('should return empty array when program has no link_group_id', async () => {
      jest
        .spyOn(dataSource, 'query')
        .mockResolvedValueOnce([{ link_group_id: null }]); // SELECT link_group_id FROM program

      const dto: WeeklyOverrideDto = {
        programId: 1,
        targetWeek: 'current',
        overrideType: 'cancel',
      };

      // programId validation: needs a schedule belonging to programId=1
      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);

      const result = await service.createWeeklyOverride(dto);

      expect(result.linkedOverrides).toEqual([]);
    });

    it('should propagate cancel override to all programs in the link group', async () => {
      const linkGroupId = 'group-uuid-123';
      jest
        .spyOn(dataSource, 'query')
        // propagateOverrideToLinkedPrograms: SELECT link_group_id FROM program WHERE id = 1
        .mockResolvedValueOnce([{ link_group_id: linkGroupId }])
        // SELECT id FROM program WHERE link_group_id = ... AND id != 1
        .mockResolvedValueOnce([{ id: 2 }, { id: 3 }])
        // SELECT id FROM schedule WHERE program_id = '2' AND day_of_week = ...
        .mockResolvedValueOnce([{ id: 20 }])
        // SELECT id FROM schedule WHERE program_id = '3' AND day_of_week = ...
        .mockResolvedValueOnce([{ id: 30 }]);

      const dto: WeeklyOverrideDto = {
        programId: 1,
        targetWeek: 'current',
        overrideType: 'cancel',
      };

      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);

      const result = await service.createWeeklyOverride(dto);

      // Two linked programs get propagated overrides
      expect(result.linkedOverrides).toHaveLength(2);
      expect(result.linkedOverrides[0].overrideType).toBe('cancel');
      expect(result.linkedOverrides[1].overrideType).toBe('cancel');
    });

    it('should not propagate to itself — only to other programs in the group', async () => {
      const linkGroupId = 'group-uuid-self';
      jest
        .spyOn(dataSource, 'query')
        .mockResolvedValueOnce([{ link_group_id: linkGroupId }])
        .mockResolvedValueOnce([]); // No OTHER programs in group

      const dto: WeeklyOverrideDto = {
        programId: 5,
        targetWeek: 'current',
        overrideType: 'cancel',
      };

      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue({ ...mockSchedule, program: { id: 5 } } as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);

      const result = await service.createWeeklyOverride(dto);

      expect(result.linkedOverrides).toEqual([]);
    });
  });

  describe('linked programs — detectConflictsForLinkedChannels', () => {
    it('should return empty conflicts when no overlapping schedules exist', async () => {
      jest
        .spyOn(dataSource, 'query')
        // schedule → program_id lookup
        .mockResolvedValueOnce([{ program_id: 1, day_of_week: 'monday' }])
        // propagation: link_group_id lookup
        .mockResolvedValueOnce([{ link_group_id: null }])
        // detectConflictsForLinkedChannels: program info
        .mockResolvedValueOnce([
          {
            id: 1,
            link_group_id: null,
            channel_id: 1,
            channel_name: 'Canal 1',
          },
        ])
        // detectConflictsForChannel SQL: no overlapping rows
        .mockResolvedValueOnce([]);

      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        targetWeek: 'current',
        overrideType: 'time_change',
        newStartTime: '15:00',
        newEndTime: '17:00',
        newDayOfWeek: 'monday',
      };

      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);

      const result = await service.createWeeklyOverride(dto);

      expect(result.conflicts).toEqual([]);
    });

    it('should return conflicts when overlapping schedules are detected', async () => {
      jest
        .spyOn(dataSource, 'query')
        // schedule → program_id/day_of_week
        .mockResolvedValueOnce([{ program_id: 1, day_of_week: 'monday' }])
        // propagation: link_group_id
        .mockResolvedValueOnce([{ link_group_id: null }])
        // detectConflictsForLinkedChannels: program info
        .mockResolvedValueOnce([
          {
            id: 1,
            link_group_id: null,
            channel_id: 1,
            channel_name: 'Canal Test',
          },
        ])
        // detectConflictsForChannel: overlapping schedule rows
        .mockResolvedValueOnce([
          {
            schedule_id: 99,
            day_of_week: 'monday',
            start_time: '14:30',
            end_time: '16:00',
            program_id: 42,
            program_name: 'Programa Solapado',
          },
        ])
        // existing override check for the conflict (redis.get returns null → no existing override)
        .mockResolvedValue([]);

      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        targetWeek: 'current',
        overrideType: 'time_change',
        newStartTime: '15:00',
        newEndTime: '17:00',
        newDayOfWeek: 'monday',
      };

      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);

      const result = await service.createWeeklyOverride(dto);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].programName).toBe('Programa Solapado');
      expect(result.conflicts[0].channelName).toBe('Canal Test');
      expect(result.conflicts[0].dayOfWeek).toBe('monday');
    });

    it('should detect conflicts for schedules that cross midnight', async () => {
      // "El que ríe último" airs 23:00 → 00:30 (next day), same as the
      // newly created special program. Both start_time/end_time are stored
      // anchored to the same day_of_week with end_time < start_time.
      jest
        .spyOn(dataSource, 'query')
        .mockResolvedValueOnce([{ program_id: 1, day_of_week: 'monday' }])
        .mockResolvedValueOnce([{ link_group_id: null }])
        .mockResolvedValueOnce([
          {
            id: 1,
            link_group_id: null,
            channel_id: 1,
            channel_name: 'Canal Test',
          },
        ])
        .mockResolvedValueOnce([
          {
            schedule_id: 99,
            day_of_week: 'monday',
            start_time: '23:00:00',
            end_time: '00:30:00',
            program_id: 42,
            program_name: 'El que ríe último',
          },
        ])
        .mockResolvedValue([]);

      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        targetWeek: 'current',
        overrideType: 'time_change',
        newStartTime: '23:00',
        newEndTime: '00:30',
        newDayOfWeek: 'monday',
      };

      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);

      const result = await service.createWeeklyOverride(dto);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].programName).toBe('El que ríe último');
    });

    it('should not flag adjacent (non-overlapping) cross-midnight schedules as conflicts', async () => {
      // New program ends exactly when the existing one starts: 22:00→23:00
      // vs. 23:00→00:30. No actual overlap.
      jest
        .spyOn(dataSource, 'query')
        .mockResolvedValueOnce([{ program_id: 1, day_of_week: 'monday' }])
        .mockResolvedValueOnce([{ link_group_id: null }])
        .mockResolvedValueOnce([
          {
            id: 1,
            link_group_id: null,
            channel_id: 1,
            channel_name: 'Canal Test',
          },
        ])
        .mockResolvedValueOnce([
          {
            schedule_id: 99,
            day_of_week: 'monday',
            start_time: '23:00:00',
            end_time: '00:30:00',
            program_id: 42,
            program_name: 'El que ríe último',
          },
        ])
        .mockResolvedValue([]);

      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        targetWeek: 'current',
        overrideType: 'time_change',
        newStartTime: '22:00',
        newEndTime: '23:00',
        newDayOfWeek: 'monday',
      };

      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);

      const result = await service.createWeeklyOverride(dto);

      expect(result.conflicts).toEqual([]);
    });
  });

  describe('resolveConflicts', () => {
    it('should skip resolutions with action keep', async () => {
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);

      const result = await service.resolveConflicts({
        targetWeek: 'current',
        resolutions: [
          {
            programId: 1,
            channelId: 1,
            dayOfWeek: 'monday',
            weekStartDate: '2026-06-23',
            action: 'keep',
          },
        ],
      });

      expect(result.skipped).toBe(1);
      expect(result.resolved).toBe(0);
      // No override written (only the live_notification key is set for the summary event)
      const overrideSetCalls = (
        redisService.set as jest.Mock
      ).mock.calls.filter(
        (args) => !String(args[0]).startsWith('live_notification:'),
      );
      expect(overrideSetCalls).toHaveLength(0);
    });

    it('should create a cancel override for action cancel', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);

      const result = await service.resolveConflicts({
        targetWeek: 'current',
        resolutions: [
          {
            programId: 10,
            channelId: 1,
            dayOfWeek: 'monday',
            weekStartDate: '2026-06-23',
            action: 'cancel',
          },
        ],
      });

      expect(result.resolved).toBe(1);
      expect(result.skipped).toBe(0);
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('weekly_override:'),
        expect.objectContaining({ overrideType: 'cancel' }),
        expect.any(Number),
      );
    });

    it('should create a time_change override for action reschedule', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);

      const result = await service.resolveConflicts({
        targetWeek: 'current',
        resolutions: [
          {
            programId: 10,
            channelId: 1,
            dayOfWeek: 'monday',
            weekStartDate: '2026-06-23',
            action: 'reschedule',
            newStartTime: '18:00',
            newEndTime: '19:00',
          },
        ],
      });

      expect(result.resolved).toBe(1);
      expect(redisService.set).toHaveBeenCalledWith(
        expect.stringContaining('weekly_override:'),
        expect.objectContaining({
          overrideType: 'time_change',
          newStartTime: '18:00',
          newEndTime: '19:00',
        }),
        expect.any(Number),
      );
    });

    it('should handle mixed resolutions correctly', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);

      const result = await service.resolveConflicts({
        targetWeek: 'current',
        resolutions: [
          {
            programId: 1,
            channelId: 1,
            dayOfWeek: 'monday',
            weekStartDate: '2026-06-23',
            action: 'keep',
          },
          {
            programId: 2,
            channelId: 2,
            dayOfWeek: 'monday',
            weekStartDate: '2026-06-23',
            action: 'cancel',
          },
          {
            programId: 3,
            channelId: 3,
            dayOfWeek: 'monday',
            weekStartDate: '2026-06-23',
            action: 'reschedule',
            newStartTime: '20:00',
            newEndTime: '21:00',
          },
        ],
      });

      expect(result.resolved).toBe(2);
      expect(result.skipped).toBe(1);
    });
  });

  describe('createWeeklyOverride — response shape', () => {
    it('should always return linkedOverrides and conflicts arrays', async () => {
      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        targetWeek: 'current',
        overrideType: 'cancel',
      };

      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);

      const result = await service.createWeeklyOverride(dto);

      expect(Array.isArray(result.linkedOverrides)).toBe(true);
      expect(Array.isArray(result.conflicts)).toBe(true);
    });

    it('should not trigger conflict detection for cancel overrides', async () => {
      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        targetWeek: 'current',
        overrideType: 'cancel',
      };

      jest
        .spyOn(schedulesRepo, 'findOne')
        .mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);
      const querySpy = jest.spyOn(dataSource, 'query').mockResolvedValue([]);

      await service.createWeeklyOverride(dto);

      // For cancel: only schedule→programId lookup may fire; no conflict SQL
      // Conflict detection SQL query has WHERE start_time < $4 AND end_time > $5 — not called
      const conflictQueryCalls = querySpy.mock.calls.filter((args) =>
        String(args[0]).includes('start_time <'),
      );
      expect(conflictQueryCalls).toHaveLength(0);
    });
  });
});
