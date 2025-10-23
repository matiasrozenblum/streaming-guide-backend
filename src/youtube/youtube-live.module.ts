import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { YoutubeLiveService } from './youtube-live.service';
import { YoutubeController } from './youtube.controller';
import { LiveStatusBackgroundService } from './live-status-background.service';
import { OptimizedSchedulesService } from './optimized-schedules.service';
import { ConfigModule } from '../config/config.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { RedisModule } from '../redis/redis.module';
import { SentryModule } from '../sentry/sentry.module';
import { EmailModule } from '../email/email.module';
import { Channel } from '../channels/channels.entity';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => SchedulesModule),
    RedisModule,
    SentryModule,
    EmailModule,
    TypeOrmModule.forFeature([Channel]),
  ],
  controllers: [YoutubeController],
  providers: [YoutubeLiveService, LiveStatusBackgroundService, OptimizedSchedulesService],
  exports: [YoutubeLiveService, LiveStatusBackgroundService, OptimizedSchedulesService],
})
export class YoutubeLiveModule {}