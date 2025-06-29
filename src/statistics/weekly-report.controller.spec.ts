import { Test, TestingModule } from '@nestjs/testing';
import { WeeklyReportController } from './weekly-report.controller';
import { ReportsProxyService } from './reports-proxy.service';
import { Response } from 'express';

describe('WeeklyReportController', () => {
  let controller: WeeklyReportController;
  let reportsProxyService: ReportsProxyService;
  let res: Partial<Response>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WeeklyReportController],
      providers: [
        {
          provide: ReportsProxyService,
          useValue: {
            generateWeeklyReport: jest.fn().mockResolvedValue(Buffer.from('test')),
          },
        },
      ],
    }).compile();

    controller = module.get<WeeklyReportController>(WeeklyReportController);
    reportsProxyService = module.get<ReportsProxyService>(ReportsProxyService);
    res = {
      setHeader: jest.fn(),
      send: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should download weekly report', async () => {
    await controller.downloadWeeklyReport('2024-01-01', '2024-01-31', '1', res as Response);
    expect(reportsProxyService.generateWeeklyReport).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('weekly_report_2024-01-01_to_2024-01-31.pdf'));
    expect(res.send).toHaveBeenCalled();
  });
}); 