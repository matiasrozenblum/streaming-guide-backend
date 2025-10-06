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
import { UserSubscription } from '../users/user-subscription.entity';
import { Device } from '../users/device.entity';
import { ConfigModule } from '../config/config.module';
import { Category } from '../categories/categories.entity';
import { LiveStatusBackgroundService } from '../youtube/live-status-background.service';
import { OptimizedSchedulesService } from '../youtube/optimized-schedules.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Channel, Program, Schedule, UserSubscription, Device, Category]),
    forwardRef(() => YoutubeLiveModule),
    forwardRef(() => SchedulesModule),
    RedisModule,
    YoutubeDiscoveryModule,
    ConfigModule,
  ],
  controllers: [ChannelsController],
  providers: [ChannelsService, LiveStatusBackgroundService, OptimizedSchedulesService],
})
export class ChannelsModule {}
