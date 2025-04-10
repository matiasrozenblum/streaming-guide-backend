import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, Repository } from 'typeorm';
import { Schedule } from './schedules.entity';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { Program } from '../programs/programs.entity';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UpdateScheduleDto } from './dto/update-schedule.dto';

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

  async findAll(): Promise<Schedule[]> {
    const startTime = Date.now();
    const cacheKey = 'schedules:all';
    const cachedSchedules = await this.cacheManager.get<Schedule[]>(cacheKey);

    if (cachedSchedules) {
      console.log(`Cache HIT for ${cacheKey}. Time: ${Date.now() - startTime}ms`);
      return cachedSchedules;
    }

    console.log(`Cache MISS for ${cacheKey}`);
    const schedules = await this.schedulesRepository.find({
      relations: ['program', 'program.channel', 'program.panelists'],
    });

    await this.cacheManager.set(cacheKey, schedules, 3600);
    console.log(`Database query completed. Total time: ${Date.now() - startTime}ms`);
    return schedules;
  }

  async findOne(id: string): Promise<Schedule> {
    const startTime = Date.now();
    const cacheKey = `schedules:${id}`;
    const cachedSchedule = await this.cacheManager.get<Schedule>(cacheKey);

    if (cachedSchedule) {
      console.log(`Cache HIT for ${cacheKey}. Time: ${Date.now() - startTime}ms`);
      return cachedSchedule;
    }

    console.log(`Cache MISS for ${cacheKey}`);
    const schedule = await this.schedulesRepository.findOne({ 
      where: { id: Number(id) },
      relations: ['program', 'program.channel', 'program.panelists'],
    } as FindOneOptions);

    if (!schedule) {
      throw new NotFoundException(`Schedule with ID ${id} not found`);
    }

    await this.cacheManager.set(cacheKey, schedule);
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