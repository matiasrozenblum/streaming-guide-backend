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
  deviceId?: string;
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
    const { dayOfWeek, relations = ['program', 'program.channel', 'program.panelists'], select, skipCache = false, deviceId, applyOverrides = true } = options;

    const cacheKey = `schedules:all:${dayOfWeek || 'all'}`;
    
    let schedules: Schedule[] | null = null;
    if (!skipCache) {
      schedules = await this.redisService.get<Schedule[]>(cacheKey);
    }

    if (!schedules) {
      console.log(`Cache MISS for ${cacheKey}`);

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
      schedules.sort((a, b) => {
        const aOrder = a.program?.channel?.order ?? 999;
        const bOrder = b.program?.channel?.order ?? 999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return a.start_time.localeCompare(b.start_time);
      });

      await this.redisService.set(cacheKey, schedules, 1800);
      console.log(`Database query and cache SET. Total time: ${Date.now() - startTime}ms`);
    }

    // Apply weekly overrides for current week (unless raw=true)
    if (applyOverrides) {
      const currentWeekStart = this.weeklyOverridesService.getWeekStartDate('current');
      schedules = await this.weeklyOverridesService.applyWeeklyOverrides(schedules!, currentWeekStart);
    }

    const enriched = await this.enrichSchedules(schedules!);

    if (!deviceId) {
      return enriched;
    }

    const prefs = await this.notificationsService.list(deviceId);
    const subscribedSet = new Set(prefs.map((p) => p.programId));

    return enriched.map((block) => ({
      ...block,
      subscribed: subscribedSet.has(Number(block.program.id)),
    }));
  }

  async enrichSchedules(schedules: Schedule[]): Promise<any[]> {
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
        // Validar feature-flag + feriado (fallback true si no existe)
        const canFetch = await this.configService.canFetchLive(handle);

        if (canFetch) {
          isLive = true;
          const liveKey = `liveVideoIdByChannel:${channelId}`;

          // Intentar reutilizar cache
          const cachedId = await this.redisService.get<string>(liveKey);
          if (cachedId) {
            streamUrl = `https://www.youtube.com/embed/${cachedId}?autoplay=1`;
          } else {
            // Obtener on-demand si no estaba en cache
            const ttl = await getCurrentBlockTTL(channelId, schedules);
            const vid = await this.youtubeLiveService.getLiveVideoId(
              channelId,
              handle,
              ttl,
              'onDemand'
            );
            if (vid && vid !== '__SKIPPED__') {
              streamUrl = `https://www.youtube.com/embed/${vid}?autoplay=1`;
            }
          }
        }
      }

      enriched.push({
        ...schedule,
        program: {
          ...program,
          is_live: isLive,
          stream_url: streamUrl,
        },
      });
    }

    return enriched;
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
}