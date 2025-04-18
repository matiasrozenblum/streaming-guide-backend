import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, FindManyOptions, Repository, FindOptionsWhere } from 'typeorm';
import { Schedule } from './schedules.entity';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { Program } from '../programs/programs.entity';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import { YoutubeLiveService } from '../youtube/youtube-live.service';

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

    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,

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
    const cachedResult = await this.cacheManager.get<Schedule[]>(cacheKey);
  
    if (cachedResult) {
      console.log(`Cache HIT for ${cacheKey}. Time: ${Date.now() - startTime}ms`);
      return cachedResult;
    }
  
    console.log(`Cache MISS for ${cacheKey}`);
  
    const where: FindOptionsWhere<Schedule> = {};
    if (dayOfWeek) {
      where.day_of_week = dayOfWeek;
    }
  
    const findOptions: FindManyOptions<Schedule> = {
      where,
      relations,
      order: {
        start_time: 'ASC',
      },
    };
  
    if (select) {
      findOptions.select = select.reduce((acc, field) => {
        acc[field] = true;
        return acc;
      }, {});
    }
  
    let data = await this.schedulesRepository.find(findOptions);
  
    // 🧹 Ordenar primero por channel.order, después por start_time
    data = data.sort((a, b) => {
      const orderA = a.program?.channel?.order ?? 999;
      const orderB = b.program?.channel?.order ?? 999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.start_time.localeCompare(b.start_time);
    });
  
    const now = this.dayjs().tz('America/Argentina/Buenos_Aires').format('HH:mm');
    const currentDay = this.dayjs().tz('America/Argentina/Buenos_Aires').format('dddd').toLowerCase();
  
    const timeToNumber = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 100 + minutes;
    };
  
    const enriched = await Promise.all(
      data.map(async (schedule) => {
        let isLive = false;
        let streamUrl = schedule.program.youtube_url;
  
        const currentTime = timeToNumber(now);
        const startTime = timeToNumber(schedule.start_time);
        const endTime = timeToNumber(schedule.end_time);
  
        if (
          schedule.day_of_week === currentDay &&
          currentTime >= startTime &&
          currentTime <= endTime
        ) {
          isLive = true;
          if (schedule.program.youtube_url) {
            const channelId = schedule.program.channel.youtube_channel_id;
            if (channelId) {
              const cachedVideoId = await this.cacheManager.get<string>(`videoId:${schedule.program.id}`);
              if (cachedVideoId) {
                streamUrl = `https://www.youtube.com/embed/${cachedVideoId}?autoplay=1`;
              } else {
                console.warn(`Video ID not cached for program ${schedule.program.id}`);
              }
            }
          }
        }
  
        return {
          ...schedule,
          program: {
            ...schedule.program,
            is_live: isLive,
            stream_url: streamUrl,
          },
        };
      })
    );
  
    await this.cacheManager.set(cacheKey, enriched, 30000);
    return enriched;
  }

  async findOne(id: string | number, options: { relations?: string[]; select?: string[] } = {}): Promise<Schedule> {
    const { relations = ['program', 'program.channel', 'program.panelists'], select } = options;

    const cacheKey = `schedules:${id}`;
    const cachedResult = await this.cacheManager.get<Schedule>(cacheKey);

    if (cachedResult) {
      return cachedResult;
    }

    const findOptions: FindOneOptions<Schedule> = {
      where: { id: Number(id) },
      relations,
    };

    if (select) {
      findOptions.select = select.reduce((acc, field) => {
        acc[field] = true;
        return acc;
      }, {});
    }

    const schedule = await this.schedulesRepository.findOne(findOptions);
    if (!schedule) {
      throw new NotFoundException(`Schedule with ID ${id} not found`);
    }

    await this.cacheManager.set(cacheKey, schedule, 30000); // Cache for 30 seconds
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

  async findByDay(dayOfWeek: string): Promise<Schedule[]> {
    return this.findAll({ dayOfWeek });
  }

  async create(createScheduleDto: CreateScheduleDto): Promise<Schedule> {
    const program = await this.programsRepository.findOne({
      where: { id: parseInt(createScheduleDto.programId, 10) },
    });

    if (!program) {
      throw new NotFoundException(`Program with ID ${createScheduleDto.programId} not found`);
    }

    const schedule = this.schedulesRepository.create({
      day_of_week: createScheduleDto.dayOfWeek,
      start_time: createScheduleDto.startTime,
      end_time: createScheduleDto.endTime,
      program,
    });

    const savedSchedule = await this.schedulesRepository.save(schedule);

    await this.cacheManager.del('schedules:all');

    return savedSchedule;
  }

  async update(id: string, updateScheduleDto: UpdateScheduleDto): Promise<Schedule> {
    const schedule = await this.findOne(id);
    if (!schedule) {
      throw new NotFoundException(`Schedule with ID ${id} not found`);
    }

    if (updateScheduleDto.dayOfWeek) {
      schedule.day_of_week = updateScheduleDto.dayOfWeek;
    }
    if (updateScheduleDto.startTime) {
      schedule.start_time = updateScheduleDto.startTime;
    }
    if (updateScheduleDto.endTime) {
      schedule.end_time = updateScheduleDto.endTime;
    }

    return this.schedulesRepository.save(schedule);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.schedulesRepository.delete(id);
    const affected = result?.affected ?? 0;
    if (affected > 0) {
      await Promise.all([
        this.cacheManager.del('schedules:all'),
        this.cacheManager.del(`schedules:${id}`),
      ]);
      return true;
    }
    return false;
  }
}