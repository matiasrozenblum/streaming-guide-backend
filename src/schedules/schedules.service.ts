import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, Repository } from 'typeorm';
import { Schedule } from './schedules.entity';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { Program } from '../programs/programs.entity';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

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

    await this.cacheManager.set(cacheKey, schedules, { ttl: 3600 });
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

  async remove(id: string): Promise<void> {
    await this.schedulesRepository.delete(id);
    
    // Invalidar caché
    await Promise.all([
      this.cacheManager.del('schedules:all'),
      this.cacheManager.del(`schedules:${id}`),
    ]);
  }
}