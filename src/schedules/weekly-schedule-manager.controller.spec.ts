import { Test, TestingModule } from '@nestjs/testing';
import { WeeklyScheduleManagerController } from './weekly-schedule-manager.controller';
import { WeeklyScheduleManagerService } from './weekly-schedule-manager.service';

describe('WeeklyScheduleManagerController', () => {
  let controller: WeeklyScheduleManagerController;
  let service: WeeklyScheduleManagerService;

  const mockWeeklyScheduleManagerService = {
    triggerManualReset: jest.fn(),
    getCurrentWeekStats: jest.fn(),
    getUpcomingWeekOverrides: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WeeklyScheduleManagerController],
      providers: [
        {
          provide: WeeklyScheduleManagerService,
          useValue: mockWeeklyScheduleManagerService,
        },
      ],
    }).compile();

    controller = module.get<WeeklyScheduleManagerController>(WeeklyScheduleManagerController);
    service = module.get<WeeklyScheduleManagerService>(WeeklyScheduleManagerService);
  });

  describe('triggerReset', () => {
    it('should trigger manual reset successfully', async () => {
      const expectedResult = {
        success: true,
        message: 'Weekly reset completed successfully',
      };

      jest.spyOn(service, 'triggerManualReset').mockResolvedValue(expectedResult);

      const result = await controller.triggerReset();

      expect(result).toEqual(expectedResult);
      expect(service.triggerManualReset).toHaveBeenCalled();
    });

    it('should handle reset failure', async () => {
      const expectedResult = {
        success: false,
        message: 'Weekly reset failed: Something went wrong',
      };

      jest.spyOn(service, 'triggerManualReset').mockResolvedValue(expectedResult);

      const result = await controller.triggerReset();

      expect(result).toEqual(expectedResult);
      expect(service.triggerManualReset).toHaveBeenCalled();
    });
  });

  describe('getCurrentWeekStats', () => {
    it('should return current week statistics', async () => {
      const expectedStats = {
        weekStart: '2024-01-01',
        totalOverrides: 3,
        byType: {
          cancel: 1,
          time_change: 1,
          reschedule: 1,
        },
      };

      jest.spyOn(service, 'getCurrentWeekStats').mockResolvedValue(expectedStats);

      const result = await controller.getCurrentWeekStats();

      expect(result).toEqual(expectedStats);
      expect(service.getCurrentWeekStats).toHaveBeenCalled();
    });

    it('should handle empty current week stats', async () => {
      const expectedStats = {
        weekStart: '2024-01-01',
        totalOverrides: 0,
        byType: {
          cancel: 0,
          time_change: 0,
          reschedule: 0,
        },
      };

      jest.spyOn(service, 'getCurrentWeekStats').mockResolvedValue(expectedStats);

      const result = await controller.getCurrentWeekStats();

      expect(result).toEqual(expectedStats);
      expect(service.getCurrentWeekStats).toHaveBeenCalled();
    });
  });

  describe('getUpcomingWeekOverrides', () => {
    it('should return upcoming week overrides', async () => {
      const expectedOverrides = {
        weekStart: '2024-01-08',
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
      };

      jest.spyOn(service, 'getUpcomingWeekOverrides').mockResolvedValue(expectedOverrides);

      const result = await controller.getUpcomingWeekOverrides();

      expect(result).toEqual(expectedOverrides);
      expect(service.getUpcomingWeekOverrides).toHaveBeenCalled();
    });

    it('should handle empty upcoming week overrides', async () => {
      const expectedOverrides = {
        weekStart: '2024-01-08',
        overridesCount: 0,
        overrides: [],
      };

      jest.spyOn(service, 'getUpcomingWeekOverrides').mockResolvedValue(expectedOverrides);

      const result = await controller.getUpcomingWeekOverrides();

      expect(result).toEqual(expectedOverrides);
      expect(service.getUpcomingWeekOverrides).toHaveBeenCalled();
    });
  });
}); 