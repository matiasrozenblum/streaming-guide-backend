import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule } from './schedules.entity';
import { Program } from '../programs/programs.entity';
import { RedisService } from '../redis/redis.service';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';

export interface WeeklyOverrideDto {
  scheduleId: number;
  targetWeek: 'current' | 'next';
  overrideType: 'cancel' | 'time_change' | 'reschedule';
  newStartTime?: string;
  newEndTime?: string;
  newDayOfWeek?: string;
  reason?: string;
  createdBy?: string;
}

export interface WeeklyOverride {
  id: string;
  scheduleId: number;
  weekStartDate: string;
  overrideType: 'cancel' | 'time_change' | 'reschedule';
  newStartTime?: string;
  newEndTime?: string;
  newDayOfWeek?: string;
  reason?: string;
  createdBy?: string;
  expiresAt: string;
  createdAt: Date;
}

@Injectable()
export class WeeklyOverridesService {
  private dayjs: typeof dayjs;

  constructor(
    @InjectRepository(Schedule)
    private schedulesRepository: Repository<Schedule>,
    private readonly redisService: RedisService,
  ) {
    this.dayjs = dayjs;
    this.dayjs.extend(utc);
    this.dayjs.extend(timezone);
  }

  /**
   * Create a weekly override
   */
  async createWeeklyOverride(dto: WeeklyOverrideDto): Promise<WeeklyOverride> {
    // Validate schedule exists
    const schedule = await this.schedulesRepository.findOne({
      where: { id: dto.scheduleId },
      relations: ['program'],
    });

    if (!schedule) {
      throw new NotFoundException(`Schedule with ID ${dto.scheduleId} not found`);
    }

    // Calculate target week
    const now = this.dayjs().tz('America/Argentina/Buenos_Aires');
    let targetWeekStart: dayjs.Dayjs;
    
    if (dto.targetWeek === 'current') {
      targetWeekStart = now.startOf('week');
    } else if (dto.targetWeek === 'next') {
      targetWeekStart = now.add(1, 'week').startOf('week');
    } else {
      throw new BadRequestException('targetWeek must be either "current" or "next"');
    }

    const weekStartDate = targetWeekStart.format('YYYY-MM-DD');
    const expiresAt = targetWeekStart.add(1, 'week').format('YYYY-MM-DD');

    // Validate override type requirements
    if ((dto.overrideType === 'time_change' || dto.overrideType === 'reschedule') && 
        (!dto.newStartTime || !dto.newEndTime)) {
      throw new BadRequestException('New start time and end time are required for time changes and reschedules');
    }

    if (dto.overrideType === 'reschedule' && !dto.newDayOfWeek) {
      throw new BadRequestException('New day of week is required for reschedules');
    }

    // Create override ID
    const overrideId = `${dto.scheduleId}_${weekStartDate}`;

    // Check if override already exists
    const existing = await this.getWeeklyOverride(overrideId);
    if (existing) {
      throw new BadRequestException(`An override already exists for schedule ${dto.scheduleId} on ${dto.targetWeek} week`);
    }

    const override: WeeklyOverride = {
      id: overrideId,
      scheduleId: dto.scheduleId,
      weekStartDate,
      overrideType: dto.overrideType,
      newStartTime: dto.newStartTime,
      newEndTime: dto.newEndTime,
      newDayOfWeek: dto.newDayOfWeek?.toLowerCase(),
      reason: dto.reason,
      createdBy: dto.createdBy,
      expiresAt,
      createdAt: new Date(),
    };

    // Store in Redis with expiration
    const daysUntilExpiry = this.dayjs(expiresAt).diff(now, 'days');
    await this.redisService.set(`weekly_override:${overrideId}`, override, daysUntilExpiry * 24 * 60 * 60);

    // Clear schedule caches
    await this.redisService.delByPattern('schedules:all:*');

    return override;
  }

  /**
   * Get a specific weekly override
   */
  async getWeeklyOverride(overrideId: string): Promise<WeeklyOverride | null> {
    return this.redisService.get<WeeklyOverride>(`weekly_override:${overrideId}`);
  }

  /**
   * Get all overrides for a specific week
   */
  async getOverridesForWeek(weekStartDate: string): Promise<WeeklyOverride[]> {
    // Use a more specific Redis key pattern for the target week
    const weekPattern = `weekly_override:*_${weekStartDate}`;
    const overrides: WeeklyOverride[] = [];
    
    // Use Redis SCAN to find matching keys
    const stream = (this.redisService as any).client.scanStream({ match: weekPattern });
    
    const keys: string[] = [];
    for await (const keyChunk of stream) {
      keys.push(...keyChunk);
    }

    // Fetch all matching overrides
    for (const key of keys) {
      const override = await this.redisService.get<WeeklyOverride>(key);
      if (override) {
        overrides.push(override);
      }
    }

    return overrides;
  }

  /**
   * Get overrides for current and next week
   */
  async getCurrentAndNextWeekOverrides(): Promise<{
    currentWeek: WeeklyOverride[];
    nextWeek: WeeklyOverride[];
  }> {
    const now = this.dayjs().tz('America/Argentina/Buenos_Aires');
    const currentWeekStart = now.startOf('week').format('YYYY-MM-DD');
    const nextWeekStart = now.add(1, 'week').startOf('week').format('YYYY-MM-DD');

    const [currentWeek, nextWeek] = await Promise.all([
      this.getOverridesForWeek(currentWeekStart),
      this.getOverridesForWeek(nextWeekStart),
    ]);

    return { currentWeek, nextWeek };
  }

  /**
   * Delete a weekly override
   */
  async deleteWeeklyOverride(overrideId: string): Promise<boolean> {
    const exists = await this.getWeeklyOverride(overrideId);
    if (!exists) {
      return false;
    }

    await this.redisService.del(`weekly_override:${overrideId}`);
    await this.redisService.delByPattern('schedules:all:*');
    return true;
  }

  /**
   * Apply weekly overrides to schedules for a specific week
   */
  async applyWeeklyOverrides(schedules: Schedule[], weekStartDate: string): Promise<Schedule[]> {
    const overrides = await this.getOverridesForWeek(weekStartDate);
    
    if (overrides.length === 0) {
      return schedules;
    }

    // Create override map
    const overrideMap = new Map<number, WeeklyOverride>();
    overrides.forEach(override => {
      overrideMap.set(override.scheduleId, override);
    });

    const modifiedSchedules: Schedule[] = [];

    // Apply overrides
    for (const schedule of schedules) {
      const override = overrideMap.get(schedule.id);
      
      if (!override) {
        modifiedSchedules.push(schedule);
        continue;
      }

      switch (override.overrideType) {
        case 'cancel':
          // Skip cancelled programs
          continue;

        case 'time_change':
          modifiedSchedules.push({
            ...schedule,
            start_time: override.newStartTime || schedule.start_time,
            end_time: override.newEndTime || schedule.end_time,
            isWeeklyOverride: true,
            overrideType: override.overrideType,
          } as any);
          break;

        case 'reschedule':
          modifiedSchedules.push({
            ...schedule,
            start_time: override.newStartTime || schedule.start_time,
            end_time: override.newEndTime || schedule.end_time,
            day_of_week: override.newDayOfWeek || schedule.day_of_week,
            isWeeklyOverride: true,
            overrideType: override.overrideType,
          } as any);
          break;

        default:
          modifiedSchedules.push(schedule);
      }
    }

    return modifiedSchedules;
  }

  /**
   * Get the week start date for current or next week
   */
  getWeekStartDate(targetWeek: 'current' | 'next'): string {
    const now = this.dayjs().tz('America/Argentina/Buenos_Aires');
    
    if (targetWeek === 'current') {
      return now.startOf('week').format('YYYY-MM-DD');
    } else {
      return now.add(1, 'week').startOf('week').format('YYYY-MM-DD');
    }
  }

  /**
   * Clean up expired overrides
   */
  async cleanupExpiredOverrides(): Promise<number> {
    const pattern = 'weekly_override:*';
    const overrides: WeeklyOverride[] = [];
    
    // Use Redis SCAN to find all weekly override keys
    const stream = (this.redisService as any).client.scanStream({ match: pattern });
    
    const keys: string[] = [];
    for await (const keyChunk of stream) {
      keys.push(...keyChunk);
    }

    const now = this.dayjs();
    let cleaned = 0;

    // Check each override for expiration
    for (const key of keys) {
      const override = await this.redisService.get<WeeklyOverride>(key);
      if (override && this.dayjs(override.expiresAt).isBefore(now)) {
        await this.redisService.del(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await this.redisService.delByPattern('schedules:all:*');
    }

    return cleaned;
  }
} 