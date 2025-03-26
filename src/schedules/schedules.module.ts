import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { Schedule } from './schedules.entity';
import { Program } from '../programs/programs.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Schedule, Program])],
  controllers: [SchedulesController],
  providers: [SchedulesService],
})
export class SchedulesModule {}