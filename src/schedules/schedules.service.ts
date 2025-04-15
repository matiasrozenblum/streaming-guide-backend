import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, FindManyOptions, Repository, FindOptionsWhere } from 'typeorm';
import { Schedule } from './schedules.entity';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { Program } from '../programs/programs.entity';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

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
  ) {}

  async findAll(options: FindAllOptions = {}): Promise<{ data: Schedule[]; total: number }> {
    const startTime = Date.now();
    const { page = 1, limit = 50, dayOfWeek, relations = ['program', 'program.channel', 'program.panelists'], select } = options;
    const skip = (page - 1) * limit;

    // Build cache key based on options
    const cacheKey = `schedules:all:${page}:${limit}:${dayOfWeek || 'all'}`;
    const cachedResult = await this.cacheManager.get<{ data: Schedule[]; total: number }>(cacheKey);

    if (cachedResult) {
      console.log(`Cache HIT for ${cacheKey}. Time: ${Date.now() - startTime}ms`);
      return cachedResult;
    }

    console.log(`Cache MISS for ${cacheKey}`);
    
    // Build where clause
    const where: FindOptionsWhere<Schedule> = {};
    if (dayOfWeek) {
      where.day_of_week = dayOfWeek;
    }

    // Build find options
    const findOptions: FindManyOptions<Schedule> = {
      where,
      relations,
      skip,
      take: limit,
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

    const [data, total] = await this.schedulesRepository.findAndCount(findOptions);
    
    const result = { data, total };
    await this.cacheManager.set(cacheKey, result, 300); // 5 minutes cache
    console.log(`Database query completed. Total time: ${Date.now() - startTime}ms`);
    return result;
  }

  async findOne(id: string, options: { relations?: string[]; select?: string[] } = {}): Promise<Schedule> {
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

    await this.cacheManager.set(cacheKey, schedule, 300); // 5 minutes cache
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
    return this.schedulesRepository.find({
      where: { day_of_week: dayOfWeek },
      relations: ['program'],
    });
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
    
    // Invalidar caché
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