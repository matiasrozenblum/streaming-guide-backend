import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOneOptions, FindManyOptions, FindOptionsWhere } from 'typeorm';
import { Schedule } from './schedules.entity';
import { Program } from '../programs/programs.entity';
import { CreateScheduleDto, CreateBulkSchedulesDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { YoutubeLiveService } from '../youtube/youtube-live.service';
import { LiveStream } from '../youtube/interfaces/live-stream.interface';
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
import { TimezoneUtil } from '../utils/timezone.util';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://staging.laguiadelstreaming.com';
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || 'changeme';

interface FindAllOptions {
  dayOfWeek?: string;
  relations?: string[];
  select?: string[];
  skipCache?: boolean;
  applyOverrides?: boolean;
  liveStatus?: boolean;
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
    const { dayOfWeek, relations = ['program', 'program.channel', 'program.panelists'], select, skipCache = false, applyOverrides = true, liveStatus = false } = options;

    // UNIFIED CACHE KEY: Always cache complete week data
    const cacheKey = 'schedules:week:complete';
    let schedules: Schedule[] | null = null;
    
    // Try cache first (unless skipCache is true)
    if (!skipCache) {
      schedules = await this.redisService.get<Schedule[]>(cacheKey);
      if (schedules) {
        console.log(`[SCHEDULES-CACHE] HIT for ${cacheKey} (${Date.now() - startTime}ms) - ${schedules.length} total schedules`);
        
        // Filter by day if requested (after cache hit)
        if (dayOfWeek) {
          const originalCount = schedules.length;
          schedules = schedules.filter(s => s.day_of_week === dayOfWeek);
          console.log(`[SCHEDULES-CACHE] Filtered to ${dayOfWeek}: ${schedules.length}/${originalCount} schedules`);
        }
        
        // Cache hit - proceed to process schedules (overrides + enrichment)
        return this.processSchedules(schedules, options, startTime);
      }
    }

    // Cache miss - implement distributed lock to prevent thundering herd
    console.log(`[SCHEDULES-CACHE] MISS for unified cache ${cacheKey}`);
    const lockKey = `lock:${cacheKey}`;
    let lockAcquired = false;
    
    if (!skipCache) {
      // Try to acquire lock (10 second TTL)
      lockAcquired = await this.redisService.setNX(lockKey, '1', 10);
      
      if (!lockAcquired) {
        // Another request is fetching - wait and retry from cache
        console.log(`[SCHEDULES-CACHE] Lock held by another request, waiting for unified cache to populate...`);
        
        // Wait up to 8 seconds for the other request to populate cache
        for (let i = 0; i < 80; i++) {
          await new Promise(r => setTimeout(r, 100));
          schedules = await this.redisService.get<Schedule[]>(cacheKey);
          if (schedules) {
            console.log(`[SCHEDULES-CACHE] Unified cache populated by another request after ${(i + 1) * 100}ms`);
            
            // Filter by day if requested (after cache hit)
            if (dayOfWeek) {
              const originalCount = schedules.length;
              schedules = schedules.filter(s => s.day_of_week === dayOfWeek);
              console.log(`[SCHEDULES-CACHE] Filtered to ${dayOfWeek}: ${schedules.length}/${originalCount} schedules`);
            }
            
            return this.processSchedules(schedules, options, startTime);
          }
        }
        
        // Timeout waiting for cache - log warning and proceed to fetch
        console.warn(`[SCHEDULES-CACHE] Lock timeout after 8s, proceeding to fetch anyway`);
      } else {
        console.log(`[SCHEDULES-CACHE] Lock acquired for unified cache ${cacheKey}`);
      }
    }

    // Fetch from database (either skipCache=true, lock acquired, or lock timeout)
    try {
      // Always fetch complete week data (ignore dayOfWeek filter for DB query)
      schedules = await this.fetchSchedulesFromDatabase(undefined, relations); // No day filter
      
      // Store complete week in unified cache
      await this.redisService.set(cacheKey, schedules, 1800);
      console.log(`[SCHEDULES-CACHE] Stored ${schedules.length} complete week schedules in unified cache`);
      
      // Filter by day if requested (after storing complete data)
      if (dayOfWeek) {
        const originalCount = schedules.length;
        schedules = schedules.filter(s => s.day_of_week === dayOfWeek);
        console.log(`[SCHEDULES-CACHE] Filtered to ${dayOfWeek}: ${schedules.length}/${originalCount} schedules`);
      }
      
      // Process and return
      return this.processSchedules(schedules, options, startTime);
    } finally {
      // Always release lock if we acquired it
      if (lockAcquired) {
        await this.redisService.del(lockKey);
        console.log(`[SCHEDULES-CACHE] Released lock for unified cache ${cacheKey}`);
      }
    }
  }

  /**
   * Fetch schedules from database with all relations
   * Separated method to ensure data consistency
   */
  private async fetchSchedulesFromDatabase(dayOfWeek?: string, relations?: string[]): Promise<Schedule[]> {
    const dbStart = Date.now();
    console.log(`[SCHEDULES-DB] Starting query for ${dayOfWeek || 'all days'} at ${new Date().toISOString()}`);
    
    // Optimized query structure - selective panelists join to prevent data explosion
    // CRITICAL: This preserves ALL data - channel, program, panelists, categories
    const queryBuilder = this.schedulesRepository
      .createQueryBuilder('schedule')
      .leftJoinAndSelect('schedule.program', 'program')
      .leftJoinAndSelect('program.channel', 'channel')
      .leftJoinAndSelect('channel.categories', 'categories') // Preserve categories
      .leftJoin('program.panelists', 'panelists')
      .addSelect(['panelists.id', 'panelists.name']) // Only select id and name to prevent data explosion
      .orderBy('schedule.start_time', 'ASC')
      .addOrderBy('panelists.id', 'ASC');
    
    if (dayOfWeek) {
      queryBuilder.where('schedule.day_of_week = :dayOfWeek', { dayOfWeek });
    }
    
    const schedules = await queryBuilder.getMany();
    const dbQueryTime = Date.now() - dbStart;
    console.log(`[SCHEDULES-DB] Query completed (${dbQueryTime}ms) - ${schedules.length} schedules`);
    
    // Debug: Check data completeness
    const schedulesWithPanelists = schedules.filter(s => s.program?.panelists && s.program.panelists.length > 0);
    const totalPanelists = schedules.reduce((sum, s) => sum + (s.program?.panelists?.length || 0), 0);
    const schedulesWithCategories = schedules.filter(s => s.program?.channel?.categories && s.program.channel.categories.length > 0);
    console.log(`[SCHEDULES-DB] Data completeness - Schedules: ${schedules.length}, With panelists: ${schedulesWithPanelists.length}, Total panelists: ${totalPanelists}, With categories: ${schedulesWithCategories.length}`);
    
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
    
    return schedules;
  }

  /**
   * Process schedules: apply overrides and enrich with live status
   * Ensures consistent data processing regardless of cache hit/miss
   */
  private async processSchedules(schedules: Schedule[], options: FindAllOptions, startTime: number): Promise<any[]> {
    // Apply weekly overrides for current week (unless raw=true)
    if (options.applyOverrides) {
      const currentWeekStart = this.weeklyOverridesService.getWeekStartDate('current');
      const overridesStart = Date.now();
      console.log('[SCHEDULES-OVERRIDES] Applying weekly overrides...');
      schedules = await this.weeklyOverridesService.applyWeeklyOverrides(schedules, currentWeekStart);
      console.log(`[SCHEDULES-OVERRIDES] Applied overrides (${Date.now() - overridesStart}ms)`);
      
      // Re-filter by day_of_week after applying overrides
      // This is necessary because applyWeeklyOverrides adds ALL create overrides regardless of day
      if (options.dayOfWeek) {
        const beforeFilter = schedules.length;
        schedules = schedules.filter(s => s.day_of_week === options.dayOfWeek);
        if (beforeFilter !== schedules.length) {
          console.log(`[SCHEDULES-OVERRIDES] Re-filtered to ${options.dayOfWeek}: ${schedules.length}/${beforeFilter} schedules (removed ${beforeFilter - schedules.length} from other days)`);
        }
      }
    }

    // Enrich with live status if requested
    const enrichStart = Date.now();
    console.log(`[SCHEDULES-ENRICH] Enriching ${schedules.length} schedules...`);
    const enriched = await this.enrichSchedules(schedules, options.liveStatus || false);
    console.log(`[SCHEDULES-ENRICH] Enriched ${schedules.length} schedules (${Date.now() - enrichStart}ms)`);
    console.log(`[SCHEDULES-TOTAL] Completed in ${Date.now() - startTime}ms`);
    return enriched;
  }




  /**
   * Warm unified cache after invalidation to prevent thundering herd
   * This runs asynchronously and doesn't block the CRUD operation
   * PUBLIC: Can be called by other services (Programs, Channels, etc.) after cache invalidation
   */
  async warmSchedulesCache(): Promise<void> {
    console.log('[CACHE-WARM] Starting unified cache warming...');
    const warmStart = Date.now();
    
    try {
      // Warm unified cache (complete week data)
      // This single call populates the cache for ALL services (users, background jobs, YouTube service)
      await this.findAll({ 
        skipCache: true, 
        liveStatus: false, 
        applyOverrides: true 
      });
      console.log(`[CACHE-WARM] Warmed unified cache (complete week data)`);
      
      
      console.log(`[CACHE-WARM] Cache warming completed in ${Date.now() - warmStart}ms`);
    } catch (error) {
      console.error('[CACHE-WARM] Failed to warm unified cache:', error);
      // Log to Sentry but don't throw - cache warming failure shouldn't break operations
      this.sentryService.captureException(error);
    }
  }

  async enrichSchedules(schedules: Schedule[], liveStatus: boolean = false): Promise<any[]> {
    const now = TimezoneUtil.now();
    const currentNum = TimezoneUtil.currentTimeInMinutes();
    const currentDay = TimezoneUtil.currentDayOfWeek();

    // Group schedules by channel for stream distribution
    const channelGroups = new Map<string, Schedule[]>();
    for (const schedule of schedules) {
      const channelId = schedule.program.channel?.youtube_channel_id;
      if (channelId) {
        if (!channelGroups.has(channelId)) {
          channelGroups.set(channelId, []);
        }
        channelGroups.get(channelId)!.push(schedule);
      }
    }

    const enriched: any[] = [];

    // OPTIMIZATION: Skip expensive live status fetching during schedule enrichment
    // Live status will be handled by OptimizedSchedulesService using cached data
    let batchStreamsResults = new Map<string, any>();
    if (liveStatus && channelGroups.size > 0) {
      
      // Trigger async background fetch for live status (non-blocking)
      const liveChannelIds: string[] = [];
      for (const [channelId, channelSchedules] of channelGroups) {
        const liveSchedules = channelSchedules.filter(schedule => {
          const startNum = this.convertTimeToNumber(schedule.start_time);
          const endNum = this.convertTimeToNumber(schedule.end_time);
          return schedule.day_of_week === currentDay &&
                 currentNum >= startNum &&
                 currentNum < endNum;
        });
        
        if (liveSchedules.length > 0) {
          liveChannelIds.push(channelId);
        }
      }
      
      if (liveChannelIds.length > 0) {
        // Trigger async background fetch (non-blocking)
        setImmediate(async () => {
          try {
            // Background live status will be handled by OptimizedSchedulesService
          } catch (error) {
            console.error('[enrichSchedules] Error in async live status fetch:', error.message);
          }
        });
      }
    }

    // Process each channel group to distribute streams
    for (const [channelId, channelSchedules] of channelGroups) {
      const enrichedChannelSchedules = await this.enrichSchedulesForChannel(
        channelSchedules,
        currentDay,
        currentNum,
        liveStatus,
        batchStreamsResults.get(channelId)
      );
      enriched.push(...enrichedChannelSchedules);
    }

    // Add schedules without channels (no grouping needed)
    const schedulesWithoutChannels = schedules.filter(s => !s.program.channel?.youtube_channel_id);
    for (const schedule of schedulesWithoutChannels) {
      const { program } = schedule;
      const startNum = this.convertTimeToNumber(schedule.start_time);
      const endNum = this.convertTimeToNumber(schedule.end_time);

      let isLive = false;
      let streamUrl = program.stream_url || program.youtube_url;

      // Only set isLive if liveStatus is enabled
      if (liveStatus && (
        schedule.day_of_week === currentDay &&
        currentNum >= startNum &&
        currentNum < endNum &&
        program.name && 
        program.name.trim() !== ''
      )) {
        isLive = true;
      }

      enriched.push({
        ...schedule,
        program: {
          ...program,
          is_live: isLive,
          stream_url: streamUrl,
          live_streams: null,
          stream_count: 0,
          panelists: program.panelists || [], // Preserve panelists data
        },
      });
    }

    console.log('[enrichSchedules] Enriched', enriched.length, 'schedules');
    return enriched;
  }

  private async enrichSchedulesForChannel(
    schedules: Schedule[],
    currentDay: string,
    currentNum: number,
    liveStatus: boolean,
    batchStreamsResult?: any
  ): Promise<any[]> {
    const enriched: any[] = [];
    
    // Get channel info from first schedule
    const channel = schedules[0].program.channel;
    const channelId = channel?.youtube_channel_id;
    const handle = channel?.handle;
    
    if (!channelId || !handle) {
      // No channel info, process individually
      for (const schedule of schedules) {
        enriched.push(await this.enrichScheduleIndividually(schedule, currentDay, currentNum, liveStatus));
      }
      return enriched;
    }

    // Find live schedules for this channel (only if liveStatus is enabled)
    const liveSchedules = liveStatus ? schedules.filter(schedule => {
      const startNum = this.convertTimeToNumber(schedule.start_time);
      const endNum = this.convertTimeToNumber(schedule.end_time);
      return schedule.day_of_week === currentDay &&
             currentNum >= startNum &&
             currentNum < endNum &&
             schedule.program.name && 
             schedule.program.name.trim() !== '';
    }) : [];

    let allStreams: any[] = [];
    let channelStreamCount = 0;

    // Use batch results or fetch streams individually if needed
    if (liveSchedules.length > 0 && liveStatus) {
      const canFetch = await this.configService.canFetchLive(handle);
      
      if (canFetch) {
        // Use batch results if available
        if (batchStreamsResult && batchStreamsResult !== '__SKIPPED__' && batchStreamsResult.streams) {
          allStreams = batchStreamsResult.streams;
          channelStreamCount = batchStreamsResult.streamCount;
          console.log(`[enrichSchedulesForChannel] Using batch results for ${handle}: ${allStreams.length} streams`);
          
          // Cache the streams for future use
          const streamsKey = `liveStreamsByChannel:${channelId}`;
          await this.redisService.set(streamsKey, batchStreamsResult, await getCurrentBlockTTL(channelId, schedules, this.sentryService));
        } else {
          // Fallback to individual fetch if batch didn't work
          const streamsKey = `liveStreamsByChannel:${channelId}`;
          const cachedStreams = await this.redisService.get<any>(streamsKey);
          
          if (cachedStreams) {
            try {
              const parsedStreams = cachedStreams;
              if (parsedStreams.streams && parsedStreams.streams.length > 0) {
                allStreams = parsedStreams.streams;
                channelStreamCount = parsedStreams.streamCount;
              }
            } catch (error) {
              console.warn(`Failed to parse cached streams for ${handle}:`, error);
            }
          }

          // Fetch on-demand if no cached streams
          if (allStreams.length === 0) {
            const ttl = await getCurrentBlockTTL(channelId, schedules, this.sentryService);
            
            const streamsResult = await this.youtubeLiveService.getLiveStreamsMain(
              channelId,
              handle,
              ttl
            );
            
            if (streamsResult && streamsResult !== '__SKIPPED__') {
              allStreams = streamsResult.streams;
              channelStreamCount = streamsResult.streamCount;
            }
          }
        }
      }
    }

    // Count live programs for this channel
    const liveProgramCount = liveSchedules.length;
    // Total streams available from YouTube API
    const totalStreamsAvailable = channelStreamCount;

    // Distribute streams to live schedules using title matching
    const usedStreams = new Set<string>();
    
    for (const schedule of schedules) {
      const isLive = liveSchedules.includes(schedule);
      let assignedStream: any = null;
      let streamUrl = schedule.program.stream_url || schedule.program.youtube_url;

      if (isLive) {
        if (allStreams.length > 0) {
          const availableStreams = allStreams.filter(s => !usedStreams.has(s.videoId));
          
          // Skip title matching if there's only one live program and one stream
          if (liveSchedules.length === 1 && availableStreams.length === 1) {
            assignedStream = availableStreams[0];
            usedStreams.add(assignedStream.videoId);
            streamUrl = `https://www.youtube.com/embed/${assignedStream.videoId}?autoplay=1`;
          } else {
            // Find best matching stream for this program when multiple options exist
            assignedStream = this.findBestMatchingStream(
              schedule.program.name,
              availableStreams
            );
            
            if (assignedStream) {
              usedStreams.add(assignedStream.videoId);
              streamUrl = `https://www.youtube.com/embed/${assignedStream.videoId}?autoplay=1`;
            }
          }
        } else {
          // Fallback to individual enrichment when no streams found for channel
          const individualEnriched = await this.enrichScheduleIndividually(
            schedule,
            currentDay,
            currentNum,
            liveStatus
          );
          
          if (individualEnriched.program.stream_url !== streamUrl) {
            streamUrl = individualEnriched.program.stream_url;
            assignedStream = individualEnriched.program.live_streams?.[0] || null;
          }
        }
      }

      enriched.push({
        ...schedule,
        program: {
          ...schedule.program,
          is_live: isLive,
          stream_url: streamUrl,
          live_streams: assignedStream ? [assignedStream] : null,
          stream_count: assignedStream ? 1 : 0,
        },
      });
    }

    return enriched;
  }

  private async enrichScheduleIndividually(
    schedule: Schedule,
    currentDay: string,
    currentNum: number,
    liveStatus: boolean
  ): Promise<any> {
    const { program } = schedule;
    const channel = program.channel;
    const channelId = channel?.youtube_channel_id;
    const handle = channel?.handle;

    const startNum = this.convertTimeToNumber(schedule.start_time);
    const endNum = this.convertTimeToNumber(schedule.end_time);

    let isLive = false;
    let streamUrl = program.stream_url || program.youtube_url;
    let assignedStream: any = null;

    // Si estamos en horario
    if (
      schedule.day_of_week === currentDay &&
      currentNum >= startNum &&
      currentNum < endNum
    ) {
      isLive = true;

      // If live and we have channel info, try to fetch live streams
      if (liveStatus && channelId && handle) {
        try {
          const canFetch = await this.configService.canFetchLive(handle);
          if (canFetch) {
        // Try to get multiple streams first
        const liveStreams = await this.youtubeLiveService.getLiveStreamsMain(
          channelId,
          handle,
          100 // Default TTL
        );
        
        
        if (liveStreams && typeof liveStreams === 'object' && 'streams' in liveStreams && liveStreams.streams.length > 0) {
          // Use the first stream for individual enrichment
          const firstStream = liveStreams.streams[0];
          streamUrl = `https://www.youtube.com/embed/${firstStream.videoId}?autoplay=1`;
        } else {
              // Fallback to getLiveStreams method (same as bulk enrichment)
              const streamsResult = await this.youtubeLiveService.getLiveStreamsMain(
                channelId,
                handle,
                100 // Default TTL
              );
              if (streamsResult && streamsResult !== '__SKIPPED__' && typeof streamsResult === 'object' && 'streams' in streamsResult && streamsResult.streams.length > 0) {
                const firstStream = streamsResult.streams[0];
                streamUrl = `https://www.youtube.com/embed/${firstStream.videoId}?autoplay=1`;
                assignedStream = firstStream;
              }
            }
          }
        } catch (error) {
          console.warn(`Failed to fetch live stream for ${handle}:`, error);
        }
      }
    }

    const result = {
      ...schedule,
      program: {
        ...program,
        is_live: isLive,
        stream_url: streamUrl,
        live_streams: assignedStream ? [assignedStream] : null,
        stream_count: assignedStream ? 1 : 0,
        panelists: program.panelists || [], // Preserve panelists data
      },
    };
    
    return result;
  }

  private findBestMatchingStream(programName: string, availableStreams: any[]): any | null {
    if (availableStreams.length === 0) return null;
    
    // Simple title similarity matching (Jaccard similarity)
    const calculateSimilarity = (str1: string, str2: string): number => {
      const words1 = new Set(str1.toLowerCase().split(/\s+/));
      const words2 = new Set(str2.toLowerCase().split(/\s+/));
      const intersection = new Set([...words1].filter(x => words2.has(x)));
      const union = new Set([...words1, ...words2]);
      return intersection.size / union.size;
    };

    let bestMatch = availableStreams[0];
    let bestScore = calculateSimilarity(programName, availableStreams[0].title);

    for (let i = 1; i < availableStreams.length; i++) {
      const score = calculateSimilarity(programName, availableStreams[i].title);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = availableStreams[i];
      }
    }

    // Return best match if similarity is above threshold (0.1 = 10%)
    return bestScore > 0.1 ? bestMatch : null;
  }

  private convertTimeToNumber(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m; // Convert to minutes for consistency
  }

  private convertTimeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
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
    const schedule = this.schedulesRepository.create({
      day_of_week: dto.dayOfWeek,
      start_time: dto.startTime,
      end_time: dto.endTime,
      program,
    });
    const saved = await this.schedulesRepository.save(schedule);
    
    // Clear unified cache
    await this.redisService.del('schedules:week:complete');
    
    // Warm cache asynchronously (non-blocking)
    setImmediate(() => this.warmSchedulesCache());

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
    if (dto.dayOfWeek) schedule.day_of_week = dto.dayOfWeek;
    if (dto.startTime) schedule.start_time = dto.startTime;
    if (dto.endTime) schedule.end_time = dto.endTime;
    const updated = await this.schedulesRepository.save(schedule);
    
    // Clear unified cache
    await this.redisService.del('schedules:week:complete');
    
    // Warm cache asynchronously (non-blocking)
    setImmediate(() => this.warmSchedulesCache());

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
      // Clear cache
      await this.redisService.delByPattern('schedules:all:*');
      
      // Warm cache asynchronously (non-blocking)
      setImmediate(() => this.warmSchedulesCache());
      
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

    const schedules = dto.schedules.map(scheduleDto => this.schedulesRepository.create({
      day_of_week: scheduleDto.dayOfWeek,
      start_time: scheduleDto.startTime,
      end_time: scheduleDto.endTime,
      program,
    }));

    const savedSchedules = await this.schedulesRepository.save(schedules);
    
    // Clear unified cache
    await this.redisService.del('schedules:week:complete');
    
    // Warm cache asynchronously (non-blocking)
    setImmediate(() => this.warmSchedulesCache());

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
   * Find schedules by start time for a specific day
   * Used for program start detection to validate cached video IDs
   * OPTIMIZED: Uses cached schedules instead of database query
   */
  async findByStartTime(dayOfWeek: string, startTime: string): Promise<Schedule[]> {
    try {
      // Use cached schedules instead of database query
      const allSchedules = await this.findAll({
        dayOfWeek,
        applyOverrides: true,
        liveStatus: false,
      });
      
      // Filter by start time
      const matchingSchedules = allSchedules.filter(schedule => 
        schedule.start_time === startTime || schedule.start_time.startsWith(startTime)
      );

      console.log(`[PROGRAM-START] Found ${matchingSchedules.length} programs starting at ${startTime} on ${dayOfWeek} (from cache)`);
      return matchingSchedules;
    } catch (error) {
      console.error(`Error finding schedules for ${dayOfWeek} at ${startTime}:`, error);
      this.sentryService.captureException(error);
      return [];
    }
  }
}