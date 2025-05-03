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

interface FindAllOptions {
  dayOfWeek?: string;
  relations?: string[];
  select?: string[];
  skipCache?: boolean;
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
  ) {
    this.dayjs = dayjs;
    this.dayjs.extend(utc);
    this.dayjs.extend(timezone);
  }

  async findAll(options: FindAllOptions = {}): Promise<any[]> {
    const startTime = Date.now();
    const { dayOfWeek, skipCache = false } = options;
    const cacheKey = `schedules:all:${dayOfWeek || 'all'}`;
  
    // 1) Intentamos cache
    let raw: any[] | null = skipCache ? null : await this.redisService.get(cacheKey);
    if (!raw) {
      console.log(`Cache MISS for ${cacheKey}`);
  
      // 2) Un único JOIN con selects finos
      const qb = this.schedulesRepository
        .createQueryBuilder('s')
        .leftJoin('s.program', 'p')
        .leftJoin('p.channel', 'c')
        .leftJoin('p.panelists', 'pl')
        .select([
          'c.id', 'c.name', 'c.logoUrl', 'c.youtubeChannelId', 'c.handle',
          'p.id', 'p.name', 'p.logoUrl', 'p.description', 'p.youtubeUrl',
          's.id', 's.day_of_week', 's.start_time', 's.end_time',
          'pl.id', 'pl.name',
        ])
        .orderBy('c.order', 'ASC')
        .addOrderBy('s.start_time', 'ASC');
  
      if (dayOfWeek) {
        qb.andWhere('s.day_of_week = :day', { day: dayOfWeek });
      }
  
      raw = await qb.getRawMany();
  
      // 3) Guarda en cache 30 min
      await this.redisService.set(cacheKey, raw, 1800);
      console.log(`DB JOIN + cache SET: ${Date.now() - startTime}ms`);
    }
  
    // 4) Enriquecemos con lógica de live / YouTube
    return this.enrichSchedules(this.mapRawToEntities(raw));
  }

  private mapRawToEntities(raw: any[]): Schedule[] {
    const map = new Map<number, any>();
  
    for (const row of raw) {
      const schedId: number = row.s_id;
      let sched = map.get(schedId);
      if (!sched) {
        sched = {
          id: schedId,
          day_of_week: row.s_day_of_week,
          start_time: row.s_start_time,
          end_time: row.s_end_time,
          program: {
            id: row.p_id,
            name: row.p_name,
            logo_url: row.p_logoUrl,
            description: row.p_description,
            youtube_url: row.p_youtubeUrl,
            channel: {
              id: row.c_id,
              name: row.c_name,
              logo_url: row.c_logoUrl,
              youtube_channel_id: row.c_youtubeChannelId,
              handle: row.c_handle,
            },
            panelists: [] as { id: number; name: string }[],
          },
        };
        map.set(schedId, sched);
      }
      // Agrega panelistas si existen
      if (row.pl_id) {
        sched.program.panelists.push({
          id: row.pl_id,
          name: row.pl_name,
        });
      }
    }
  
    return Array.from(map.values());
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
    return this.schedulesRepository.find({
      where: { program: { id: Number(programId) } },
      relations: ['program', 'program.channel', 'program.panelists'],
      order: {
        day_of_week: 'ASC',
        start_time: 'ASC',
      },
    });
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