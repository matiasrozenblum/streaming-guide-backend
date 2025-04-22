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

interface FindAllOptions {
  page?: number;
  limit?: number;
  dayOfWeek?: string;
  relations?: string[];
  select?: string[];
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
    const { dayOfWeek, relations = ['program', 'program.channel', 'program.panelists'], select } = options;

    const cacheKey = `schedules:all:${dayOfWeek || 'all'}`;
    let schedules = await this.redisService.get<Schedule[]>(cacheKey);

    if (!schedules) {
      console.log(`Cache MISS for ${cacheKey}`);

      const where: FindOptionsWhere<Schedule> = {};
      if (dayOfWeek) {
        where.day_of_week = dayOfWeek;
      }

      const findOptions: FindManyOptions<Schedule> = {
        where,
        relations,
        order: { start_time: 'ASC' },
      };

      if (select) {
        findOptions.select = select.reduce((acc, field) => {
          acc[field] = true;
          return acc;
        }, {} as any);
      }

      schedules = await this.schedulesRepository.find(findOptions);

      schedules = schedules.sort((a, b) => {
        const orderA = a.program?.channel?.order ?? 999;
        const orderB = b.program?.channel?.order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        return a.start_time.localeCompare(b.start_time);
      });

      await this.redisService.set(cacheKey, schedules, 1800);
      console.log(`Database query and cache SET. Total time: ${Date.now() - startTime}ms`);
    } else {
      console.log(`Cache HIT for ${cacheKey}. Time: ${Date.now() - startTime}ms`);
    }

    return this.enrichSchedules(schedules ?? []);
  }

  async enrichSchedules(schedules: Schedule[]): Promise<any[]> {
    const now = this.dayjs().tz('America/Argentina/Buenos_Aires');
    const currentTimeNum = now.hour() * 100 + now.minute();
    const currentDay = now.format('dddd').toLowerCase();

    return Promise.all(
      schedules.map(async (schedule) => {
        const program = schedule.program;
        let isLive = false;
        let streamUrl = program.youtube_url;

        const startTimeNum = this.convertTimeToNumber(schedule.start_time);
        const endTimeNum = this.convertTimeToNumber(schedule.end_time);
  
        if (schedule.day_of_week === currentDay && currentTimeNum >= startTimeNum && currentTimeNum <= endTimeNum) {
          isLive = true;

          if (program.channel?.youtube_channel_id) {
            let cachedVideoId = await this.redisService.get<string>(`videoId:${program.id}`);
            
            if (!cachedVideoId) {
              console.warn(`[SchedulesService] No cached video ID for program ${program.id}, fetching on-demand...`);
              const videoId = await this.youtubeLiveService.getLiveVideoId(program.channel.youtube_channel_id);
              if (videoId) {
                const ttlSeconds = this.calculateProgramTTL(schedule.start_time, schedule.end_time);
                await this.redisService.set(`videoId:${program.id}`, videoId, ttlSeconds);
                cachedVideoId = videoId;
              } else {
                console.warn(`[SchedulesService] No live video ID found on-demand for program ${program.id}`);
              }
            }

            if (cachedVideoId) {
              streamUrl = `https://www.youtube.com/embed/${cachedVideoId}?autoplay=1`;
            }
          }
        }

        return {
          ...schedule,
          program: {
            ...program,
            is_live: isLive,
            stream_url: streamUrl,
          },
        };
      })
    );
  }

  private convertTimeToNumber(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 100 + minutes;
  }

  private convertTimeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private calculateProgramTTL(startTime: string, endTime: string): number {
    const start = this.convertTimeToMinutes(startTime);
    const end = this.convertTimeToMinutes(endTime);

    let durationMinutes: number;
    if (end >= start) {
      durationMinutes = end - start;
    } else {
      durationMinutes = (24 * 60 - start) + end; // programa que cruza medianoche
    }

    const ttlMinutes = durationMinutes + 60; // duración + 1 hora
    return ttlMinutes * 60; // lo devolvemos en segundos para Redis
  }

  async findOne(id: string | number, options: { relations?: string[]; select?: string[] } = {}): Promise<Schedule> {
    const { relations = ['program', 'program.channel', 'program.panelists'], select } = options;

    const cacheKey = `schedules:${id}`;
    const cached = await this.redisService.get<Schedule>(cacheKey);
    if (cached) return cached;

    const findOptions: FindOneOptions<Schedule> = {
      where: { id: Number(id) },
      relations,
    };

    if (select) {
      findOptions.select = select.reduce((acc, field) => {
        acc[field] = true;
        return acc;
      }, {} as any);
    }

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

  async create(createScheduleDto: CreateScheduleDto): Promise<Schedule> {
    const program = await this.programsRepository.findOne({
      where: { id: parseInt(createScheduleDto.programId, 10) },
    });

    if (!program) throw new NotFoundException(`Program with ID ${createScheduleDto.programId} not found`);

    const schedule = this.schedulesRepository.create({
      day_of_week: createScheduleDto.dayOfWeek,
      start_time: createScheduleDto.startTime,
      end_time: createScheduleDto.endTime,
      program,
    });

    const saved = await this.schedulesRepository.save(schedule);

    await this.redisService.del('schedules:all');
    return saved;
  }

  async update(id: string, updateScheduleDto: UpdateScheduleDto): Promise<Schedule> {
    const schedule = await this.findOne(id);

    if (updateScheduleDto.dayOfWeek) schedule.day_of_week = updateScheduleDto.dayOfWeek;
    if (updateScheduleDto.startTime) schedule.start_time = updateScheduleDto.startTime;
    if (updateScheduleDto.endTime) schedule.end_time = updateScheduleDto.endTime;

    return this.schedulesRepository.save(schedule);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.schedulesRepository.delete(id);
    if ((result?.affected ?? 0) > 0) {
      await Promise.all([
        this.redisService.del('schedules:all'),
        this.redisService.del(`schedules:${id}`),
      ]);
      return true;
    }
    return false;
  }
}
