import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { Channel } from './channels.entity';
import { Program } from '../programs/programs.entity';
import { Schedule } from '../schedules/schedules.entity';
import { SchedulesService } from '../schedules/schedules.service';
import { YoutubeLiveModule } from '../youtube/youtube-live.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Channel, Program, Schedule]),
    forwardRef(() => YoutubeLiveModule),
  ],
  controllers: [ChannelsController],
  providers: [ChannelsService, SchedulesService],
})
export class ChannelsModule {}
