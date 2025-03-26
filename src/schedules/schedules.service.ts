import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOneOptions, Repository } from 'typeorm';
import { Schedule } from './schedules.entity';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { Program } from '../programs/programs.entity';

@Injectable()
export class SchedulesService {
  constructor(
    @InjectRepository(Schedule)
    private schedulesRepository: Repository<Schedule>,
    
    @InjectRepository(Program)
    private programsRepository: Repository<Program>,
  ) {}

  async findAll(): Promise<Schedule[]> {
    return this.schedulesRepository.find({
      relations: ['program', 'program.channel', 'program.panelists'],
    });
  }

  async findOne(id: string): Promise<Schedule> {
    const channel = await this.schedulesRepository.findOne({ where: { id } } as FindOneOptions );
    if (!channel) {
      throw new NotFoundException(`Channel with ID ${id} not found`);
    }
    return channel;
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
  
    return this.schedulesRepository.save(schedule);
  }

  remove(id: string): Promise<void> {
    return this.schedulesRepository.delete(id).then(() => {});
  }
}