import { Controller, Get, Post, Delete, Body, Param, UseGuards, HttpStatus, Put } from '@nestjs/common';
import { WeeklyOverridesService, WeeklyOverrideDto } from './weekly-overrides.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('weekly-overrides')
@Controller('weekly-overrides')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WeeklyOverridesController {
  constructor(private readonly weeklyOverridesService: WeeklyOverridesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a weekly override' })
  @ApiResponse({ status: 201, description: 'Override created successfully' })
  async createOverride(@Body() dto: WeeklyOverrideDto) {
    return this.weeklyOverridesService.createWeeklyOverride(dto);
  }

  @Put(':overrideId')
  @ApiOperation({ summary: 'Update a weekly override' })
  @ApiResponse({ status: 200, description: 'Override updated successfully' })
  async updateOverride(
    @Param('overrideId') overrideId: string,
    @Body() dto: Partial<WeeklyOverrideDto>
  ) {
    return this.weeklyOverridesService.updateWeeklyOverride(overrideId, dto);
  }

  @Get(':overrideId')
  @ApiOperation({ summary: 'Get a specific weekly override' })
  @ApiResponse({ status: 200, description: 'Override details' })
  async getOverride(@Param('overrideId') overrideId: string) {
    return this.weeklyOverridesService.getWeeklyOverride(overrideId);
  }

  @Delete(':overrideId')
  @ApiOperation({ summary: 'Delete a weekly override' })
  @ApiResponse({ status: 200, description: 'Override deleted successfully' })
  async deleteOverride(@Param('overrideId') overrideId: string) {
    const deleted = await this.weeklyOverridesService.deleteWeeklyOverride(overrideId);
    return { success: deleted, message: deleted ? 'Override deleted' : 'Override not found' };
  }

  @Get('week/:targetWeek')
  @ApiOperation({ summary: 'Get all overrides for current or next week' })
  @ApiResponse({ status: 200, description: 'List of overrides for the week' })
  async getWeekOverrides(@Param('targetWeek') targetWeek: 'current' | 'next') {
    const weekStartDate = this.weeklyOverridesService.getWeekStartDate(targetWeek);
    return this.weeklyOverridesService.getOverridesForWeek(weekStartDate);
  }

  @Get()
  @ApiOperation({ summary: 'Get current and next week overrides' })
  @ApiResponse({ status: 200, description: 'Current and next week overrides' })
  async getAllOverrides() {
    return this.weeklyOverridesService.getCurrentAndNextWeekOverrides();
  }

  @Post('cleanup')
  @ApiOperation({ summary: 'Manually cleanup expired overrides' })
  @ApiResponse({ status: 200, description: 'Cleanup completed' })
  async cleanupExpired() {
    const cleaned = await this.weeklyOverridesService.cleanupExpiredOverrides();
    return { success: true, message: `Cleaned up ${cleaned} expired overrides` };
  }
} 