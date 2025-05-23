import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { Channel } from './channels.entity';
import { Program } from '../programs/programs.entity';
import { Schedule } from '../schedules/schedules.entity';
import { YoutubeLiveModule } from '../youtube/youtube-live.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { RedisModule } from '../redis/redis.module';
import { YoutubeDiscoveryModule } from '../youtube/youtube-discovery.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Channel, Program, Schedule]),
    forwardRef(() => YoutubeLiveModule),
    forwardRef(() => SchedulesModule),
    RedisModule,
    YoutubeDiscoveryModule,
  ],
  controllers: [ChannelsController],
  providers: [ChannelsService],
})
export class ChannelsModule {}
