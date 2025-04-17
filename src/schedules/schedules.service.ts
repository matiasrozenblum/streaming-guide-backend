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
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
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
  constructor(
    @InjectRepository(Schedule)
    private schedulesRepository: Repository<Schedule>,
    
    @InjectRepository(Program)
    private programsRepository: Repository<Program>,

    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,

    private readonly youtubeLiveService: YoutubeLiveService,
  ) {
    dayjs.extend(isSameOrAfter);
    dayjs.extend(isSameOrBefore);
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

    const data = await this.schedulesRepository.find(findOptions);

    const now = dayjs().format('HH:mm');
    const currentDay = dayjs().format('dddd').toLowerCase();
    console.log('Current day:', currentDay);
    console.log('Current time:', now);

    const timeToNumber = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 100 + minutes;
    };

    const enriched = await Promise.all(
      data.map(async (schedule) => {
        const start = dayjs(schedule.start_time, 'HH:mm');
        const end = dayjs(schedule.end_time, 'HH:mm');

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
          console.log(`${schedule.program.name} is LIVE!`);

          const channelId = schedule.program.channel.youtube_channel_id;
          if (channelId) {
            const videoId = await this.youtubeLiveService.getLiveVideoId(channelId);
            if (videoId) {
              streamUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
            }
          }
        } else {
          console.log(`${schedule.program.name} is NOT live because:`);
          if (schedule.day_of_week !== currentDay) {
            console.log(`- Schedule day (${schedule.day_of_week}) doesn't match current day (${currentDay})`);
          }
          if (currentTime < startTime) {
            console.log(`- Current time (${now}) is before start time (${schedule.start_time})`);
          }
          if (currentTime > endTime) {
            console.log(`- Current time (${now}) is after end time (${schedule.end_time})`);
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

    await this.cacheManager.set(cacheKey, enriched, 300);
    console.log(`Database query completed. Total time: ${Date.now() - startTime}ms`);
    return enriched;
  }

  async findOne(id: string | number, options: { relations?: string[]; select?: string[] } = {}): Promise<Schedule> {
    const startTime = Date.now();
    const { relations = ['program', 'program.channel', 'program.panelists'], select } = options;
    const cacheKey = `schedules:${id}:${relations.join(',')}`;
    const cachedSchedule = await this.cacheManager.get<Schedule>(cacheKey);

    if (cachedSchedule) {
      console.log(`Cache HIT for ${cacheKey}. Time: ${Date.now() - startTime}ms`);
      return cachedSchedule;
    }

    console.log(`Cache MISS for ${cacheKey}`);

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

    await this.cacheManager.set(cacheKey, schedule, 300);
    console.log(`Database query completed. Total time: ${Date.now() - startTime}ms`);
    return schedule;
  }

  async findByProgram(programId: string): Promise<Schedule[]> {
    return this.schedulesRepository.find({
      where: { program: { id: Number(programId) } },
      relations: ['program'],
    });
  }

  async findByDay(dayOfWeek: string): Promise<Schedule[]> {
    const data = await this.schedulesRepository.find({
      where: { day_of_week: dayOfWeek },
      relations: ['program', 'program.channel', 'program.panelists'],
      order: {
        start_time: 'ASC',
      },
    });

    const now = dayjs().format('HH:mm');
    const currentDay = dayjs().format('dddd').toLowerCase();
    console.log('Current day:', currentDay);
    console.log('Current time:', now);

    const timeToNumber = (time: string) => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 100 + minutes;
    };

    return Promise.all(
      data.map(async (schedule) => {
        console.log("SCHEDULE", schedule);
        console.log("schedule.start_time", schedule.start_time);
        console.log("schedule.end_time", schedule.end_time);
        
        let isLive = false;
        let streamUrl = schedule.program.youtube_url;

        console.log(`Checking program: ${schedule.program.name}`);
        console.log(`Schedule day: ${schedule.day_of_week}`);
        console.log(`Start time: ${schedule.start_time}`);
        console.log(`End time: ${schedule.end_time}`);
        console.log("now", now);

        const currentTime = timeToNumber(now);
        const startTime = timeToNumber(schedule.start_time);
        const endTime = timeToNumber(schedule.end_time);

        if (
          schedule.day_of_week === currentDay &&
          currentTime >= startTime &&
          currentTime <= endTime
        ) {
          isLive = true;
          console.log(`${schedule.program.name} is LIVE!`);

          const channelId = schedule.program.channel.youtube_channel_id;
          if (channelId) {
            const videoId = await this.youtubeLiveService.getLiveVideoId(channelId);
            if (videoId) {
              streamUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
            }
          }
        } else {
          console.log("isLive", isLive);
          console.log(`${schedule.program.name} is NOT live because:`);
          if (schedule.day_of_week !== currentDay) {
            console.log(`- Schedule day (${schedule.day_of_week}) doesn't match current day (${currentDay})`);
          }
          if (currentTime < startTime) {
            console.log(`- Current time (${now}) is before start time (${schedule.start_time})`);
          }
          if (currentTime > endTime) {
            console.log(`- Current time (${now}) is after end time (${schedule.end_time})`);
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