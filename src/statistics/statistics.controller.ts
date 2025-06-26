import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { StatisticsService } from './statistics.service';
import { UserDemographics, TopProgramsStats, ProgramSubscriptionStats } from './statistics.service';

@ApiTags('statistics')
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

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

  @Get('programs/:id')
  @ApiOperation({ summary: 'Get subscription statistics for a specific program' })
  @ApiParam({ name: 'id', description: 'Program ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Program subscription statistics',
    schema: {
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
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Program not found' })
  async getProgramSubscriptionStats(
    @Param('id', ParseIntPipe) programId: number,
  ): Promise<ProgramSubscriptionStats | null> {
    return this.statisticsService.getProgramSubscriptionStats(programId);
  }

  @Get('programs')
  @ApiOperation({ summary: 'Get subscription statistics for all programs' })
  @ApiResponse({ 
    status: 200, 
    description: 'All programs subscription statistics',
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
            },
          },
        },
      },
    },
  })
  async getAllProgramsSubscriptionStats(): Promise<ProgramSubscriptionStats[]> {
    return this.statisticsService.getAllProgramsSubscriptionStats();
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
} 