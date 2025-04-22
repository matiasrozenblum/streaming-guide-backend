import { Module, forwardRef } from '@nestjs/common';
import { YoutubeLiveService } from './youtube-live.service';
import { ConfigModule } from '../config/config.module';
import { SchedulesModule } from '../schedules/schedules.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => SchedulesModule),
    RedisModule,
  ],
  providers: [YoutubeLiveService],
  exports: [YoutubeLiveService],
})
export class YoutubeLiveModule {}