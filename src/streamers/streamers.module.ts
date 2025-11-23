import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StreamersController } from './streamers.controller';
import { StreamersService } from './streamers.service';
import { StreamerLiveStatusService } from './streamer-live-status.service';
import { Streamer } from './streamers.entity';
import { Category } from '../categories/categories.entity';
import { RedisModule } from '../redis/redis.module';
import { ConfigModule } from '../config/config.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Streamer, Category]),
    RedisModule,
    ConfigModule,
    forwardRef(() => WebhooksModule),
  ],
  controllers: [StreamersController],
  providers: [StreamersService, StreamerLiveStatusService],
  exports: [StreamersService, StreamerLiveStatusService],
})
export class StreamersModule {}

