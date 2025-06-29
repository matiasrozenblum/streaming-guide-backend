import { Controller, Get, Query, Res, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { ReportsProxyService } from './reports-proxy.service';
import { UserDemographics, TopProgramsStats } from './statistics.service';
import { Response } from 'express';

@ApiTags('statistics')
@Controller('statistics')
export class StatisticsController {
  constructor(
    private readonly statisticsService: StatisticsService,
    private readonly reportsProxyService: ReportsProxyService,
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

  @Post('reports/users/email')
  @ApiOperation({ summary: 'Email users report as CSV or PDF' })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiQuery({ name: 'format', required: true, type: String, enum: ['csv', 'pdf'] })
  @ApiQuery({ name: 'toEmail', required: true, type: String })
  async emailUsersReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format: 'csv' | 'pdf',
    @Query('toEmail') toEmail: string,
  ) {
    return this.statisticsService.emailUsersReport(from, to, format, toEmail);
  }

  @Post('reports/subscriptions/email')
  @ApiOperation({ summary: 'Email subscriptions report as CSV or PDF' })
  @ApiQuery({ name: 'from', required: true, type: String })
  @ApiQuery({ name: 'to', required: true, type: String })
  @ApiQuery({ name: 'format', required: true, type: String, enum: ['csv', 'pdf'] })
  @ApiQuery({ name: 'channelId', required: false, type: Number })
  @ApiQuery({ name: 'programId', required: false, type: Number })
  @ApiQuery({ name: 'toEmail', required: true, type: String })
  async emailSubscriptionsReport(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format: 'csv' | 'pdf',
    @Query('channelId') channelId: number = 0,
    @Query('programId') programId: number = 0,
    @Query('toEmail') toEmail: string,
  ) {
    return this.statisticsService.emailSubscriptionsReport(from, to, format, channelId, programId, toEmail);
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