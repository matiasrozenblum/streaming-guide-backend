import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { YoutubeLiveService } from './youtube-live.service';
import { YoutubeController } from './youtube.controller';
import { ConfigModule } from '../config/config.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { RedisModule } from '../redis/redis.module';
import { SentryModule } from '../sentry/sentry.module';
import { Channel } from '../channels/channels.entity';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => SchedulesModule),
    RedisModule,
    SentryModule,
    TypeOrmModule.forFeature([Channel]),
  ],
  controllers: [YoutubeController],
  providers: [YoutubeLiveService],
  exports: [YoutubeLiveService],
})
export class YoutubeLiveModule {}