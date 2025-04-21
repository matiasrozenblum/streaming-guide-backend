import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';
import { Schedule } from './schedules.entity';
import { Program } from '../programs/programs.entity';
import { YoutubeLiveModule } from '../youtube/youtube-live.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Schedule, Program]),
    forwardRef(() => YoutubeLiveModule),
  ],
  controllers: [SchedulesController],
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
