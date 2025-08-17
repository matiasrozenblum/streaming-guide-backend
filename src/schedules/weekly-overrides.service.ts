import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import { Schedule } from './schedules.entity';
import { Panelist } from '../panelists/panelists.entity';
import { RedisService } from '../redis/redis.service';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import * as updateLocale from 'dayjs/plugin/updateLocale';

export interface WeeklyOverrideDto {
  scheduleId?: number; // Optional for special programs or program-level overrides
  programId?: number; // Optional for program-level overrides
  targetWeek: 'current' | 'next';
  overrideType: 'cancel' | 'time_change' | 'reschedule' | 'create';
  newStartTime?: string;
  newEndTime?: string;
  newDayOfWeek?: string;
  reason?: string;
  createdBy?: string;
  panelistIds?: number[]; // Array of panelist IDs to assign to this override
  // Fields for creating special programs
  specialProgram?: {
    name: string;
    description?: string;
    channelId: number;
    imageUrl?: string;
  };
}

export interface WeeklyOverride {
  id: string;
  scheduleId?: number; // Optional for special programs or program-level overrides
  programId?: number; // Optional for program-level overrides
  weekStartDate: string;
  overrideType: 'cancel' | 'time_change' | 'reschedule' | 'create';
  newStartTime?: string;
  newEndTime?: string;
  newDayOfWeek?: string;
  reason?: string;
  createdBy?: string;
  expiresAt: string;
  createdAt: Date;
  panelistIds?: number[]; // Array of panelist IDs assigned to this override
  // Fields for special programs
  specialProgram?: {
    name: string;
    description?: string;
    channelId: number;
    imageUrl?: string;
  };
}

@Injectable()
export class WeeklyOverridesService {
  private dayjs: typeof dayjs;

  constructor(
    @InjectRepository(Schedule)
    private schedulesRepository: Repository<Schedule>,
    @InjectRepository(Panelist)
    private panelistsRepository: Repository<Panelist>,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
  ) {
    this.dayjs = dayjs;
    this.dayjs.extend(utc);
    this.dayjs.extend(timezone);
    this.dayjs.extend(updateLocale);
    // Set Monday as the first day of the week
    this.dayjs.updateLocale('en', {
      weekStart: 1
    });
  }

  /**
   * Create a weekly override
   */
  async createWeeklyOverride(dto: WeeklyOverrideDto): Promise<WeeklyOverride> {
    // Validate that either scheduleId or programId is provided (but not both)
    if (dto.scheduleId && dto.programId) {
      throw new BadRequestException('Cannot provide both scheduleId and programId. Use one or the other.');
    }

    if (!dto.scheduleId && !dto.programId && dto.overrideType !== 'create') {
      throw new BadRequestException('Either scheduleId or programId is required for non-create overrides');
    }

    // Validate schedule exists (only for non-create overrides with scheduleId)
    if (dto.overrideType !== 'create' && dto.scheduleId) {
      const schedule = await this.schedulesRepository.findOne({
        where: { id: dto.scheduleId },
        relations: ['program'],
      });

      if (!schedule) {
        throw new NotFoundException(`Schedule with ID ${dto.scheduleId} not found`);
      }
    }

    // Validate program exists (only for program-level overrides)
    if (dto.programId) {
      const program = await this.schedulesRepository.findOne({
        where: { program: { id: dto.programId } },
        relations: ['program'],
      });

      if (!program) {
        throw new NotFoundException(`Program with ID ${dto.programId} not found`);
      }
    }

    // Validate special program data for create overrides
    if (dto.overrideType === 'create') {
      if (!dto.specialProgram) {
        throw new BadRequestException('Special program data is required for create overrides');
      }
      if (!dto.specialProgram.name || !dto.specialProgram.channelId) {
        throw new BadRequestException('Special program name and channelId are required');
      }
      if (!dto.newStartTime || !dto.newEndTime || !dto.newDayOfWeek) {
        throw new BadRequestException('Start time, end time, and day of week are required for create overrides');
      }
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
    // Set expiration to next Monday at 00:00
    const expiresAt = targetWeekStart.add(1, 'week').format('YYYY-MM-DD');

    // Validate override type requirements
    if ((dto.overrideType === 'time_change' || dto.overrideType === 'reschedule') && 
        (!dto.newStartTime || !dto.newEndTime)) {
      throw new BadRequestException('New start time and end time are required for time changes and reschedules');
    }

    if (dto.overrideType === 'reschedule' && !dto.newDayOfWeek) {
      throw new BadRequestException('New day of week is required for reschedules');
    }

    // Validate panelist IDs if provided
    if (dto.panelistIds && dto.panelistIds.length > 0) {
      const panelists = await this.panelistsRepository.find({
        where: { id: In(dto.panelistIds) },
      });
      if (panelists.length !== dto.panelistIds.length) {
        const foundIds = panelists.map(p => p.id);
        const missingIds = dto.panelistIds.filter(id => !foundIds.includes(id));
        throw new NotFoundException(`Panelists with IDs ${missingIds.join(', ')} not found`);
      }
    }

    // Create override ID
    let overrideId: string;
    if (dto.overrideType === 'create') {
      overrideId = `special_${dto.specialProgram!.name.replace(/\s+/g, '_').toLowerCase()}_${weekStartDate}`;
    } else if (dto.programId) {
      overrideId = `program_${dto.programId}_${weekStartDate}`;
    } else {
      overrideId = `${dto.scheduleId}_${weekStartDate}`;
    }

    // Check if override already exists
    const existing = await this.getWeeklyOverride(overrideId);
    if (existing) {
      const entityType = dto.overrideType === 'create' ? 'this special program' : 
                        dto.programId ? `program ${dto.programId}` : `schedule ${dto.scheduleId}`;
      throw new BadRequestException(`An override already exists for ${entityType} on ${dto.targetWeek} week`);
    }

    const override: WeeklyOverride = {
      id: overrideId,
      scheduleId: dto.scheduleId,
      programId: dto.programId,
      weekStartDate,
      overrideType: dto.overrideType,
      newStartTime: dto.newStartTime,
      newEndTime: dto.newEndTime,
      newDayOfWeek: dto.newDayOfWeek?.toLowerCase(),
      reason: dto.reason,
      createdBy: dto.createdBy,
      expiresAt,
      createdAt: new Date(),
      specialProgram: dto.specialProgram,
      panelistIds: dto.panelistIds,
    };

    // Store in Redis with expiration
    const expirationDate = this.dayjs(expiresAt).tz('America/Argentina/Buenos_Aires');
    const secondsUntilExpiry = expirationDate.diff(now, 'seconds');
    await this.redisService.set(`weekly_override:${overrideId}`, override, secondsUntilExpiry);

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
    // This pattern will match: schedule_123_2024-01-01, program_456_2024-01-01, special_program_name_2024-01-01
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
    const start = Date.now();
    console.log('[applyWeeklyOverrides] START for week', weekStartDate, 'with', schedules.length, 'schedules');
    const overrides = await this.getOverridesForWeek(weekStartDate);
    
    if (overrides.length === 0) {
      console.log('[applyWeeklyOverrides] No overrides. Completed in', Date.now() - start, 'ms');
      return schedules;
    }

    // Separate different types of overrides
    const scheduleOverrides = overrides.filter(o => o.overrideType !== 'create' && o.scheduleId);
    const programOverrides = overrides.filter(o => o.overrideType !== 'create' && o.programId);
    const createOverrides = overrides.filter(o => o.overrideType === 'create');

    // Create override maps
    const scheduleOverrideMap = new Map<number, WeeklyOverride>();
    scheduleOverrides.forEach(override => {
      if (override.scheduleId) {
        scheduleOverrideMap.set(override.scheduleId, override);
      }
    });

    const programOverrideMap = new Map<number, WeeklyOverride>();
    programOverrides.forEach(override => {
      if (override.programId) {
        programOverrideMap.set(override.programId, override);
      }
    });

    // Get all panelist IDs from overrides to fetch them once
    const allPanelistIds = new Set<number>();
    overrides.forEach(override => {
      if (override.panelistIds) {
        override.panelistIds.forEach(id => allPanelistIds.add(id));
      }
    });

    // Fetch all panelists at once
    const panelistsMap = new Map<number, any>();
    if (allPanelistIds.size > 0) {
      const panelists = await this.panelistsRepository.find({
        where: { id: In(Array.from(allPanelistIds)) },
      });
      panelists.forEach(panelist => {
        panelistsMap.set(panelist.id, panelist);
      });
    }

    // Get all channel IDs from create overrides to fetch them once
    const allChannelIds = new Set<number>();
    createOverrides.forEach(override => {
      if (override.specialProgram?.channelId) {
        allChannelIds.add(override.specialProgram.channelId);
      }
    });

    // Fetch all channels at once
    const channelsMap = new Map<number, any>();
    if (allChannelIds.size > 0) {
      console.log('[applyWeeklyOverrides] Fetching channels for IDs:', Array.from(allChannelIds));
      const channels = await this.dataSource.query(`
        SELECT id, name, handle, youtube_channel_id, logo_url, description, "order"
        FROM channel 
        WHERE id IN (${Array.from(allChannelIds).join(',')})
      `);
      console.log('[applyWeeklyOverrides] Found channels:', channels);
      channels.forEach(channel => {
        channelsMap.set(channel.id, channel);
      });
      console.log('[applyWeeklyOverrides] Channels map size:', channelsMap.size);
    }

    const modifiedSchedules: Schedule[] = [];

    // Apply overrides to schedules
    for (const schedule of schedules) {
      // Check if the schedule's program has a program-level override
      const programOverride = schedule.program ? programOverrideMap.get(schedule.program.id) : null;
      
      if (programOverride) {
        // Handle program-level override
        switch (programOverride.overrideType) {
          case 'cancel':
            // Skip all schedules for this program
            continue;
          case 'time_change':
            // Apply time change to all schedules of this program
            const modifiedSchedule1 = {
              ...schedule,
              start_time: programOverride.newStartTime || schedule.start_time,
              end_time: programOverride.newEndTime || schedule.end_time,
              isWeeklyOverride: true,
              overrideType: programOverride.overrideType,
            } as any;
            
            // Add panelists if specified in the override
            if (programOverride.panelistIds && programOverride.panelistIds.length > 0) {
              modifiedSchedule1.program = {
                ...modifiedSchedule1.program,
                panelists: programOverride.panelistIds.map(id => panelistsMap.get(id)).filter(Boolean),
              };
            }
            
            modifiedSchedules.push(modifiedSchedule1);
            break;
          case 'reschedule':
            // Apply reschedule to all schedules of this program
            const modifiedSchedule2 = {
              ...schedule,
              start_time: programOverride.newStartTime || schedule.start_time,
              end_time: programOverride.newEndTime || schedule.end_time,
              day_of_week: programOverride.newDayOfWeek || schedule.day_of_week,
              isWeeklyOverride: true,
              overrideType: programOverride.overrideType,
            } as any;
            
            // Add panelists if specified in the override
            if (programOverride.panelistIds && programOverride.panelistIds.length > 0) {
              modifiedSchedule2.program = {
                ...modifiedSchedule2.program,
                panelists: programOverride.panelistIds.map(id => panelistsMap.get(id)).filter(Boolean),
              };
            }
            
            modifiedSchedules.push(modifiedSchedule2);
            break;
          default:
            modifiedSchedules.push(schedule);
        }
        continue;
      }

      // Check for schedule-specific override
      const scheduleOverride = scheduleOverrideMap.get(schedule.id);
      
      if (!scheduleOverride) {
        modifiedSchedules.push(schedule);
        continue;
      }

      switch (scheduleOverride.overrideType) {
        case 'cancel':
          // Skip cancelled programs
          continue;

        case 'time_change':
          const modifiedSchedule3 = {
            ...schedule,
            start_time: scheduleOverride.newStartTime || schedule.start_time,
            end_time: scheduleOverride.newEndTime || schedule.end_time,
            isWeeklyOverride: true,
            overrideType: scheduleOverride.overrideType,
          } as any;
          
          // Add panelists if specified in the override
          if (scheduleOverride.panelistIds && scheduleOverride.panelistIds.length > 0) {
            modifiedSchedule3.program = {
              ...modifiedSchedule3.program,
              panelists: scheduleOverride.panelistIds.map(id => panelistsMap.get(id)).filter(Boolean),
            };
          }
          
          modifiedSchedules.push(modifiedSchedule3);
          break;

        case 'reschedule':
          const modifiedSchedule4 = {
            ...schedule,
            start_time: scheduleOverride.newStartTime || schedule.start_time,
            end_time: scheduleOverride.newEndTime || schedule.end_time,
            day_of_week: scheduleOverride.newDayOfWeek || schedule.day_of_week,
            isWeeklyOverride: true,
            overrideType: scheduleOverride.overrideType,
          } as any;
          
          // Add panelists if specified in the override
          if (scheduleOverride.panelistIds && scheduleOverride.panelistIds.length > 0) {
            modifiedSchedule4.program = {
              ...modifiedSchedule4.program,
              panelists: scheduleOverride.panelistIds.map(id => panelistsMap.get(id)).filter(Boolean),
            };
          }
          
          modifiedSchedules.push(modifiedSchedule4);
          break;

        default:
          modifiedSchedules.push(schedule);
      }
    }

    // Add virtual schedules for create overrides
    for (const override of createOverrides) {
      if (override.specialProgram && override.newStartTime && override.newEndTime && override.newDayOfWeek) {
        const channel = channelsMap.get(override.specialProgram.channelId);
        console.log(`[applyWeeklyOverrides] Looking up channel ${override.specialProgram.channelId} for special program ${override.specialProgram.name}`);
        console.log(`[applyWeeklyOverrides] Channel found:`, channel);
        
        // Ensure we have a valid channel with required fields for enrichment
        if (!channel) {
          console.warn(`[applyWeeklyOverrides] Channel not found for special program ${override.specialProgram.name} (channelId: ${override.specialProgram.channelId})`);
          console.warn(`[applyWeeklyOverrides] Available channel IDs in map:`, Array.from(channelsMap.keys()));
          continue; // Skip this override if channel is not found
        }

        console.log(`[applyWeeklyOverrides] Creating virtual schedule for ${override.specialProgram.name} with channel:`, {
          id: channel.id,
          name: channel.name,
          handle: channel.handle,
          youtube_channel_id: channel.youtube_channel_id
        });

        const virtualSchedule: any = {
          id: `virtual_${override.id}`,
          day_of_week: override.newDayOfWeek,
          start_time: override.newStartTime,
          end_time: override.newEndTime,
          isWeeklyOverride: true,
          overrideType: override.overrideType,
          program: {
            id: `virtual_program_${override.id}`,
            name: override.specialProgram.name,
            description: override.specialProgram.description || '',
            logo_url: override.specialProgram.imageUrl || '',
            // Always use the found channel to ensure enrichment works
            channel: {
              id: channel.id,
              name: channel.name,
              handle: channel.handle,
              youtube_channel_id: channel.youtube_channel_id,
              logo_url: channel.logo_url,
              description: channel.description,
              order: channel.order,
            },
            // Add panelists if specified in the override
            panelists: override.panelistIds ? override.panelistIds.map(id => panelistsMap.get(id)).filter(Boolean) : [],
          },
        };
        console.log(`[applyWeeklyOverrides] Final virtual schedule structure:`, {
          id: virtualSchedule.id,
          day_of_week: virtualSchedule.day_of_week,
          start_time: virtualSchedule.start_time,
          end_time: virtualSchedule.end_time,
          program: {
            id: virtualSchedule.program.id,
            name: virtualSchedule.program.name,
            channel: {
              id: virtualSchedule.program.channel.id,
              handle: virtualSchedule.program.channel.handle,
              youtube_channel_id: virtualSchedule.program.channel.youtube_channel_id
            }
          }
        });
        modifiedSchedules.push(virtualSchedule);
      }
    }
    console.log('[applyWeeklyOverrides] Completed in', Date.now() - start, 'ms');
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

  /**
   * Delete all weekly overrides for a given program and its schedules
   */
  async deleteOverridesForProgram(programId: number, scheduleIds: number[]): Promise<number> {
    const pattern = 'weekly_override:*';
    const stream = (this.redisService as any).client.scanStream({ match: pattern });
    const keys: string[] = [];
    for await (const keyChunk of stream) {
      keys.push(...keyChunk);
    }
    let deleted = 0;
    for (const key of keys) {
      const override = await this.redisService.get<WeeklyOverride>(key);
      if (!override) continue;
      if (
        (override.programId && override.programId === programId) ||
        (override.scheduleId && scheduleIds.includes(override.scheduleId))
      ) {
        await this.redisService.del(key);
        deleted++;
      }
    }
    if (deleted > 0) {
      await this.redisService.delByPattern('schedules:all:*');
    }
    return deleted;
  }
} 