import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ReportsProxyService } from './reports-proxy.service';

@Controller('statistics/reports')
export class WeeklyReportController {
  constructor(private readonly reportsProxyService: ReportsProxyService) {}

  @Get('weekly-summary/download')
  async downloadWeeklyReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('channelId') channelId: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.reportsProxyService.generateWeeklyReport({
      from,
      to,
      channelId: channelId ? Number(channelId) : undefined,
    });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="weekly_report_${from}_to_${to}.pdf"`);
    res.send(pdfBuffer);
  }
} 