import { Module, forwardRef } from '@nestjs/common';
import { YoutubeLiveService } from './youtube-live.service';
import { ConfigModule } from '../config/config.module';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
  imports: [ConfigModule, forwardRef(() => SchedulesModule)],
  providers: [YoutubeLiveService],
  exports: [YoutubeLiveService],
})
export class YoutubeLiveModule {}