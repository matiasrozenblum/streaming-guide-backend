import { Module, forwardRef } from '@nestjs/common';
import { YoutubeLiveService } from './youtube-live.service';
import { YoutubeController } from './youtube.controller';
import { ConfigModule } from '../config/config.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { RedisModule } from '../redis/redis.module';
import { SentryModule } from '../sentry/sentry.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => SchedulesModule),
    RedisModule,
    SentryModule,
  ],
  controllers: [YoutubeController],
  providers: [YoutubeLiveService],
  exports: [YoutubeLiveService],
})
export class YoutubeLiveModule {}