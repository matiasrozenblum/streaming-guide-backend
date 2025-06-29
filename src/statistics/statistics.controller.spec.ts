import { Test, TestingModule } from '@nestjs/testing';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';
import { ReportsProxyService } from './reports-proxy.service';
import { EmailService } from '../email/email.service';
import { NotFoundException } from '@nestjs/common';
import { Response } from 'express';

describe('StatisticsController', () => {
  let controller: StatisticsController;
  let statisticsService: StatisticsService;
  let reportsProxyService: ReportsProxyService;
  let emailService: EmailService;
  let res: Partial<Response>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatisticsController],
      providers: [
        {
          provide: StatisticsService,
          useValue: {
            getUserDemographics: jest.fn().mockResolvedValue({ totalUsers: 1 }),
            getTopPrograms: jest.fn().mockResolvedValue([]),
            getNewUsersReport: jest.fn().mockResolvedValue({ users: [], total: 0 }),
            getNewSubscriptionsReport: jest.fn().mockResolvedValue({ subscriptions: [], total: 0 }),
            getAllProgramsStats: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: ReportsProxyService,
          useValue: {
            generateReport: jest.fn().mockResolvedValue(Buffer.from('test')),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendReportWithAttachment: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    controller = module.get<StatisticsController>(StatisticsController);
    statisticsService = module.get<StatisticsService>(StatisticsService);
    reportsProxyService = module.get<ReportsProxyService>(ReportsProxyService);
    emailService = module.get<EmailService>(EmailService);
    res = {
      setHeader: jest.fn(),
      send: jest.fn(),
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should get user demographics', async () => {
    const result = await controller.getUserDemographics();
    expect(result).toEqual({ totalUsers: 1 });
    expect(statisticsService.getUserDemographics).toHaveBeenCalled();
  });

  it('should get top programs', async () => {
    const result = await controller.getTopPrograms(10);
    expect(result).toEqual([]);
    expect(statisticsService.getTopPrograms).toHaveBeenCalledWith(10);
  });

  it('should get new users report', async () => {
    const result = await controller.getNewUsersReport('2024-01-01', '2024-01-31', 1, 20);
    expect(result).toEqual({ users: [], total: 0 });
    expect(statisticsService.getNewUsersReport).toHaveBeenCalled();
  });

  it('should get new subscriptions report', async () => {
    const result = await controller.getNewSubscriptionsReport('2024-01-01', '2024-01-31', 1, 20, undefined, undefined);
    expect(result).toEqual({ subscriptions: [], total: 0 });
    expect(statisticsService.getNewSubscriptionsReport).toHaveBeenCalled();
  });

  it('should download users report', async () => {
    await controller.downloadUsersReport('2024-01-01', '2024-01-31', 'csv', res as Response);
    expect(reportsProxyService.generateReport).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalled();
  });

  it('should download subscriptions report', async () => {
    await controller.downloadSubscriptionsReport('2024-01-01', '2024-01-31', 'csv', 0, 0, res as Response);
    expect(reportsProxyService.generateReport).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalled();
  });

  it('should handle unifiedReport table action for users', async () => {
    const req = { action: 'table', type: 'users', from: '2024-01-01', to: '2024-01-31', page: 1, pageSize: 20 };
    await controller.unifiedReport(req as any, res as Response);
    expect(statisticsService.getNewUsersReport).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  it('should handle unifiedReport table action for subscriptions', async () => {
    const req = { action: 'table', type: 'subscriptions', from: '2024-01-01', to: '2024-01-31', page: 1, pageSize: 20 };
    await controller.unifiedReport(req as any, res as Response);
    expect(statisticsService.getNewSubscriptionsReport).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  it('should handle unifiedReport download action', async () => {
    const req = { action: 'download', type: 'users', from: '2024-01-01', to: '2024-01-31', format: 'csv' };
    await controller.unifiedReport(req as any, res as Response);
    expect(reportsProxyService.generateReport).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalled();
    expect(res.send).toHaveBeenCalled();
  });

  it('should handle unifiedReport email action', async () => {
    const req = { action: 'email', type: 'users', from: '2024-01-01', to: '2024-01-31', format: 'csv', toEmail: 'test@example.com' };
    await controller.unifiedReport(req as any, res as Response);
    expect(reportsProxyService.generateReport).toHaveBeenCalled();
    expect(emailService.sendReportWithAttachment).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalled();
  });

  it('should handle unifiedReport invalid action', async () => {
    const req = { action: 'invalid', type: 'users', from: '2024-01-01', to: '2024-01-31', format: 'csv' };
    await controller.unifiedReport(req as any, res as Response);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid action' });
  });

  it('should get all programs stats', async () => {
    const result = await controller.getAllProgramsStats();
    expect(result).toEqual([]);
    expect(statisticsService.getAllProgramsStats).toHaveBeenCalled();
  });
}); 