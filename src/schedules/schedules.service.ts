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
    const enriched = await this.enrichSchedules(schedules!, liveStatus);
    console.log('[findAll] Enriched schedules in', Date.now() - enrichStart, 'ms');
    console.log('[findAll] Enriched result length:', enriched.length);

    console.log('[findAll] TOTAL time:', Date.now() - startTime, 'ms');
    return enriched;
  }

  async enrichSchedules(schedules: Schedule[], liveStatus: boolean = false): Promise<any[]> {
    console.log('[enrichSchedules] Starting enrichment of', schedules.length, 'schedules');
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

    // Smart batch fetch: only fetch channels that have live programs RIGHT NOW
    let batchStreamsResults = new Map<string, any>();
    if (liveStatus && channelGroups.size > 0) {
      const liveChannelIds: string[] = [];
      
      // Filter channels that actually have live programs right now
      for (const [channelId, channelSchedules] of channelGroups) {
        const liveSchedules = channelSchedules.filter(schedule => {
          const startNum = this.convertTimeToNumber(schedule.start_time);
          const endNum = this.convertTimeToNumber(schedule.end_time);
          return schedule.day_of_week === currentDay &&
                 currentNum >= startNum &&
                 currentNum < endNum;
        });
        
        if (liveSchedules.length > 0) {
          // Check if this channel is enabled for live fetching
          const channel = channelSchedules[0].program.channel;
          const handle = channel?.handle;
          if (handle && await this.configService.canFetchLive(handle)) {
            liveChannelIds.push(channelId);
          }
        }
      }
      
      if (liveChannelIds.length > 0) {
        console.log('[enrichSchedules] Smart batch fetching live streams for', liveChannelIds.length, 'channels with live programs (out of', channelGroups.size, 'total channels)');
        console.log('[enrichSchedules] Live channel IDs:', liveChannelIds);
        
        // Calculate intelligent TTL for each channel based on their program schedules
        const channelTTLs = new Map<string, number>();
        for (const channelId of liveChannelIds) {
          const channelSchedules = channelGroups.get(channelId);
          if (channelSchedules) {
            const ttl = await getCurrentBlockTTL(channelId, channelSchedules, this.sentryService);
            channelTTLs.set(channelId, ttl);
            console.log(`[enrichSchedules] TTL for channel ${channelId}: ${ttl}s`);
          }
        }
        
        // Create channel handle mapping for tracking
        const channelHandles = new Map<string, string>();
        for (const channelId of liveChannelIds) {
          const channel = channelGroups.get(channelId)?.[0]?.program?.channel;
          if (channel?.handle) {
            channelHandles.set(channelId, channel.handle);
          }
        }
        
        batchStreamsResults = await this.youtubeLiveService.getBatchLiveStreams(liveChannelIds, 'onDemand', channelTTLs, channelHandles, undefined);
        console.log('[enrichSchedules] Smart batch fetch completed with intelligent TTL');
      } else {
        console.log('[enrichSchedules] No channels have live programs right now, skipping batch fetch');
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

      // Si estamos en horario
      if (
        schedule.day_of_week === currentDay &&
        currentNum >= startNum &&
        currentNum < endNum
      ) {
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

    // Find live schedules for this channel
    const liveSchedules = schedules.filter(schedule => {
      const startNum = this.convertTimeToNumber(schedule.start_time);
      const endNum = this.convertTimeToNumber(schedule.end_time);
      return schedule.day_of_week === currentDay &&
             currentNum >= startNum &&
             currentNum < endNum;
    });

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
          await this.redisService.set(streamsKey, JSON.stringify(allStreams), await getCurrentBlockTTL(channelId, schedules, this.sentryService));
        } else {
          // Fallback to individual fetch if batch didn't work
          const streamsKey = `liveStreamsByChannel:${channelId}`;
          const cachedStreams = await this.redisService.get<string>(streamsKey);
          
          if (cachedStreams) {
            try {
              const parsedStreams = JSON.parse(cachedStreams);
              if (parsedStreams.length > 0) {
                allStreams = parsedStreams;
                channelStreamCount = parsedStreams.length;
              }
            } catch (error) {
              console.warn(`Failed to parse cached streams for ${handle}:`, error);
            }
          }

          // Fetch on-demand if no cached streams
          if (allStreams.length === 0) {
            const ttl = await getCurrentBlockTTL(channelId, schedules, this.sentryService);
            
            const streamsResult = await this.youtubeLiveService.getLiveStreams(
              channelId,
              handle,
              ttl,
              'onDemand'
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
        const liveStreams = await this.youtubeLiveService.getLiveStreams(
          channelId,
          handle,
          100, // Default TTL
          'onDemand'
        );
        
        
        if (liveStreams && typeof liveStreams === 'object' && 'streams' in liveStreams && liveStreams.streams.length > 0) {
          // Use the first stream for individual enrichment
          const firstStream = liveStreams.streams[0];
          streamUrl = `https://www.youtube.com/embed/${firstStream.videoId}?autoplay=1`;
        } else {
              // Fallback to getLiveStreams method (same as bulk enrichment)
              const streamsResult = await this.youtubeLiveService.getLiveStreams(
                channelId,
                handle,
                100, // Default TTL
                'onDemand'
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
    return h * 100 + m;
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
   * Find schedules by start time for a specific day
   * Used for program start detection to validate cached video IDs
   */
  async findByStartTime(dayOfWeek: string, startTime: string): Promise<Schedule[]> {
    try {
      const schedules = await this.schedulesRepository
        .createQueryBuilder('schedule')
        .leftJoinAndSelect('schedule.program', 'program')
        .leftJoinAndSelect('program.channel', 'channel')
        .where('schedule.day_of_week = :dayOfWeek', { dayOfWeek })
        .andWhere('schedule.start_time = :startTime', { startTime })
        .getMany();

      return schedules;
    } catch (error) {
      console.error(`Error finding schedules for ${dayOfWeek} at ${startTime}:`, error);
      this.sentryService.captureException(error);
      return [];
    }
  }
}