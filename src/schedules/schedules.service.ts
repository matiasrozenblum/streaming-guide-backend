import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOneOptions, FindManyOptions, FindOptionsWhere } from 'typeorm';
import { Schedule } from './schedules.entity';
import { Program } from '../programs/programs.entity';
import { CreateScheduleDto, CreateBulkSchedulesDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { YoutubeLiveService } from '../youtube/youtube-live.service';
import { RedisService } from '../redis/redis.service';
import { WeeklyOverridesService } from './weekly-overrides.service';
import { SentryService } from '../sentry/sentry.service';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import { getCurrentBlockTTL } from '@/utils/getBlockTTL.util';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfigService } from '../config/config.service';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://staging.laguiadelstreaming.com';
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || 'changeme';

interface FindAllOptions {
  dayOfWeek?: string;
  relations?: string[];
  select?: string[];
  skipCache?: boolean;
  applyOverrides?: boolean;
}

@Injectable()
export class SchedulesService {
  private dayjs: typeof dayjs;
  private notifyUtil: NotifyAndRevalidateUtil;

  constructor(
    @InjectRepository(Schedule)
    private schedulesRepository: Repository<Schedule>,

    @InjectRepository(Program)
    private programsRepository: Repository<Program>,

    private readonly redisService: RedisService,
    private readonly youtubeLiveService: YoutubeLiveService,
    private readonly notificationsService: NotificationsService,
    private readonly weeklyOverridesService: WeeklyOverridesService,
    private readonly configService: ConfigService,
    private readonly sentryService: SentryService,
  ) {
    this.dayjs = dayjs;
    this.dayjs.extend(utc);
    this.dayjs.extend(timezone);
    this.notifyUtil = new NotifyAndRevalidateUtil(
      this.redisService,
      FRONTEND_URL,
      REVALIDATE_SECRET
    );
  }

  async findAll(options: FindAllOptions = {}): Promise<any[]> {
    const startTime = Date.now();
    const { dayOfWeek, relations = ['program', 'program.channel', 'program.panelists'], select, skipCache = false, applyOverrides = true } = options;

    const cacheKey = `schedules:all:${dayOfWeek || 'all'}`;
    let schedules: Schedule[] | null = null;
    if (!skipCache) {
      console.log('[findAll] Checking Redis cache for', cacheKey);
      schedules = await this.redisService.get<Schedule[]>(cacheKey);
      if (schedules) {
        console.log('[findAll] Cache HIT for', cacheKey, 'in', Date.now() - startTime, 'ms');
      }
    }

    if (!schedules) {
      console.log('[findAll] Cache MISS for', cacheKey);
      const dbStart = Date.now();
      // Reverted to original query structure
      const queryBuilder = this.schedulesRepository
        .createQueryBuilder('schedule')
        .leftJoinAndSelect('schedule.program', 'program')
        .leftJoinAndSelect('program.channel', 'channel')
        .leftJoinAndSelect('program.panelists', 'panelists')
        .orderBy('schedule.start_time', 'ASC')
        .addOrderBy('panelists.id', 'ASC');
      
      if (dayOfWeek) {
        queryBuilder.where('schedule.day_of_week = :dayOfWeek', { dayOfWeek });
      }
      
      schedules = await queryBuilder.getMany();
      const dbQueryTime = Date.now() - dbStart;
      console.log('[findAll] DB query completed in', dbQueryTime, 'ms');
      console.log('[findAll] Raw schedules count:', schedules.length);
      console.log('[findAll] First few schedules:', schedules.slice(0, 3).map(s => ({
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        program_id: s.program_id,
        program: s.program ? { id: s.program.id, name: s.program.name } : null,
        channel: s.program?.channel ? { id: s.program.channel.id, name: s.program.channel.name } : null
      })));
      
      // Alert on slow database queries
      if (dbQueryTime > 3000) { // 3 seconds
        this.sentryService.captureMessage(
          `Slow database query in schedules service - ${dbQueryTime}ms`,
          'warning',
          {
            service: 'schedules',
            error_type: 'slow_database_query',
            query_time: dbQueryTime,
            day_of_week: dayOfWeek,
            cache_key: cacheKey,
            timestamp: new Date().toISOString(),
          }
        );
        
        this.sentryService.setTag('service', 'schedules');
        this.sentryService.setTag('error_type', 'slow_database_query');
      }
      
      // Original sorting logic
      schedules.sort((a, b) => {
        const aOrder = a.program?.channel?.order ?? 999;
        const bOrder = b.program?.channel?.order ?? 999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.start_time.localeCompare(b.start_time);
      });
      await this.redisService.set(cacheKey, schedules, 1800);
      console.log('[findAll] Database query and cache SET. Total time:', Date.now() - startTime, 'ms');
    }

    // Apply weekly overrides for current week (unless raw=true)
    if (applyOverrides) {
      const currentWeekStart = this.weeklyOverridesService.getWeekStartDate('current');
      const overridesStart = Date.now();
      console.log('[findAll] Applying weekly overrides...');
      schedules = await this.weeklyOverridesService.applyWeeklyOverrides(schedules!, currentWeekStart);
      console.log('[findAll] Weekly overrides applied in', Date.now() - overridesStart, 'ms');
    }

    const enrichStart = Date.now();
    console.log('[findAll] Enriching schedules...', schedules!.length, 'schedules');
    const enriched = await this.enrichSchedules(schedules!);
    console.log('[findAll] Enriched schedules in', Date.now() - enrichStart, 'ms');
    console.log('[findAll] Enriched result length:', enriched.length);

    console.log('[findAll] TOTAL time:', Date.now() - startTime, 'ms');
    return enriched;
  }

  async enrichSchedules(schedules: Schedule[]): Promise<any[]> {
    console.log('[enrichSchedules] Starting enrichment of', schedules.length, 'schedules');
    
    // Detect and log overlapping programs for debugging
    this.detectAndLogOverlaps(schedules);
    
    // Resolve overlaps and add display times
    const schedulesWithOverlapResolution = this.resolveOverlaps(schedules);
    
    const now = this.dayjs().tz('America/Argentina/Buenos_Aires');
    const currentNum = now.hour() * 100 + now.minute();
    const currentDay = now.format('dddd').toLowerCase();

    const enriched: any[] = [];

    for (const schedule of schedules) {
      const { program } = schedule;
      const channel = program.channel;
      const channelId = channel?.youtube_channel_id;
      const handle = channel?.handle;

      const startNum = this.convertTimeToNumber(schedule.start_time);
      const endNum = this.convertTimeToNumber(schedule.end_time);

      let isLive = false;
      let streamUrl = program.youtube_url;

      // Si estamos en horario y tenemos canal válido
      if (
        schedule.day_of_week === currentDay &&
        currentNum >= startNum &&
        currentNum < endNum &&
        handle &&
        channelId
      ) {
        // Set isLive to true if schedule is currently running
        isLive = true;
        
        // Validar feature-flag + feriado (fallback true si no existe)
        const canFetch = await this.configService.canFetchLive(handle);

        if (canFetch) {
          // Use new method with program-specific information for better matching
          const ttl = await getCurrentBlockTTL(channelId, schedules);
          const vid = await this.youtubeLiveService.getBestLiveStreamMatch(
            channelId,
            handle,
            program.name, // Pass program name for title matching
            schedule.start_time, // Pass program start time for time-based matching
            ttl,
            'onDemand'
          );
          if (vid && vid !== '__SKIPPED__') {
            streamUrl = `https://www.youtube.com/embed/${vid}?autoplay=1`;
          }
        }
      }

      const enrichedSchedule = {
        ...schedule,
        program: {
          ...program,
          is_live: isLive,
          stream_url: streamUrl,
        },
        // Add overlap resolution fields
        display_start_time: (schedule as any).display_start_time || schedule.start_time,
        display_end_time: (schedule as any).display_end_time || schedule.end_time,
        is_overlap: (schedule as any).is_overlap || false,
        overlap_group_id: (schedule as any).overlap_group_id || null,
        overlap_position: (schedule as any).overlap_position || 0,
        trimmed_end: (schedule as any).trimmed_end || false,
      };

      enriched.push(enrichedSchedule);
    }

    console.log('[enrichSchedules] Enriched', enriched.length, 'schedules');
    return enriched;
  }

  private convertTimeToNumber(time: string): number {
    // Handle both "HH:MM" and "HH:MM:SS" formats
    const parts = time.split(':').map(Number);
    const h = parts[0];
    const m = parts[1];
    return h * 100 + m;
  }

  private convertTimeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Detect and log overlapping programs for debugging purposes
   */
  private detectAndLogOverlaps(schedules: Schedule[]): void {
    // Group schedules by channel and day
    const channelDayGroups = new Map<string, Schedule[]>();
    
    for (const schedule of schedules) {
      const channelId = schedule.program?.channel?.id;
      const dayOfWeek = schedule.day_of_week;
      if (channelId && dayOfWeek) {
        const key = `${channelId}:${dayOfWeek}`;
        if (!channelDayGroups.has(key)) {
          channelDayGroups.set(key, []);
        }
        channelDayGroups.get(key)!.push(schedule);
      }
    }

    // Check each group for overlaps
    for (const [key, groupSchedules] of channelDayGroups) {
      if (groupSchedules.length < 2) continue;
      
      // Sort by start time
      groupSchedules.sort((a, b) => this.convertTimeToNumber(a.start_time) - this.convertTimeToNumber(b.start_time));
      
      let hasOverlaps = false;
      const overlaps: string[] = [];
      
      for (let i = 0; i < groupSchedules.length - 1; i++) {
        const current = groupSchedules[i];
        const next = groupSchedules[i + 1];
        
        const currentEnd = this.convertTimeToNumber(current.end_time);
        const nextStart = this.convertTimeToNumber(next.start_time);
        
        if (currentEnd > nextStart) {
          hasOverlaps = true;
          overlaps.push(
            `${current.program?.name || 'Unknown'} (${current.start_time}-${current.end_time}) overlaps with ${next.program?.name || 'Unknown'} (${next.start_time}-${next.end_time})`
          );
        }
      }
      
      if (hasOverlaps) {
        const [channelId, dayOfWeek] = key.split(':');
        console.log(`⚠️ Overlapping programs detected for channel ${channelId} on ${dayOfWeek}:`);
        overlaps.forEach(overlap => console.log(`   - ${overlap}`));
      }
    }
  }

  /**
   * Validate that a new schedule doesn't overlap with existing ones
   */
  private async validateNoOverlaps(
    programId: string,
    dayOfWeek: string,
    startTime: string,
    endTime: string
  ): Promise<void> {
    const program = await this.programsRepository.findOne({
      where: { id: +programId },
      relations: ['channel']
    });
    
    if (!program?.channel) {
      throw new NotFoundException('Program or channel not found');
    }

    const channelId = program.channel.id;
    const existingSchedules = await this.schedulesRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.program', 'program')
      .where('program.channel.id = :channelId', { channelId })
      .andWhere('schedule.day_of_week = :dayOfWeek', { dayOfWeek })
      .andWhere('schedule.program.id != :programId', { programId })
      .getMany();

    const newStart = this.convertTimeToNumber(startTime);
    const newEnd = this.convertTimeToNumber(endTime);

    for (const existing of existingSchedules) {
      const existingStart = this.convertTimeToNumber(existing.start_time);
      const existingEnd = this.convertTimeToNumber(existing.end_time);

      // Check for overlap: new schedule overlaps with existing
      if (
        (newStart < existingEnd && newEnd > existingStart) ||
        (existingStart < newEnd && existingEnd > newStart)
      ) {
        throw new Error(
          `Schedule overlaps with existing program "${existing.program.name}" (${existing.start_time}-${existing.end_time}). ` +
          `Please adjust the time range to avoid conflicts.`
        );
      }
    }
  }

  /**
   * Validate that bulk schedules don't overlap with each other
   */
  private async validateBulkNoOverlaps(schedules: any[]): Promise<void> {
    // Group by day of week
    const dayGroups = new Map<string, any[]>();
    
    for (const schedule of schedules) {
      const day = schedule.dayOfWeek;
      if (!dayGroups.has(day)) {
        dayGroups.set(day, []);
      }
      dayGroups.get(day)!.push(schedule);
    }

    // Check each day group for overlaps
    for (const [day, daySchedules] of dayGroups) {
      if (daySchedules.length < 2) continue;
      
      // Sort by start time
      daySchedules.sort((a, b) => this.convertTimeToNumber(a.startTime) - this.convertTimeToNumber(b.startTime));
      
      for (let i = 0; i < daySchedules.length - 1; i++) {
        const current = daySchedules[i];
        const next = daySchedules[i + 1];
        
        const currentEnd = this.convertTimeToNumber(current.endTime);
        const nextStart = this.convertTimeToNumber(next.startTime);
        
        if (currentEnd > nextStart) {
          throw new Error(
            `Bulk schedules overlap on ${day}: "${current.startTime}-${current.endTime}" overlaps with "${next.startTime}-${next.endTime}". ` +
            `Please adjust the time ranges to avoid conflicts.`
          );
        }
      }
    }
  }

  async findOne(id: string | number, options: { relations?: string[]; select?: string[] } = {}): Promise<Schedule> {
    const cacheKey = `schedules:${id}`;
    const cached = await this.redisService.get<Schedule>(cacheKey);
    if (cached) return cached;

    const findOptions: FindOneOptions<Schedule> = {
      where: { id: Number(id) },
      relations: options.relations,
    };
    const schedule = await this.schedulesRepository.findOne(findOptions);
    if (!schedule) throw new NotFoundException(`Schedule with ID ${id} not found`);

    await this.redisService.set(cacheKey, schedule, 1800);
    return schedule;
  }

  async findByProgram(programId: string): Promise<Schedule[]> {
    return this.schedulesRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.program', 'program')
      .leftJoinAndSelect('program.channel', 'channel')
      .leftJoinAndSelect('program.panelists', 'panelists')
      .where('program.id = :programId', { programId: Number(programId) })
      .orderBy('schedule.day_of_week', 'ASC')
      .addOrderBy('schedule.start_time', 'ASC')
      .addOrderBy('panelists.id', 'ASC')
      .getMany();
  }

  async findByDay(dayOfWeek: string): Promise<any[]> {
    return this.findAll({ dayOfWeek });
  }

  async create(dto: CreateScheduleDto): Promise<Schedule> {
    const program = await this.programsRepository.findOne({ where: { id: +dto.programId } });
    if (!program) throw new NotFoundException(`Program with ID ${dto.programId} not found`);
    
    // Check for overlapping schedules before creating
    await this.validateNoOverlaps(dto.programId, dto.dayOfWeek, dto.startTime, dto.endTime);
    
    const schedule = this.schedulesRepository.create({
      day_of_week: dto.dayOfWeek,
      start_time: dto.startTime,
      end_time: dto.endTime,
      program,
    });
    const saved = await this.schedulesRepository.save(schedule);
    await this.redisService.delByPattern('schedules:all:*');

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'schedule_created',
      entity: 'schedule',
      entityId: saved.id,
      payload: { schedule: saved },
      revalidatePaths: ['/'],
    });

    return saved;
  }

  async update(id: string, dto: UpdateScheduleDto): Promise<Schedule> {
    const schedule = await this.findOne(id);
    
    // Check for overlapping schedules before updating
    if (dto.dayOfWeek || dto.startTime || dto.endTime) {
      const newDayOfWeek = dto.dayOfWeek || schedule.day_of_week;
      const newStartTime = dto.startTime || schedule.start_time;
      const newEndTime = dto.endTime || schedule.end_time;
      
      await this.validateNoOverlaps(
        schedule.program_id.toString(),
        newDayOfWeek,
        newStartTime,
        newEndTime
      );
    }
    
    if (dto.dayOfWeek) schedule.day_of_week = dto.dayOfWeek;
    if (dto.startTime) schedule.start_time = dto.startTime;
    if (dto.endTime) schedule.end_time = dto.endTime;
    const updated = await this.schedulesRepository.save(schedule);
    await this.redisService.delByPattern('schedules:all:*');

    // Notify and revalidate
    console.log('📅 Sending schedule update notification for schedule ID:', id);
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'schedule_updated',
      entity: 'schedule',
      entityId: id,
      payload: { schedule: updated },
      revalidatePaths: ['/'],
    });

    return updated;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.schedulesRepository.delete(id);
    if ((result?.affected ?? 0) > 0) {
      await this.redisService.delByPattern('schedules:all:*');
      // Notify and revalidate
      await this.notifyUtil.notifyAndRevalidate({
        eventType: 'schedule_deleted',
        entity: 'schedule',
        entityId: id,
        payload: {},
        revalidatePaths: ['/'],
      });
      return true;
    }
    return false;
  }

  async createBulk(dto: CreateBulkSchedulesDto): Promise<Schedule[]> {
    const program = await this.programsRepository.findOne({ where: { id: +dto.programId } });
    if (!program) {
      throw new NotFoundException(`Program with ID ${dto.programId} not found`);
    }

    // Validate no overlaps within the bulk schedules
    await this.validateBulkNoOverlaps(dto.schedules);

    // Validate no overlaps with existing schedules
    for (const scheduleDto of dto.schedules) {
      await this.validateNoOverlaps(
        dto.programId,
        scheduleDto.dayOfWeek,
        scheduleDto.startTime,
        scheduleDto.endTime
      );
    }

    const schedules = dto.schedules.map(scheduleDto => this.schedulesRepository.create({
      day_of_week: scheduleDto.dayOfWeek,
      start_time: scheduleDto.startTime,
      end_time: scheduleDto.endTime,
      program,
    }));

    const savedSchedules = await this.schedulesRepository.save(schedules);
    await this.redisService.delByPattern('schedules:all:*');

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'schedules_bulk_created',
      entity: 'schedule',
      entityId: 'bulk',
      payload: { count: savedSchedules.length },
      revalidatePaths: ['/'],
    });

    return savedSchedules;
  }

  /**
   * Resolve overlapping programs and add display times
   * Later programs get priority in overlap periods
   */
  private resolveOverlaps(schedules: Schedule[]): Schedule[] {
    console.log('[resolveOverlaps] Starting overlap resolution for', schedules.length, 'schedules');
    
    // Group schedules by channel and day
    const channelDayGroups = new Map<string, Schedule[]>();
    
    for (const schedule of schedules) {
      const channelId = schedule.program?.channel?.id;
      const dayOfWeek = schedule.day_of_week;
      if (channelId && dayOfWeek) {
        const key = `${channelId}:${dayOfWeek}`;
        if (!channelDayGroups.has(key)) {
          channelDayGroups.set(key, []);
        }
        channelDayGroups.get(key)!.push(schedule);
      }
    }

    // Process each group for overlaps
    for (const [key, groupSchedules] of channelDayGroups) {
      console.log(`[resolveOverlaps] Processing group ${key} with ${groupSchedules.length} schedules`);
      
      if (groupSchedules.length < 2) {
        console.log(`[resolveOverlaps] Single program in group ${key}, adding display fields`);
        const schedule = groupSchedules[0];
        (schedule as any).display_start_time = schedule.start_time;
        (schedule as any).display_end_time = schedule.end_time;
        (schedule as any).is_overlap = false;
        (schedule as any).overlap_group_id = key;
        (schedule as any).overlap_position = 0;
        (schedule as any).trimmed_end = false;
        continue;
      }
      
      // Sort by start time
      groupSchedules.sort((a, b) => this.convertTimeToNumber(a.start_time) - this.convertTimeToNumber(b.start_time));
      console.log(`[resolveOverlaps] Sorted schedules for ${key}:`, groupSchedules.map(s => ({
        name: s.program?.name,
        start: s.start_time,
        end: s.end_time,
        startNum: this.convertTimeToNumber(s.start_time),
        endNum: this.convertTimeToNumber(s.end_time)
      })));
      
      // Resolve overlaps: later programs get priority
      for (let i = 0; i < groupSchedules.length - 1; i++) {
        const current = groupSchedules[i];
        const next = groupSchedules[i + 1];
        
        const currentEnd = this.convertTimeToNumber(current.end_time);
        const nextStart = this.convertTimeToNumber(next.start_time);
        
        console.log(`[resolveOverlaps] Checking overlap: ${current.program?.name} (ends ${current.end_time} = ${currentEnd}) vs ${next.program?.name} (starts ${next.start_time} = ${nextStart})`);
        
        // If there's an overlap, adjust the current program's display end time
        if (currentEnd > nextStart) {
          console.log(`[resolveOverlaps] OVERLAP DETECTED! Adjusting display times`);
          
          // Add display time fields to the current schedule
          (current as any).display_start_time = current.start_time;
          (current as any).display_end_time = next.start_time;
          (current as any).is_overlap = true;
          (current as any).overlap_group_id = key;
          (current as any).overlap_position = i;
          (current as any).trimmed_end = true;
          
          // Add display time fields to the next schedule (gets full time)
          (next as any).display_start_time = next.start_time;
          (next as any).display_end_time = next.end_time;
          (next as any).is_overlap = true;
          (next as any).overlap_group_id = key;
          (next as any).overlap_position = i + 1;
          (next as any).trimmed_end = false;
        } else {
          console.log(`[resolveOverlaps] No overlap, keeping original times`);
          
          // No overlap, add display time fields (same as original)
          (current as any).display_start_time = current.start_time;
          (current as any).display_end_time = current.end_time;
          (current as any).is_overlap = false;
          (current as any).overlap_group_id = key;
          (current as any).overlap_position = i;
          (current as any).trimmed_end = false;
          
          // For the last program, also add fields
          if (i === groupSchedules.length - 2) {
            (next as any).display_start_time = next.start_time;
            (next as any).display_end_time = next.end_time;
            (next as any).is_overlap = false;
            (next as any).overlap_group_id = key;
            (next as any).overlap_position = i + 1;
            (next as any).trimmed_end = false;
          }
        }
      }
    }

    // Log final result
    const schedulesWithOverlaps = schedules.filter(s => (s as any).is_overlap);
    if (schedulesWithOverlaps.length > 0) {
      console.log('[resolveOverlaps] Final result - schedules with overlaps:');
      schedulesWithOverlaps.forEach(s => {
        console.log(`  - ${s.program?.name}: ${s.start_time}-${s.end_time} → ${(s as any).display_start_time}-${(s as any).display_end_time} (overlap: ${(s as any).is_overlap})`);
      });
    } else {
      console.log('[resolveOverlaps] No overlaps detected, all schedules keep original times');
    }

    return schedules;
  }
}