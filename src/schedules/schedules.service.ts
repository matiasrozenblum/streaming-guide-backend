import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOneOptions, FindManyOptions, FindOptionsWhere } from 'typeorm';
import { Schedule } from './schedules.entity';
import { Program } from '../programs/programs.entity';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { YoutubeLiveService } from '../youtube/youtube-live.service';
import { RedisService } from '../redis/redis.service';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import { getCurrentBlockTTL } from '@/utils/getBlockTTL.util';
import { NotificationsService } from '../notifications/notifications.service';

interface FindAllOptions {
  dayOfWeek?: string;
  relations?: string[];
  select?: string[];
  skipCache?: boolean;
  deviceId?: string;
}

@Injectable()
export class SchedulesService {
  private dayjs: typeof dayjs;

  constructor(
    @InjectRepository(Schedule)
    private schedulesRepository: Repository<Schedule>,

    @InjectRepository(Program)
    private programsRepository: Repository<Program>,

    private readonly redisService: RedisService,
    private readonly youtubeLiveService: YoutubeLiveService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.dayjs = dayjs;
    this.dayjs.extend(utc);
    this.dayjs.extend(timezone);
  }

  async findAll(options: FindAllOptions = {}): Promise<any[]> {
    const startTime = Date.now();
    const { dayOfWeek, relations = ['program', 'program.channel', 'program.panelists'], select, skipCache = false, deviceId } = options;

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
        .addOrderBy('panelists.id', 'DESC');

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
        const canFetch =
          typeof this.youtubeLiveService.canFetchLive === 'function'
            ? await this.youtubeLiveService.canFetchLive(handle)
            : true;

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
    return saved;
  }

  async update(id: string, dto: UpdateScheduleDto): Promise<Schedule> {
    const schedule = await this.findOne(id);
    if (dto.dayOfWeek) schedule.day_of_week = dto.dayOfWeek;
    if (dto.startTime) schedule.start_time = dto.startTime;
    if (dto.endTime) schedule.end_time = dto.endTime;
    const saved = await this.schedulesRepository.save(schedule);
    await this.redisService.delByPattern('schedules:all:*');
    return saved;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.schedulesRepository.delete(id);
    if (result.affected && result.affected > 0) {
      await this.redisService.delByPattern('schedules:all:*');
      return true;
    }
    return false;
  }
}