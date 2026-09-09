import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { AnalyticsEvent } from '../entities/analytics-event.entity';
import { SentryService } from '../../sentry/sentry.service';

/**
 * Raw events older than this are dropped. The rollups below are permanent, so
 * only per-event detail (session ids, jsonb properties) ages out.
 */
export const RAW_RETENTION_DAYS = 90;

/**
 * How many days back each nightly run recomputes. Mobile queues events while
 * backgrounded and flushes on next launch, so a day's numbers keep moving for a
 * while after it ends — recomputing only "yesterday" would freeze those in
 * permanently short.
 */
export const RECOMPUTE_WINDOW_DAYS = 3;

/**
 * Aggregates raw events into the permanent analytics_daily_* tables.
 *
 * Every rollup is a full recompute of the day plus an UPSERT, never an
 * increment, which makes reruns idempotent: a failed night can simply be run
 * again, and a change to the aggregation logic can be backfilled over history
 * without double-counting.
 */
@Injectable()
export class AnalyticsRollupService {
  private readonly logger = new Logger(AnalyticsRollupService.name);

  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly eventRepository: Repository<AnalyticsEvent>,
    private readonly sentryService: SentryService,
  ) {}

  /**
   * 03:15 leaves the nightly flush and the daily jobs at 02:00 clear, and lands
   * well after the previous day closed in America/Argentina (UTC-3).
   */
  @Cron('15 3 * * *', {
    name: 'analytics-rollup',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  async runNightly(): Promise<void> {
    const dates = this.recentDates(RECOMPUTE_WINDOW_DAYS);
    this.logger.log(`Rolling up ${dates.length} day(s): ${dates.join(', ')}`);

    for (const date of dates) {
      try {
        await this.rollupDate(date);
      } catch (error) {
        this.logger.error(
          `Rollup failed for ${date}: ${(error as Error).message}`,
        );
        this.sentryService.captureMessage('Analytics rollup failed', 'error', {
          service: 'analytics',
          error_type: 'rollup_failed',
          date,
          error_message: (error as Error).message,
        });
      }
    }
  }

  /** Recompute every rollup table for a single day. Safe to call repeatedly. */
  async rollupDate(date: string): Promise<void> {
    await this.rollupTotals(date);
    await this.rollupPrograms(date);
    await this.rollupChannels(date);
    await this.rollupUsers(date);
  }

  /**
   * Recompute an arbitrary range, oldest first. Used to seed history after a
   * bulk import and to re-derive everything when the aggregation logic changes.
   */
  async backfill(from: string, to: string): Promise<number> {
    const dates: string[] = [];
    const cursor = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);

    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    for (const date of dates) {
      await this.rollupDate(date);
    }

    this.logger.log(`Backfilled ${dates.length} day(s) from ${from} to ${to}`);
    return dates.length;
  }

  /**
   * Days are bucketed in Argentina time, not UTC: a click at 22:00 local belongs
   * to that evening's numbers, and UTC bucketing would push it into the next day.
   */
  private dayExpression(): string {
    return `(e.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`;
  }

  private async rollupTotals(date: string): Promise<void> {
    await this.eventRepository.query(
      `
      INSERT INTO analytics_daily_totals
        (date, platform, event_name, count, unique_users, unique_devices, sessions)
      SELECT
        $1::date,
        e.platform,
        e.event_name,
        COUNT(*)::int,
        COUNT(DISTINCT e.user_id)::int,
        COUNT(DISTINCT e.device_id)::int,
        COUNT(DISTINCT e.session_id)::int
      FROM analytics_event e
      WHERE ${this.dayExpression()} = $1::date
      GROUP BY e.platform, e.event_name
      ON CONFLICT (date, platform, event_name) DO UPDATE SET
        count = EXCLUDED.count,
        unique_users = EXCLUDED.unique_users,
        unique_devices = EXCLUDED.unique_devices,
        sessions = EXCLUDED.sessions
      `,
      [date],
    );
  }

  private async rollupPrograms(date: string): Promise<void> {
    await this.eventRepository.query(
      `
      INSERT INTO analytics_daily_program
        (date, program_id, event_name, channel_id, count, unique_users, unique_devices)
      SELECT
        $1::date,
        e.program_id,
        e.event_name,
        -- MAX() picks a single channel for the day. A program belongs to exactly
        -- one channel, so this is just an aggregate-safe way to carry it through.
        MAX(e.channel_id)::int,
        COUNT(*)::int,
        COUNT(DISTINCT e.user_id)::int,
        COUNT(DISTINCT e.device_id)::int
      FROM analytics_event e
      WHERE ${this.dayExpression()} = $1::date
        AND e.program_id IS NOT NULL
      GROUP BY e.program_id, e.event_name
      ON CONFLICT (date, program_id, event_name) DO UPDATE SET
        channel_id = EXCLUDED.channel_id,
        count = EXCLUDED.count,
        unique_users = EXCLUDED.unique_users,
        unique_devices = EXCLUDED.unique_devices
      `,
      [date],
    );
  }

  private async rollupChannels(date: string): Promise<void> {
    await this.eventRepository.query(
      `
      INSERT INTO analytics_daily_channel
        (date, channel_id, event_name, count, unique_users, unique_devices)
      SELECT
        $1::date,
        e.channel_id,
        e.event_name,
        COUNT(*)::int,
        COUNT(DISTINCT e.user_id)::int,
        COUNT(DISTINCT e.device_id)::int
      FROM analytics_event e
      WHERE ${this.dayExpression()} = $1::date
        AND e.channel_id IS NOT NULL
      GROUP BY e.channel_id, e.event_name
      ON CONFLICT (date, channel_id, event_name) DO UPDATE SET
        count = EXCLUDED.count,
        unique_users = EXCLUDED.unique_users,
        unique_devices = EXCLUDED.unique_devices
      `,
      [date],
    );
  }

  private async rollupUsers(date: string): Promise<void> {
    await this.eventRepository.query(
      `
      INSERT INTO analytics_daily_user
        (date, user_id, program_id, event_name, channel_id, count)
      SELECT
        $1::date,
        e.user_id,
        e.program_id,
        e.event_name,
        MAX(e.channel_id)::int,
        COUNT(*)::int
      FROM analytics_event e
      WHERE ${this.dayExpression()} = $1::date
        AND e.user_id IS NOT NULL
        AND e.program_id IS NOT NULL
      GROUP BY e.user_id, e.program_id, e.event_name
      ON CONFLICT (date, user_id, program_id, event_name) DO UPDATE SET
        channel_id = EXCLUDED.channel_id,
        count = EXCLUDED.count
      `,
      [date],
    );
  }

  /**
   * Drop raw events past the retention window. Runs after the rollup so a day is
   * never deleted before it has been aggregated.
   */
  @Cron('0 4 * * *', {
    name: 'analytics-retention',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
  async pruneRawEvents(): Promise<number> {
    try {
      const result = await this.eventRepository.query(
        `DELETE FROM analytics_event WHERE occurred_at < now() - INTERVAL '${RAW_RETENTION_DAYS} days'`,
      );
      const deleted = Array.isArray(result) ? 0 : (result?.[1] ?? 0);
      this.logger.log(
        `Pruned raw analytics events older than ${RAW_RETENTION_DAYS} days`,
      );
      return deleted;
    } catch (error) {
      this.logger.error(`Retention job failed: ${(error as Error).message}`);
      this.sentryService.captureMessage(
        'Analytics retention job failed',
        'error',
        {
          service: 'analytics',
          error_type: 'retention_failed',
          error_message: (error as Error).message,
        },
      );
      return 0;
    }
  }

  /** The last `days` dates ending yesterday, oldest first, in Argentina time. */
  private recentDates(days: number): string[] {
    const dates: string[] = [];
    const today = new Date(
      new Date().toLocaleString('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires',
      }),
    );

    for (let offset = days; offset >= 1; offset--) {
      const date = new Date(today);
      date.setDate(date.getDate() - offset);
      dates.push(
        `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      );
    }

    return dates;
  }
}
