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
  ) {}

  async findAll(): Promise<Schedule[]> {
    return this.schedulesRepository.find({
      relations: ['program', 'program.channel'],
    });
  }

  async findOne(id: string): Promise<Schedule> {
        const channel = await this.schedulesRepository.findOne({ where: { id } } as FindOneOptions );
            if (!channel) {
              throw new NotFoundException(`Channel with ID ${id} not found`);
            }
            return channel;
    }

  create(createScheduleDto: CreateScheduleDto): Promise<Schedule> {
    const schedule = this.schedulesRepository.create({
      day_of_week: createScheduleDto.dayOfWeek,
      start_time: createScheduleDto.startTime,
      end_time: createScheduleDto.endTime,
      program: createScheduleDto.programId,
    });

    return this.schedulesRepository.save(schedule);
  }

  remove(id: string): Promise<void> {
    return this.schedulesRepository.delete(id).then(() => {});
  }
}