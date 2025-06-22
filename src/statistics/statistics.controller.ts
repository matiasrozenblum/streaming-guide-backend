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
} 