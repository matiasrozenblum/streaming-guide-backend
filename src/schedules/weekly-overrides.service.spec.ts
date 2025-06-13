import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WeeklyOverridesService, WeeklyOverrideDto } from './weekly-overrides.service';
import { Schedule } from './schedules.entity';
import { RedisService } from '../redis/redis.service';
import * as dayjs from 'dayjs';

describe('WeeklyOverridesService', () => {
  let service: WeeklyOverridesService;
  let schedulesRepo: Repository<Schedule>;
  let redisService: RedisService;

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
      scanStream: jest.fn(),
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
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<WeeklyOverridesService>(WeeklyOverridesService);
    schedulesRepo = module.get<Repository<Schedule>>(getRepositoryToken(Schedule));
    redisService = module.get<RedisService>(RedisService);
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

      jest.spyOn(schedulesRepo, 'findOne').mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null); // No existing override
      jest.spyOn(redisService, 'set').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delByPattern').mockResolvedValue(undefined);

      const result = await service.createWeeklyOverride(dto);

      expect(result).toBeDefined();
      expect(result.scheduleId).toBe(1);
      expect(result.overrideType).toBe('cancel');
      expect(redisService.set).toHaveBeenCalled();
      expect(redisService.delByPattern).toHaveBeenCalledWith('schedules:all:*');
    });

    it('should throw NotFoundException when schedule does not exist', async () => {
      const dto: WeeklyOverrideDto = {
        scheduleId: 999,
        targetWeek: 'current',
        overrideType: 'cancel',
      };

      jest.spyOn(schedulesRepo, 'findOne').mockResolvedValue(null);

      await expect(service.createWeeklyOverride(dto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when override already exists', async () => {
      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        targetWeek: 'current',
        overrideType: 'cancel',
      };

      jest.spyOn(schedulesRepo, 'findOne').mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue({ id: '1_2024-01-01' }); // Existing override

      await expect(service.createWeeklyOverride(dto)).rejects.toThrow(BadRequestException);
    });

    it('should validate time_change requires new times', async () => {
      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        targetWeek: 'current',
        overrideType: 'time_change',
        // Missing newStartTime and newEndTime
      };

      jest.spyOn(schedulesRepo, 'findOne').mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      await expect(service.createWeeklyOverride(dto)).rejects.toThrow(BadRequestException);
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

      jest.spyOn(schedulesRepo, 'findOne').mockResolvedValue(mockSchedule as any);
      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      await expect(service.createWeeklyOverride(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getWeeklyOverride', () => {
    it('should return an override when it exists', async () => {
      const overrideId = '1_2024-01-01';
      const mockOverride = { id: overrideId, scheduleId: 1 };

      jest.spyOn(redisService, 'get').mockResolvedValue(mockOverride);

      const result = await service.getWeeklyOverride(overrideId);

      expect(result).toEqual(mockOverride);
      expect(redisService.get).toHaveBeenCalledWith(`weekly_override:${overrideId}`);
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
      expect(redisService.del).toHaveBeenCalledWith(`weekly_override:${overrideId}`);
      expect(redisService.delByPattern).toHaveBeenCalledWith('schedules:all:*');
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
      jest.spyOn(mockRedisService.client, 'scanStream').mockReturnValue(mockStream);

      const result = await service.applyWeeklyOverrides(schedules, weekStartDate);

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
      jest.spyOn(mockRedisService.client, 'scanStream').mockReturnValue(mockStream);
      jest.spyOn(redisService, 'get').mockResolvedValue(override);

      const result = await service.applyWeeklyOverrides(schedules, weekStartDate);

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
      jest.spyOn(mockRedisService.client, 'scanStream').mockReturnValue(mockStream);
      jest.spyOn(redisService, 'get').mockResolvedValue(override);

      const result = await service.applyWeeklyOverrides(schedules, weekStartDate);

      expect(result).toHaveLength(1);
      expect(result[0].start_time).toBe('15:00');
      expect(result[0].end_time).toBe('17:00');
    });
  });

  describe('getWeekStartDate', () => {
    it('should return current week start date', () => {
      const result = service.getWeekStartDate('current');
      const expected = dayjs().tz('America/Argentina/Buenos_Aires').startOf('week').format('YYYY-MM-DD');
      
      expect(result).toBe(expected);
    });

    it('should return next week start date', () => {
      const result = service.getWeekStartDate('next');
      const expected = dayjs().tz('America/Argentina/Buenos_Aires').add(1, 'week').startOf('week').format('YYYY-MM-DD');
      
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
      jest.spyOn(mockRedisService.client, 'scanStream').mockReturnValue(mockStream);
      jest.spyOn(redisService, 'get').mockResolvedValue(expiredOverride);
      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);
      jest.spyOn(redisService, 'delByPattern').mockResolvedValue(undefined);

      const result = await service.cleanupExpiredOverrides();

      expect(result).toBe(1);
      expect(redisService.del).toHaveBeenCalledWith('weekly_override:1_2024-01-01');
      expect(redisService.delByPattern).toHaveBeenCalledWith('schedules:all:*');
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
      jest.spyOn(mockRedisService.client, 'scanStream').mockReturnValue(mockStream);
      jest.spyOn(redisService, 'get').mockResolvedValue(validOverride);
      jest.spyOn(redisService, 'del').mockResolvedValue(undefined);

      const result = await service.cleanupExpiredOverrides();

      expect(result).toBe(0);
      expect(redisService.del).not.toHaveBeenCalled();
    });
  });
}); 