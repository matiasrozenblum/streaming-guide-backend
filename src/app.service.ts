import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Schedule } from './schedules/schedules.entity';

@Injectable()
export class AppService {
  constructor(
    @InjectRepository(Schedule)
    private schedulesRepository: Repository<Schedule>,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  getSchedulesRepository(): Repository<Schedule> {
    return this.schedulesRepository;
  }
}
