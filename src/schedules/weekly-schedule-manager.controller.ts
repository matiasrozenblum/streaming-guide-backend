import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { WeeklyScheduleManagerService } from './weekly-schedule-manager.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('weekly-schedule-manager')
@Controller('weekly-schedule-manager')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WeeklyScheduleManagerController {
  constructor(private readonly weeklyManagerService: WeeklyScheduleManagerService) {}

  @Post('trigger-reset')
  @ApiOperation({ summary: 'Manually trigger weekly schedule reset' })
  @ApiResponse({ status: 200, description: 'Weekly reset status' })
  triggerReset(): Promise<{ success: boolean; message: string }> {
    return this.weeklyManagerService.triggerManualReset();
  }

  @Get('current-week-stats')
  @ApiOperation({ summary: 'Get current week override statistics' })
  @ApiResponse({ status: 200, description: 'Current week statistics' })
  getCurrentWeekStats(): Promise<any> {
    return this.weeklyManagerService.getCurrentWeekStats();
  }

  @Get('upcoming-week-overrides')
  @ApiOperation({ summary: 'Get upcoming week override preview' })
  @ApiResponse({ status: 200, description: 'Upcoming week overrides' })
  getUpcomingWeekOverrides(): Promise<any> {
    return this.weeklyManagerService.getUpcomingWeekOverrides();
  }
} 