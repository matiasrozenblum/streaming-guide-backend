import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WeeklyOverridesService } from './weekly-overrides.service';
import { RedisService } from '../redis/redis.service';
import * as dayjs from 'dayjs';

@Injectable()
export class WeeklyScheduleManagerService {
  private readonly logger = new Logger(WeeklyScheduleManagerService.name);

  constructor(
    private readonly weeklyOverridesService: WeeklyOverridesService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Runs every Sunday at 11 PM to clean up old overrides and reset caches
   * This simulates the "Sunday reset" functionality
   */
  @Cron('0 23 * * 0', {
    name: 'weekly-schedule-reset',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  async performWeeklyReset(): Promise<void> {
    this.logger.log('Starting weekly schedule reset...');

    try {
      // 1. Clean up expired overrides
      const expiredCount = await this.weeklyOverridesService.cleanupExpiredOverrides();
      this.logger.log(`Cleaned up ${expiredCount} expired schedule overrides`);

      // 2. Clear all schedule caches to force fresh data
      await this.redisService.delByPattern('schedules:all:*');
      this.logger.log('Cleared all schedule caches');

      this.logger.log('Weekly schedule reset completed successfully');
    } catch (error) {
      this.logger.error('Error during weekly schedule reset:', error);
    }
  }

  /**
   * Manual trigger for weekly reset (useful for testing or emergency situations)
   */
  async triggerManualReset(): Promise<{ success: boolean; message: string }> {
    try {
      await this.performWeeklyReset();
      return {
        success: true,
        message: 'Weekly reset completed successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Weekly reset failed: ${error.message}`,
      };
    }
  }

  /**
   * Get upcoming week's overrides for preview
   */
  async getUpcomingWeekOverrides(): Promise<any> {
    const nextWeekStart = this.weeklyOverridesService.getWeekStartDate('next');
    const overrides = await this.weeklyOverridesService.getOverridesForWeek(nextWeekStart);

    return {
      weekStart: nextWeekStart,
      overridesCount: overrides.length,
      overrides: overrides.map(override => ({
        id: override.id,
        scheduleId: override.scheduleId,
        type: override.overrideType,
        reason: override.reason,
        createdBy: override.createdBy,
        expiresAt: override.expiresAt,
      })),
    };
  }

  /**
   * Get current week's override statistics
   */
  async getCurrentWeekStats(): Promise<any> {
    const currentWeekStart = this.weeklyOverridesService.getWeekStartDate('current');
    const overrides = await this.weeklyOverridesService.getOverridesForWeek(currentWeekStart);

    const stats = {
      weekStart: currentWeekStart,
      totalOverrides: overrides.length,
      byType: {
        cancel: overrides.filter(o => o.overrideType === 'cancel').length,
        time_change: overrides.filter(o => o.overrideType === 'time_change').length,
        reschedule: overrides.filter(o => o.overrideType === 'reschedule').length,
      },
    };

    return stats;
  }
} 