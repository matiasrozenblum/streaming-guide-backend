import { Controller, Get, Query, Res, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { ReportsProxyService } from './reports-proxy.service';
import { UserDemographics, TopProgramsStats } from './statistics.service';
import { EmailService } from '../email/email.service';
import { Response } from 'express';
import { UnifiedReportDto } from './dto/unified-report.dto';

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
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format: 'csv' | 'pdf',
    @Res() res: Response,
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
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format: 'csv' | 'pdf',
    @Query('channelId') channelId: number = 0,
    @Query('programId') programId: number = 0,
    @Res() res: Response,
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
    const { action, toEmail, ...reportParams } = body;
    if (action === 'table') {
      if (body.type === 'users') {
        const result = await this.statisticsService.getNewUsersReport(
          body.from, body.to, body.page ?? 1, body.pageSize ?? 20
        );
        return res.json(result);
      } else if (body.type === 'subscriptions') {
        const result = await this.statisticsService.getNewSubscriptionsReport(
          body.from, body.to, body.page ?? 1, body.pageSize ?? 20, body.channelId, body.programId
        );
        return res.json(result);
      } else {
        return res.status(400).json({ error: 'Invalid type for table action' });
      }
    }
    let file = await this.reportsProxyService.generateReport(reportParams);
    if (typeof file === 'string') {
      file = Buffer.from(file);
    }
    const filename = `${body.type}_report_${body.from}_to_${body.to}.${body.format}`;
    if (action === 'download') {
      res.setHeader('Content-Type', body.format === 'csv' ? 'text/csv' : 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(file);
    } else if (action === 'email') {
      const recipient = toEmail || 'laguiadelstreaming@gmail.com';
      await this.emailService.sendReportWithAttachment({
        to: recipient,
        subject: `Reporte solicitado: ${filename}`,
        text: `Adjuntamos el reporte solicitado (${filename}).`,
        html: `<p>Adjuntamos el reporte solicitado (<b>${filename}</b>).</p>`,
        attachments: [{ filename, content: file, contentType: body.format === 'csv' ? 'text/csv' : 'application/pdf' }],
      });
      res.json({ success: true, message: `Reporte enviado a ${recipient}` });
    } else {
      res.status(400).json({ error: 'Invalid action' });
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
} 