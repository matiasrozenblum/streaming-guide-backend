import { Test, TestingModule } from '@nestjs/testing';
import { WeeklyOverridesController } from './weekly-overrides.controller';
import { WeeklyOverridesService, WeeklyOverrideDto } from './weekly-overrides.service';

describe('WeeklyOverridesController', () => {
  let controller: WeeklyOverridesController;
  let service: WeeklyOverridesService;

  const mockWeeklyOverridesService = {
    createWeeklyOverride: jest.fn(),
    getWeeklyOverride: jest.fn(),
    deleteWeeklyOverride: jest.fn(),
    getWeekStartDate: jest.fn(),
    getOverridesForWeek: jest.fn(),
    getCurrentAndNextWeekOverrides: jest.fn(),
    cleanupExpiredOverrides: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WeeklyOverridesController],
      providers: [
        {
          provide: WeeklyOverridesService,
          useValue: mockWeeklyOverridesService,
        },
      ],
    }).compile();

    controller = module.get<WeeklyOverridesController>(WeeklyOverridesController);
    service = module.get<WeeklyOverridesService>(WeeklyOverridesService);
  });

  describe('createOverride', () => {
    it('should create a weekly override', async () => {
      const dto: WeeklyOverrideDto = {
        scheduleId: 1,
        targetWeek: 'current',
        overrideType: 'cancel',
        reason: 'Host is sick',
      };

      const expectedResult = {
        id: '1_2024-01-01',
        scheduleId: 1,
        weekStartDate: '2024-01-01',
        overrideType: 'cancel',
        reason: 'Host is sick',
        expiresAt: '2024-01-08',
        createdAt: new Date(),
      };

      jest.spyOn(service, 'createWeeklyOverride').mockResolvedValue(expectedResult as any);

      const result = await controller.createOverride(dto);

      expect(result).toEqual(expectedResult);
      expect(service.createWeeklyOverride).toHaveBeenCalledWith(dto);
    });
  });

  describe('getOverride', () => {
    it('should return a specific override', async () => {
      const overrideId = '1_2024-01-01';
      const expectedResult = {
        id: overrideId,
        scheduleId: 1,
        overrideType: 'cancel',
      };

      jest.spyOn(service, 'getWeeklyOverride').mockResolvedValue(expectedResult as any);

      const result = await controller.getOverride(overrideId);

      expect(result).toEqual(expectedResult);
      expect(service.getWeeklyOverride).toHaveBeenCalledWith(overrideId);
    });
  });

  describe('deleteOverride', () => {
    it('should delete an override successfully', async () => {
      const overrideId = '1_2024-01-01';

      jest.spyOn(service, 'deleteWeeklyOverride').mockResolvedValue(true);

      const result = await controller.deleteOverride(overrideId);

      expect(result).toEqual({
        success: true,
        message: 'Override deleted',
      });
      expect(service.deleteWeeklyOverride).toHaveBeenCalledWith(overrideId);
    });

    it('should return failure when override not found', async () => {
      const overrideId = '1_2024-01-01';

      jest.spyOn(service, 'deleteWeeklyOverride').mockResolvedValue(false);

      const result = await controller.deleteOverride(overrideId);

      expect(result).toEqual({
        success: false,
        message: 'Override not found',
      });
    });
  });

  describe('getWeekOverrides', () => {
    it('should return overrides for current week', async () => {
      const targetWeek = 'current';
      const weekStartDate = '2024-01-01';
      const expectedOverrides = [
        { id: '1_2024-01-01', scheduleId: 1, overrideType: 'cancel' },
        { id: '2_2024-01-01', scheduleId: 2, overrideType: 'time_change' },
      ];

      jest.spyOn(service, 'getWeekStartDate').mockReturnValue(weekStartDate);
      jest.spyOn(service, 'getOverridesForWeek').mockResolvedValue(expectedOverrides as any);

      const result = await controller.getWeekOverrides(targetWeek);

      expect(result).toEqual(expectedOverrides);
      expect(service.getWeekStartDate).toHaveBeenCalledWith(targetWeek);
      expect(service.getOverridesForWeek).toHaveBeenCalledWith(weekStartDate);
    });

    it('should return overrides for next week', async () => {
      const targetWeek = 'next';
      const weekStartDate = '2024-01-08';
      const expectedOverrides = [
        { id: '1_2024-01-08', scheduleId: 1, overrideType: 'reschedule' },
      ];

      jest.spyOn(service, 'getWeekStartDate').mockReturnValue(weekStartDate);
      jest.spyOn(service, 'getOverridesForWeek').mockResolvedValue(expectedOverrides as any);

      const result = await controller.getWeekOverrides(targetWeek);

      expect(result).toEqual(expectedOverrides);
      expect(service.getWeekStartDate).toHaveBeenCalledWith(targetWeek);
      expect(service.getOverridesForWeek).toHaveBeenCalledWith(weekStartDate);
    });
  });

  describe('getAllOverrides', () => {
    it('should return current and next week overrides', async () => {
      const expectedResult = {
        currentWeek: [
          { id: '1_2024-01-01', scheduleId: 1, overrideType: 'cancel' },
        ],
        nextWeek: [
          { id: '2_2024-01-08', scheduleId: 2, overrideType: 'time_change' },
        ],
      };

      jest.spyOn(service, 'getCurrentAndNextWeekOverrides').mockResolvedValue(expectedResult as any);

      const result = await controller.getAllOverrides();

      expect(result).toEqual(expectedResult);
      expect(service.getCurrentAndNextWeekOverrides).toHaveBeenCalled();
    });
  });

  describe('cleanupExpired', () => {
    it('should cleanup expired overrides', async () => {
      const cleanedCount = 3;

      jest.spyOn(service, 'cleanupExpiredOverrides').mockResolvedValue(cleanedCount);

      const result = await controller.cleanupExpired();

      expect(result).toEqual({
        success: true,
        message: 'Cleaned up 3 expired overrides',
      });
      expect(service.cleanupExpiredOverrides).toHaveBeenCalled();
    });

    it('should handle no expired overrides', async () => {
      const cleanedCount = 0;

      jest.spyOn(service, 'cleanupExpiredOverrides').mockResolvedValue(cleanedCount);

      const result = await controller.cleanupExpired();

      expect(result).toEqual({
        success: true,
        message: 'Cleaned up 0 expired overrides',
      });
    });
  });
}); 