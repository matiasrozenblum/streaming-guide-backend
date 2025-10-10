import { Test, TestingModule } from '@nestjs/testing';
import { WeeklyScheduleManagerService } from './weekly-schedule-manager.service';
import { WeeklyOverridesService } from './weekly-overrides.service';
import { RedisService } from '../redis/redis.service';

describe('WeeklyScheduleManagerService', () => {
  let service: WeeklyScheduleManagerService;
  let weeklyOverridesService: WeeklyOverridesService;
  let redisService: RedisService;

  const mockWeeklyOverridesService = {
    cleanupExpiredOverrides: jest.fn(),
    getWeekStartDate: jest.fn(),
    getOverridesForWeek: jest.fn(),
  };

  const mockRedisService = {
    delByPattern: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WeeklyScheduleManagerService,
        {
          provide: WeeklyOverridesService,
          useValue: mockWeeklyOverridesService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<WeeklyScheduleManagerService>(WeeklyScheduleManagerService);
    weeklyOverridesService = module.get<WeeklyOverridesService>(WeeklyOverridesService);
    redisService = module.get<RedisService>(RedisService);
  });

  describe('performWeeklyReset', () => {
    it('should perform weekly reset successfully', async () => {
      const expiredCount = 5;

      jest.spyOn(weeklyOverridesService, 'cleanupExpiredOverrides').mockResolvedValue(expiredCount);
      jest.spyOn(redisService, 'delByPattern').mockResolvedValue(undefined);

      await service.performWeeklyReset();

      expect(weeklyOverridesService.cleanupExpiredOverrides).toHaveBeenCalled();
      expect(redisService.del).toHaveBeenCalledWith('schedules:week:complete');
    });

    it('should handle errors during weekly reset', async () => {
      const error = new Error('Redis connection failed');

      jest.spyOn(weeklyOverridesService, 'cleanupExpiredOverrides').mockRejectedValue(error);

      // Should not throw error, just log it
      await expect(service.performWeeklyReset()).resolves.toBeUndefined();
    });
  });

  describe('triggerManualReset', () => {
    it('should trigger manual reset successfully', async () => {
      jest.spyOn(service, 'performWeeklyReset').mockResolvedValue(undefined);

      const result = await service.triggerManualReset();

      expect(result).toEqual({
        success: true,
        message: 'Weekly reset completed successfully',
      });
      expect(service.performWeeklyReset).toHaveBeenCalled();
    });

    it('should handle manual reset failure', async () => {
      const error = new Error('Reset failed');

      jest.spyOn(service, 'performWeeklyReset').mockRejectedValue(error);

      const result = await service.triggerManualReset();

      expect(result).toEqual({
        success: false,
        message: 'Weekly reset failed: Reset failed',
      });
    });
  });

  describe('getUpcomingWeekOverrides', () => {
    it('should return upcoming week overrides', async () => {
      const nextWeekStart = '2024-01-08';
      const overrides = [
        {
          id: '1_2024-01-08',
          scheduleId: 1,
          overrideType: 'cancel',
          reason: 'Holiday',
          createdBy: 'admin',
          expiresAt: '2024-01-15',
        },
        {
          id: '2_2024-01-08',
          scheduleId: 2,
          overrideType: 'time_change',
          reason: 'Special event',
          createdBy: 'admin',
          expiresAt: '2024-01-15',
        },
      ];

      jest.spyOn(weeklyOverridesService, 'getWeekStartDate').mockReturnValue(nextWeekStart);
      jest.spyOn(weeklyOverridesService, 'getOverridesForWeek').mockResolvedValue(overrides as any);

      const result = await service.getUpcomingWeekOverrides();

      expect(result).toEqual({
        weekStart: nextWeekStart,
        overridesCount: 2,
        overrides: [
          {
            id: '1_2024-01-08',
            scheduleId: 1,
            type: 'cancel',
            reason: 'Holiday',
            createdBy: 'admin',
            expiresAt: '2024-01-15',
          },
          {
            id: '2_2024-01-08',
            scheduleId: 2,
            type: 'time_change',
            reason: 'Special event',
            createdBy: 'admin',
            expiresAt: '2024-01-15',
          },
        ],
      });

      expect(weeklyOverridesService.getWeekStartDate).toHaveBeenCalledWith('next');
      expect(weeklyOverridesService.getOverridesForWeek).toHaveBeenCalledWith(nextWeekStart);
    });

    it('should handle empty upcoming week overrides', async () => {
      const nextWeekStart = '2024-01-08';
      const overrides = [];

      jest.spyOn(weeklyOverridesService, 'getWeekStartDate').mockReturnValue(nextWeekStart);
      jest.spyOn(weeklyOverridesService, 'getOverridesForWeek').mockResolvedValue(overrides);

      const result = await service.getUpcomingWeekOverrides();

      expect(result).toEqual({
        weekStart: nextWeekStart,
        overridesCount: 0,
        overrides: [],
      });
    });
  });

  describe('getCurrentWeekStats', () => {
    it('should return current week statistics', async () => {
      const currentWeekStart = '2024-01-01';
      const overrides = [
        { overrideType: 'cancel' },
        { overrideType: 'cancel' },
        { overrideType: 'time_change' },
        { overrideType: 'reschedule' },
      ];

      jest.spyOn(weeklyOverridesService, 'getWeekStartDate').mockReturnValue(currentWeekStart);
      jest.spyOn(weeklyOverridesService, 'getOverridesForWeek').mockResolvedValue(overrides as any);

      const result = await service.getCurrentWeekStats();

      expect(result).toEqual({
        weekStart: currentWeekStart,
        totalOverrides: 4,
        byType: {
          cancel: 2,
          time_change: 1,
          reschedule: 1,
        },
      });

      expect(weeklyOverridesService.getWeekStartDate).toHaveBeenCalledWith('current');
      expect(weeklyOverridesService.getOverridesForWeek).toHaveBeenCalledWith(currentWeekStart);
    });

    it('should handle empty current week stats', async () => {
      const currentWeekStart = '2024-01-01';
      const overrides = [];

      jest.spyOn(weeklyOverridesService, 'getWeekStartDate').mockReturnValue(currentWeekStart);
      jest.spyOn(weeklyOverridesService, 'getOverridesForWeek').mockResolvedValue(overrides);

      const result = await service.getCurrentWeekStats();

      expect(result).toEqual({
        weekStart: currentWeekStart,
        totalOverrides: 0,
        byType: {
          cancel: 0,
          time_change: 0,
          reschedule: 0,
        },
      });
    });
  });
}); 