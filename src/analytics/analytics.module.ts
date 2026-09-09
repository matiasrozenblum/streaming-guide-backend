import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsEvent } from './entities/analytics-event.entity';
import { AnalyticsDailyProgram } from './entities/analytics-daily-program.entity';
import { AnalyticsDailyChannel } from './entities/analytics-daily-channel.entity';
import { AnalyticsDailyUser } from './entities/analytics-daily-user.entity';
import { AnalyticsDailyTotals } from './entities/analytics-daily-totals.entity';
import { Program } from '../programs/programs.entity';
import { Channel } from '../channels/channels.entity';
import { AnalyticsIngestController } from './ingest/analytics-ingest.controller';
import { AnalyticsIngestService } from './ingest/analytics-ingest.service';
import { AnalyticsRollupService } from './rollup/analytics-rollup.service';
import { AnalyticsAdminController } from './query/analytics-admin.controller';
import { AnalyticsAdminService } from './query/analytics-admin.service';
import { AnalyticsRecapController } from './query/analytics-recap.controller';
import { AnalyticsRecapService } from './query/analytics-recap.service';
import { RedisModule } from '../redis/redis.module';
import { SentryModule } from '../sentry/sentry.module';

/**
 * First-party behavioural analytics: ingestion, daily rollups, and the read
 * APIs that the backoffice and the user-facing recap consume.
 *
 * Distinct from StatisticsModule, which reports on the state of the database
 * (who signed up, who subscribed). This module reports on what people did.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnalyticsEvent,
      AnalyticsDailyProgram,
      AnalyticsDailyChannel,
      AnalyticsDailyUser,
      AnalyticsDailyTotals,
      Program,
      Channel,
    ]),
    RedisModule,
    SentryModule,
  ],
  controllers: [
    AnalyticsIngestController,
    AnalyticsAdminController,
    AnalyticsRecapController,
  ],
  providers: [
    AnalyticsIngestService,
    AnalyticsRollupService,
    AnalyticsAdminService,
    AnalyticsRecapService,
  ],
  exports: [AnalyticsRollupService, AnalyticsAdminService],
})
export class AnalyticsModule {}
