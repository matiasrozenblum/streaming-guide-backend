import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { SentryModule } from '../sentry/sentry.module';

@Module({
  imports: [SentryModule],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
