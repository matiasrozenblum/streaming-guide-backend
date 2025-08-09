import { Controller, Get, Query, Res, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody, ApiParam } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { ReportsProxyService } from './reports-proxy.service';
import { UserDemographics, TopProgramsStats } from './statistics.service';
import { EmailService } from '../email/email.service';
import { Response } from 'express';
import { UnifiedReportDto } from './dto/unified-report.dto';
import { ChannelReportDto, ChannelReportEmailDto, PeriodicReportDto, PeriodicReportEmailDto } from './dto/channel-report.dto';

@ApiTags('statistics')
@Controller('statistics')
export class StatisticsController {
  constructor(
    private readonly statisticsService: StatisticsService,
    private readonly reportsProxyService: ReportsProxyService,
    private readonly emailService: EmailService,
  ) {}

  @Get('demographics')
  @ApiOperation({ summary: 'Get user demographics statistics' })
  @ApiResponse({ 
    status: 200, 
    description: 'User demographics data',
    schema: {
      type: 'object',
      properties: {
        totalUsers: { type: 'number' },
        byGender: {
          type: 'object',
          properties: {
            male: { type: 'number' },
            female: { type: 'number' },
            non_binary: { type: 'number' },
            rather_not_say: { type: 'number' },
          },
        },
        byAgeGroup: {
          type: 'object',
          properties: {
            under18: { type: 'number' },
            age18to30: { type: 'number' },
            age30to45: { type: 'number' },
            age45to60: { type: 'number' },
            over60: { type: 'number' },
          },
        },
        usersWithSubscriptions: { type: 'number' },
        usersWithoutSubscriptions: { type: 'number' },
      },
    },
  })
  async getUserDemographics(): Promise<UserDemographics> {
    return this.statisticsService.getUserDemographics();
  }

  @Get('popular-programs')
  @ApiOperation({ summary: 'Get popular programs by subscription count' })
  @ApiQuery({ 
    name: 'limit', 
    required: false, 
    type: Number, 
    description: 'Number of popular programs to return (default: 10)' 
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Popular programs by subscription count',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          programId: { type: 'number' },
          programName: { type: 'string' },
          channelName: { type: 'string' },
          subscriptionCount: { type: 'number' },
          percentageOfTotalUsers: { type: 'number' },
        },
      },
    },
  })
  async getTopPrograms(@Query('limit') limit?: number): Promise<TopProgramsStats[]> {
    return this.statisticsService.getTopPrograms(limit);
  }

  @Get('reports/users')
  @ApiOperation({ summary: 'Get paginated list of new users in a date range' })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Page size (default: 20)' })
  async getNewUsersReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
  ) {
    return this.statisticsService.getNewUsersReport(from, to, page, pageSize);
  }

  @Get('reports/subscriptions')
  @ApiOperation({ summary: 'Get paginated list of new subscriptions in a date range, optionally filtered by channel or program' })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Page size (default: 20)' })
  @ApiQuery({ name: 'channelId', required: false, type: Number, description: 'Filter by channel ID' })
  @ApiQuery({ name: 'programId', required: false, type: Number, description: 'Filter by program ID' })
  async getNewSubscriptionsReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('page') page: number = 1,
    @Query('pageSize') pageSize: number = 20,
    @Query('channelId') channelId?: number,
    @Query('programId') programId?: number,
  ) {
    return this.statisticsService.getNewSubscriptionsReport(from, to, page, pageSize, channelId, programId);
  }

  @Get('reports/users/download')
  @ApiOperation({ summary: 'Download users report as CSV or PDF' })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiQuery({ name: 'format', required: true, type: String, enum: ['csv', 'pdf'] })
  async downloadUsersReport(
    @Res() res: Response,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format: 'csv' | 'pdf',
  ) {
    const result = await this.reportsProxyService.generateReport({
      type: 'users',
      format,
      from,
      to,
    });
    
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="users_report_${from}_to_${to}.${format}"`);
    res.send(result);
  }

  @Get('reports/subscriptions/download')
  @ApiOperation({ summary: 'Download subscriptions report as CSV or PDF' })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiQuery({ name: 'format', required: true, type: String, enum: ['csv', 'pdf'] })
  @ApiQuery({ name: 'channelId', required: false, type: Number })
  @ApiQuery({ name: 'programId', required: false, type: Number })
  async downloadSubscriptionsReport(
    @Res() res: Response,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format: 'csv' | 'pdf',
    @Query('channelId') channelId: number = 0,
    @Query('programId') programId: number = 0,
  ) {
    const result = await this.reportsProxyService.generateReport({
      type: 'subscriptions',
      format,
      from,
      to,
      channelId,
      programId,
    });
    
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="subscriptions_report_${from}_to_${to}.${format}"`);
    res.send(result);
  }

  @Post('reports')
  @ApiOperation({ summary: 'Generate and download or email a report' })
  @ApiBody({ type: UnifiedReportDto })
  @ApiResponse({ status: 200, description: 'Report generated or emailed successfully' })
  async unifiedReport(@Body() body: UnifiedReportDto, @Res() res: Response) {
    try {
      // Handle array of reports
      if (body.reports && body.reports.length > 0) {
        const results: any[] = [];
        for (const report of body.reports) {
          const result = await this.processSingleReport(report);
          if (result) results.push(result);
        }
        return res.json({ success: true, results });
      }
      
      // Handle single report
      if (body.report) {
        const result = await this.processSingleReport(body.report);
        return res.json(result);
      }
      
      return res.status(400).json({ error: 'No report data provided' });
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }

  private async processSingleReport(report: any) {
    const { action, toEmail, ...reportParams } = report;
    
    if (action === 'table') {
      if (report.type === 'users') {
        const result = await this.statisticsService.getNewUsersReport(
          report.from, report.to, report.page ?? 1, report.pageSize ?? 20
        );
        return result;
      } else if (report.type === 'subscriptions') {
        const result = await this.statisticsService.getNewSubscriptionsReport(
          report.from, report.to, report.page ?? 1, report.pageSize ?? 20, report.channelId, report.programId
        );
        return result;
      } else {
        throw new Error('Invalid type for table action');
      }
    }
    
    let file = await this.reportsProxyService.generateReport(reportParams);
    if (typeof file === 'string') {
      file = Buffer.from(file);
    }
    const filename = `${report.type}_report_${report.from}_to_${report.to}.${report.format}`;
    
    if (action === 'download') {
      return { 
        success: true, 
        filename,
        contentType: report.format === 'csv' ? 'text/csv' : 'application/pdf',
        data: file.toString('base64')
      };
    } else if (action === 'email') {
      const recipient = toEmail || 'laguiadelstreaming@gmail.com';
      await this.emailService.sendReportWithAttachment({
        to: recipient,
        subject: `Reporte solicitado: ${filename}`,
        text: `Adjuntamos el reporte solicitado (${filename}).`,
        html: `<p>Adjuntamos el reporte solicitado (<b>${filename}</b>).</p>`,
        attachments: [{ filename, content: file, contentType: report.format === 'csv' ? 'text/csv' : 'application/pdf' }],
      });
      return { success: true, message: `Reporte enviado a ${recipient}` };
    } else {
      throw new Error('Invalid action');
    }
  }

  @Get('programs')
  @ApiOperation({ summary: 'Get all programs with subscription stats' })
  @ApiResponse({
    status: 200,
    description: 'List of all programs with subscription stats',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          programId: { type: 'number' },
          programName: { type: 'string' },
          channelName: { type: 'string' },
          totalSubscriptions: { type: 'number' },
          byGender: {
            type: 'object',
            properties: {
              male: { type: 'number' },
              female: { type: 'number' },
              non_binary: { type: 'number' },
              rather_not_say: { type: 'number' },
            },
          },
          byAgeGroup: {
            type: 'object',
            properties: {
              under18: { type: 'number' },
              age18to30: { type: 'number' },
              age30to45: { type: 'number' },
              age45to60: { type: 'number' },
              over60: { type: 'number' },
              unknown: { type: 'number' },
            },
          },
        },
      },
    },
  })
  async getAllProgramsStats() {
    return this.statisticsService.getAllProgramsStats();
  }

  @Get('reports/channel/:channelId')
  @ApiOperation({ summary: 'Get channel statistics for a specific date range' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', type: Number })
  @ApiQuery({ name: 'from', required: true, type: String, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'to', required: true, type: String, description: 'End date (YYYY-MM-DD)' })
  @ApiResponse({ status: 200, description: 'Channel statistics data' })
  async getChannelStats(
    @Param('channelId') channelId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.statisticsService.getChannelStats(parseInt(channelId), from, to);
  }

  @Get('reports/channel/:channelId/download')
  @ApiOperation({ summary: 'Download channel report as CSV or PDF' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', type: Number })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiQuery({ name: 'format', required: true, type: String, enum: ['csv', 'pdf'] })
  async downloadChannelReport(
    @Res() res: Response,
    @Param('channelId') channelId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format: 'csv' | 'pdf',
  ) {
    const channelIdNum = parseInt(channelId);
    const result = await this.statisticsService.generateChannelReport(channelIdNum, from, to, format);
    
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv' : 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="channel_${channelIdNum}_report_${from}_to_${to}.${format}"`);
    res.send(result);
  }

  @Post('reports/channel/:channelId/email')
  @ApiOperation({ summary: 'Email channel report' })
  @ApiParam({ name: 'channelId', description: 'Channel ID', type: Number })
  @ApiBody({ type: ChannelReportEmailDto })
  async emailChannelReport(
    @Param('channelId') channelId: string,
    @Body() body: ChannelReportEmailDto,
  ) {
    const channelIdNum = parseInt(channelId);
    await this.statisticsService.emailChannelReport(
      channelIdNum,
      body.from,
      body.to,
      body.format,
      body.toEmail,
    );
    return { success: true, message: `Channel report sent to ${body.toEmail}` };
  }

  @Get('reports/weekly/download')
  @ApiOperation({ summary: 'Download weekly report as PDF' })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiQuery({ name: 'channelId', required: false, type: Number })
  async downloadWeeklyReport(
    @Res() res: Response,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('channelId') channelId?: number,
  ) {
    const result = await this.statisticsService.generateWeeklyReport(from, to, channelId);
    
    const channelSuffix = channelId ? `_channel_${channelId}` : '';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="weekly_report${channelSuffix}_${from}_to_${to}.pdf"`);
    res.send(result);
  }

  @Post('reports/weekly/email')
  @ApiOperation({ summary: 'Email weekly report' })
  @ApiBody({ type: PeriodicReportEmailDto })
  async emailWeeklyReport(
    @Body() body: PeriodicReportEmailDto,
  ) {
    // For weekly reports, we need to use the weekly-specific method
    const result = await this.statisticsService.generateWeeklyReport(body.from, body.to, body.channelId);
    
    const channelSuffix = body.channelId ? `_channel_${body.channelId}` : '';
    const filename = `weekly_report${channelSuffix}_${body.from}_to_${body.to}.pdf`;
    
    await this.emailService.sendReportWithAttachment({
      to: body.toEmail,
      subject: `Reporte Semanal: ${filename}`,
      text: `Adjuntamos el reporte semanal solicitado (${filename}).`,
      html: `<p>Adjuntamos el reporte semanal solicitado (<b>${filename}</b>).</p>`,
      attachments: [{ 
        filename, 
        content: result, 
        contentType: 'application/pdf' 
      }],
    });
    
    return { success: true, message: `Weekly report sent to ${body.toEmail}` };
  }

  @Get('reports/periodic/:type/download')
  @ApiOperation({ summary: 'Download periodic report (monthly, quarterly, yearly) as PDF' })
  @ApiParam({ name: 'type', description: 'Report type', enum: ['monthly-summary', 'quarterly-summary', 'yearly-summary'] })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiQuery({ name: 'channelId', required: false, type: Number })
  async downloadPeriodicReport(
    @Res() res: Response,
    @Param('type') type: 'monthly-summary' | 'quarterly-summary' | 'yearly-summary',
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('channelId') channelId?: number,
  ) {
    const result = await this.statisticsService.generatePeriodicReport(type, from, to, channelId);
    
    const channelSuffix = channelId ? `_channel_${channelId}` : '';
    const reportType = type.replace('-summary', '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reportType}_report${channelSuffix}_${from}_to_${to}.pdf"`);
    res.send(result);
  }

  @Post('reports/periodic/:type/email')
  @ApiOperation({ summary: 'Email periodic report (monthly, quarterly, yearly)' })
  @ApiParam({ name: 'type', description: 'Report type', enum: ['monthly-summary', 'quarterly-summary', 'yearly-summary'] })
  @ApiBody({ type: PeriodicReportEmailDto })
  async emailPeriodicReport(
    @Param('type') type: 'monthly-summary' | 'quarterly-summary' | 'yearly-summary',
    @Body() body: PeriodicReportEmailDto,
  ) {
    await this.statisticsService.emailPeriodicReport(
      type,
      body.from,
      body.to,
      body.channelId,
      body.toEmail,
    );
    return { success: true, message: `${type.replace('-summary', '')} report sent to ${body.toEmail}` };
  }
} 