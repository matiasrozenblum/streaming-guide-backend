import { Injectable, BadRequestException, NotFoundException, Inject, forwardRef } from '@nestjs/common';
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
    stream_url?: string;
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
  expiresAt: string; // Format: YYYY-MM-DD HH:mm:ss (Buenos Aires time)
  createdAt: Date;
  panelistIds?: number[]; // Array of panelist IDs assigned to this override (legacy, kept for backward compatibility)
  panelists?: Array<{ // Complete panelist objects for fast access
    id: number;
    name: string;
    photo_url?: string | null;
    bio?: string | null;
  }>;
  // Fields for special programs
  specialProgram?: {
    name: string;
    description?: string;
    channelId: number; // Legacy, kept for backward compatibility
    channel?: { // Complete channel object for fast access
      id: number;
      name: string;
      handle: string;
      youtube_channel_id: string;
      logo_url?: string;
      description?: string;
      order: number;
      is_visible: boolean;
    };
    imageUrl?: string;
    stream_url?: string;
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
    @Inject(forwardRef(() => {
      // Lazy import to avoid circular dependency at module load time
      const { SchedulesService } = require('./schedules.service');
      return SchedulesService;
    }))
    private readonly schedulesService: any,
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
    // Set expiration to next Monday at 00:00 Buenos Aires time
    const expiresAt = targetWeekStart.add(1, 'week').format('YYYY-MM-DD HH:mm:ss');

    // Validate override type requirements
    if ((dto.overrideType === 'time_change' || dto.overrideType === 'reschedule') && 
        (!dto.newStartTime || !dto.newEndTime)) {
      throw new BadRequestException('New start time and end time are required for time changes and reschedules');
    }

    if (dto.overrideType === 'reschedule' && !dto.newDayOfWeek) {
      throw new BadRequestException('New day of week is required for reschedules');
    }

    // Validate and fetch complete panelist objects if provided
    let completePanelists: any[] = [];
    if (dto.panelistIds && dto.panelistIds.length > 0) {
      const panelists = await this.panelistsRepository.find({
        where: { id: In(dto.panelistIds) },
      });
      if (panelists.length !== dto.panelistIds.length) {
        const foundIds = panelists.map(p => p.id);
        const missingIds = dto.panelistIds.filter(id => !foundIds.includes(id));
        throw new NotFoundException(`Panelists with IDs ${missingIds.join(', ')} not found`);
      }
      // Store complete panelist objects for fast access
      completePanelists = panelists;
    }

    // Fetch complete channel object for create overrides
    let completeChannel: any = null;
    if (dto.overrideType === 'create' && dto.specialProgram?.channelId) {
      const channelIdsArray = [dto.specialProgram.channelId];
      const placeholders = channelIdsArray.map((_, index) => `$${index + 1}`).join(',');
      const channels = await this.dataSource.query(`
        SELECT id, name, handle, youtube_channel_id, logo_url, description, "order", is_visible
        FROM channel 
        WHERE id IN (${placeholders})
      `, channelIdsArray);
      
      if (channels.length === 0) {
        throw new NotFoundException(`Channel with ID ${dto.specialProgram.channelId} not found`);
      }
      completeChannel = channels[0];
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
      panelistIds: dto.panelistIds, // Keep legacy field for backward compatibility
      panelists: completePanelists.length > 0 ? completePanelists : undefined, // Store complete objects
      specialProgram: dto.specialProgram ? {
        ...dto.specialProgram,
        channel: completeChannel, // Store complete channel object
      } : undefined,
    };

    // Store in Redis with expiration
    const expirationDate = this.dayjs(expiresAt).tz('America/Argentina/Buenos_Aires');
    const secondsUntilExpiry = expirationDate.diff(now, 'seconds');
    await this.redisService.set(`weekly_override:${overrideId}`, override, secondsUntilExpiry);

    // Clear unified schedule cache
    await this.redisService.del('schedules:week:complete');
    
    // Warm cache asynchronously (non-blocking)
    setImmediate(() => this.schedulesService?.warmSchedulesCache?.());

    return override;
  }

  /**
   * Update a weekly override
   */
  async updateWeeklyOverride(overrideId: string, dto: Partial<WeeklyOverrideDto>): Promise<WeeklyOverride> {
    // Get the existing override
    const existingOverride = await this.getWeeklyOverride(overrideId);
    if (!existingOverride) {
      throw new NotFoundException(`Weekly override with ID ${overrideId} not found`);
    }

    // Validate that either scheduleId or programId is provided (but not both) if they're being updated
    if (dto.scheduleId && dto.programId) {
      throw new BadRequestException('Cannot provide both scheduleId and programId. Use one or the other.');
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

    // Validate override type requirements
    if ((dto.overrideType === 'time_change' || dto.overrideType === 'reschedule') && 
        (!dto.newStartTime || !dto.newEndTime)) {
      throw new BadRequestException('New start time and end time are required for time changes and reschedules');
    }

    if (dto.overrideType === 'reschedule' && !dto.newDayOfWeek) {
      throw new BadRequestException('New day of week is required for reschedules');
    }

    // Validate and fetch complete panelist objects if provided
    let completePanelists: any[] = [];
    if (dto.panelistIds && dto.panelistIds.length > 0) {
      const panelists = await this.panelistsRepository.find({
        where: { id: In(dto.panelistIds) },
      });
      if (panelists.length !== dto.panelistIds.length) {
        const foundIds = panelists.map(p => p.id);
        const missingIds = dto.panelistIds.filter(id => !foundIds.includes(id));
        throw new NotFoundException(`Panelists with IDs ${missingIds.join(', ')} not found`);
      }
      // Store complete panelist objects for fast access
      completePanelists = panelists;
    } else if (existingOverride.panelists) {
      // Keep existing panelists if not updating
      completePanelists = existingOverride.panelists;
    }

    // Fetch complete channel object for create overrides
    let completeChannel: any = null;
    if (dto.overrideType === 'create' && dto.specialProgram?.channelId) {
      const channelIdsArray = [dto.specialProgram.channelId];
      const placeholders = channelIdsArray.map((_, index) => `$${index + 1}`).join(',');
      const channels = await this.dataSource.query(`
        SELECT id, name, handle, youtube_channel_id, logo_url, description, "order", is_visible
        FROM channel 
        WHERE id IN (${placeholders})
      `, channelIdsArray);
      
      if (channels.length === 0) {
        throw new NotFoundException(`Channel with ID ${dto.specialProgram.channelId} not found`);
      }
      completeChannel = channels[0];
    } else if (existingOverride.specialProgram?.channel) {
      // Keep existing channel if not updating
      completeChannel = existingOverride.specialProgram.channel;
    }

    // Create updated override object
    const updatedOverride: WeeklyOverride = {
      ...existingOverride,
      ...dto,
      // Preserve the original ID and creation date
      id: existingOverride.id,
      createdAt: existingOverride.createdAt,
      weekStartDate: existingOverride.weekStartDate,
      expiresAt: existingOverride.expiresAt,
      // Update complete objects
      panelists: completePanelists.length > 0 ? completePanelists : undefined,
      specialProgram: dto.specialProgram ? {
        ...dto.specialProgram,
        channel: completeChannel,
      } : existingOverride.specialProgram ? {
        ...existingOverride.specialProgram,
        channel: completeChannel,
      } : undefined,
    };

    // Save to Redis
    const key = `weekly_override:${overrideId}`;
    await this.redisService.set(key, updatedOverride, 60 * 60 * 24 * 7); // 7 days

    // Clear unified cache
    await this.redisService.del('schedules:week:complete');
    
    // Warm cache asynchronously (non-blocking)
    setImmediate(() => this.schedulesService?.warmSchedulesCache?.());

    return updatedOverride;
  }

  /**
   * Get a specific weekly override
   */
  async getWeeklyOverride(overrideId: string): Promise<WeeklyOverride | null> {
    const override = await this.redisService.get<WeeklyOverride>(`weekly_override:${overrideId}`);
    if (override) {
      // Migrate override to new structure if needed
      return await this.migrateOverrideToNewStructure(override);
    }
    return null;
  }

  /**
   * Migrate an override from old structure to new structure
   */
  private async migrateOverrideToNewStructure(override: WeeklyOverride): Promise<WeeklyOverride> {
    let needsMigration = false;
    const migratedOverride = { ...override };

    // Migrate panelists if we have panelistIds but no panelists
    if (override.panelistIds && override.panelistIds.length > 0 && !override.panelists) {
      console.log(`[OVERRIDE-MIGRATION] Migrating panelists for override ${override.id}`);
      try {
        const panelists = await this.panelistsRepository.find({
          where: { id: In(override.panelistIds) },
        });
        migratedOverride.panelists = panelists;
        needsMigration = true;
        console.log(`[OVERRIDE-MIGRATION] Migrated ${panelists.length} panelists for override ${override.id}`);
      } catch (error) {
        console.error(`[OVERRIDE-MIGRATION] Failed to migrate panelists for override ${override.id}:`, error.message);
        // Keep original structure if migration fails
      }
    }

    // Migrate channel if we have channelId but no channel object
    if (override.specialProgram?.channelId && !override.specialProgram?.channel) {
      console.log(`[OVERRIDE-MIGRATION] Migrating channel for override ${override.id}`);
      try {
        const channelIdsArray = [override.specialProgram.channelId];
        const placeholders = channelIdsArray.map((_, index) => `$${index + 1}`).join(',');
        const channels = await this.dataSource.query(`
          SELECT id, name, handle, youtube_channel_id, logo_url, description, "order", is_visible
          FROM channel 
          WHERE id IN (${placeholders})
        `, channelIdsArray);
        
        if (channels.length > 0) {
          migratedOverride.specialProgram = {
            ...migratedOverride.specialProgram!,
            channel: channels[0],
          };
          needsMigration = true;
          console.log(`[OVERRIDE-MIGRATION] Migrated channel for override ${override.id}`);
        }
      } catch (error) {
        console.error(`[OVERRIDE-MIGRATION] Failed to migrate channel for override ${override.id}:`, error.message);
        // Keep original structure if migration fails
      }
    }

    // Save migrated override back to cache if migration occurred
    if (needsMigration) {
      try {
        const key = `weekly_override:${override.id}`;
        // Calculate TTL based on expiration date
        const expirationDate = this.dayjs(override.expiresAt).tz('America/Argentina/Buenos_Aires');
        const now = this.dayjs().tz('America/Argentina/Buenos_Aires');
        const secondsUntilExpiry = Math.max(0, expirationDate.diff(now, 'seconds'));
        
        if (secondsUntilExpiry > 0) {
          await this.redisService.set(key, migratedOverride, secondsUntilExpiry);
          console.log(`[OVERRIDE-MIGRATION] Saved migrated override ${override.id} to cache`);
        }
      } catch (error) {
        console.error(`[OVERRIDE-MIGRATION] Failed to save migrated override ${override.id}:`, error.message);
      }
    }

    return migratedOverride;
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

    // OPTIMIZATION: Use Redis pipeline to fetch all overrides in one round trip
    if (keys.length > 0) {
      const pipeline = (this.redisService as any).client.pipeline();
      keys.forEach(key => pipeline.get(key));
      const results = await pipeline.exec();
      
      // Process pipeline results and migrate if needed
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result[0] === null && result[1]) { // No error and has data
          try {
            const override = JSON.parse(result[1]);
            // Migrate override to new structure if needed
            const migratedOverride = await this.migrateOverrideToNewStructure(override);
            overrides.push(migratedOverride);
          } catch (error) {
            console.warn(`[WEEKLY-OVERRIDES] Failed to parse override ${keys[i]}:`, error);
          }
        }
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
    await this.redisService.del('schedules:week:complete');
    
    // Warm cache asynchronously (non-blocking)
    setImmediate(() => this.schedulesService?.warmSchedulesCache?.());
    
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

    // OPTIMIZATION: Use complete panelist objects from cache (no DB queries needed)
    const panelistsMap = new Map<number, any>();
    for (const override of overrides) {
      if (override.panelists && override.panelists.length > 0) {
        for (const panelist of override.panelists) {
          panelistsMap.set(panelist.id, panelist);
        }
      }
    }

    // OPTIMIZATION: Use complete channel objects from cache (no DB queries needed)
    const channelsMap = new Map<number, any>();
    for (const override of overrides) {
      if (override.specialProgram?.channel) {
        channelsMap.set(override.specialProgram.channel.id, override.specialProgram.channel);
      }
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
            if (programOverride.panelists && programOverride.panelists.length > 0) {
              modifiedSchedule1.program = {
                ...modifiedSchedule1.program,
                panelists: programOverride.panelists,
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
            if (programOverride.panelists && programOverride.panelists.length > 0) {
              modifiedSchedule2.program = {
                ...modifiedSchedule2.program,
                panelists: programOverride.panelists,
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
          if (scheduleOverride.panelists && scheduleOverride.panelists.length > 0) {
            modifiedSchedule3.program = {
              ...modifiedSchedule3.program,
              panelists: scheduleOverride.panelists,
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
          if (scheduleOverride.panelists && scheduleOverride.panelists.length > 0) {
            modifiedSchedule4.program = {
              ...modifiedSchedule4.program,
              panelists: scheduleOverride.panelists,
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
        const channel = override.specialProgram.channel || channelsMap.get(override.specialProgram.channelId);
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
            stream_url: override.specialProgram.stream_url || null,
            channel: channel ? {
              id: channel.id,
              name: channel.name,
              handle: channel.handle,
              youtube_channel_id: channel.youtube_channel_id,
              logo_url: channel.logo_url,
              description: channel.description,
              order: channel.order,
            } : {
              id: override.specialProgram.channelId,
              name: 'Special Program', // Fallback if channel not found
            },
            // Add panelists if specified in the override
            panelists: override.panelists || [],
          },
        };
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

    // Use Buenos Aires timezone for accurate cleanup timing
    const now = this.dayjs().tz('America/Argentina/Buenos_Aires');
    let cleaned = 0;

    // OPTIMIZATION: Use Redis pipeline to fetch all overrides in one round trip
    if (keys.length > 0) {
      const pipeline = (this.redisService as any).client.pipeline();
      keys.forEach(key => pipeline.get(key));
      const results = await pipeline.exec();
      
      const expiredKeys: string[] = [];
      
      // Process pipeline results
      results.forEach((result, index) => {
        if (result[0] === null && result[1]) { // No error and has data
          try {
            const override = JSON.parse(result[1]);
            if (override && this.dayjs(override.expiresAt).tz('America/Argentina/Buenos_Aires').isBefore(now)) {
              expiredKeys.push(keys[index]);
            }
          } catch (error) {
            console.warn(`[WEEKLY-OVERRIDES] Failed to parse override ${keys[index]} for cleanup:`, error);
          }
        }
      });
      
      // Delete expired overrides
      for (const key of expiredKeys) {
        await this.redisService.del(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await this.redisService.del('schedules:week:complete');
      
      // Warm cache asynchronously (non-blocking)
      setImmediate(() => this.schedulesService?.warmSchedulesCache?.());
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
      await this.redisService.del('schedules:week:complete');
      
      // Warm cache asynchronously (non-blocking)
      setImmediate(() => this.schedulesService?.warmSchedulesCache?.());
    }
    return deleted;
  }
} 