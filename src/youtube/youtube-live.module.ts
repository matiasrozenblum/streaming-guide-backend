import { Module, forwardRef } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { YoutubeLiveService } from './youtube-live.service';
import { ConfigModule } from '../config/config.module';
import { SchedulesModule } from '../schedules/schedules.module';
import * as redisStore from 'cache-manager-redis-store';


@Module({
  imports: [
    ConfigModule,
    forwardRef(() => SchedulesModule),
    CacheModule,
  ],
  providers: [YoutubeLiveService],
  exports: [YoutubeLiveService],
})
export class YoutubeLiveModule {}