import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  AnalyticsRollupService,
  RECOMPUTE_WINDOW_DAYS,
} from './analytics-rollup.service';
import { AnalyticsEvent } from '../entities/analytics-event.entity';
import { SentryService } from '../../sentry/sentry.service';

describe('AnalyticsRollupService', () => {
  let service: AnalyticsRollupService;
  let query: jest.Mock;
  let sentry: { captureMessage: jest.Mock };

  beforeEach(async () => {
    query = jest.fn().mockResolvedValue([]);
    sentry = { captureMessage: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsRollupService,
        { provide: getRepositoryToken(AnalyticsEvent), useValue: { query } },
        { provide: SentryService, useValue: sentry },
      ],
    }).compile();

    service = module.get<AnalyticsRollupService>(AnalyticsRollupService);
  });

  it('recomputes all four rollup tables for a date', async () => {
    await service.rollupDate('2026-09-01');

    const statements = query.mock.calls.map((call) => call[0] as string);
    expect(statements).toHaveLength(4);
    expect(statements.join()).toContain('analytics_daily_totals');
    expect(statements.join()).toContain('analytics_daily_program');
    expect(statements.join()).toContain('analytics_daily_channel');
    expect(statements.join()).toContain('analytics_daily_user');
  });

  it('upserts rather than increments, so a rerun is idempotent', async () => {
    await service.rollupDate('2026-09-01');

    for (const [sql] of query.mock.calls) {
      expect(sql).toContain('ON CONFLICT');
      expect(sql).toContain('DO UPDATE SET');
      // An increment would read "count = table.count + EXCLUDED.count" and
      // would double the day's numbers on every rerun.
      expect(sql).toContain('count = EXCLUDED.count');
    }
  });

  it('buckets days in Argentina time, not UTC', async () => {
    await service.rollupDate('2026-09-01');

    for (const [sql] of query.mock.calls) {
      expect(sql).toContain("AT TIME ZONE 'America/Argentina/Buenos_Aires'");
    }
  });

  it('passes the target date as a parameter, never interpolated', async () => {
    await service.rollupDate('2026-09-01');

    for (const [sql, params] of query.mock.calls) {
      expect(params).toEqual(['2026-09-01']);
      expect(sql).not.toContain('2026-09-01');
    }
  });

  it('excludes rows that cannot be attributed from the program rollup', async () => {
    await service.rollupDate('2026-09-01');

    const programSql = query.mock.calls
      .map((call) => call[0] as string)
      .find((sql) => sql.includes('analytics_daily_program'))!;
    expect(programSql).toContain('e.program_id IS NOT NULL');
  });

  it('limits the user rollup to signed-in, program-attributed events', async () => {
    await service.rollupDate('2026-09-01');

    const userSql = query.mock.calls
      .map((call) => call[0] as string)
      .find((sql) => sql.includes('analytics_daily_user'))!;
    expect(userSql).toContain('e.user_id IS NOT NULL');
    expect(userSql).toContain('e.program_id IS NOT NULL');
  });

  describe('runNightly', () => {
    it('recomputes a multi-day window so late mobile events are picked up', async () => {
      await service.runNightly();

      const dates = new Set(
        query.mock.calls.map((call) => (call[1] as string[])[0]),
      );
      expect(dates.size).toBe(RECOMPUTE_WINDOW_DAYS);
    });

    it('reports a failed day to Sentry and still processes the others', async () => {
      query.mockRejectedValueOnce(new Error('deadlock'));

      await service.runNightly();

      expect(sentry.captureMessage).toHaveBeenCalledWith(
        'Analytics rollup failed',
        'error',
        expect.objectContaining({ error_type: 'rollup_failed' }),
      );
      // The remaining days still ran: 4 statements each for the days after
      // the one that threw.
      expect(query.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('backfill', () => {
    it('covers the range inclusively, oldest first', async () => {
      const days = await service.backfill('2026-09-01', '2026-09-03');

      expect(days).toBe(3);
      const dates = query.mock.calls.map((call) => (call[1] as string[])[0]);
      expect(dates[0]).toBe('2026-09-01');
      expect(dates[dates.length - 1]).toBe('2026-09-03');
    });

    it('handles a single-day range', async () => {
      expect(await service.backfill('2026-09-01', '2026-09-01')).toBe(1);
    });
  });

  describe('pruneRawEvents', () => {
    it('only deletes raw events, never a rollup', async () => {
      await service.pruneRawEvents();

      const [sql] = query.mock.calls[0];
      expect(sql).toContain('DELETE FROM analytics_event');
      expect(sql).not.toContain('analytics_daily');
    });

    it('swallows a failure and reports it rather than crashing the cron', async () => {
      query.mockRejectedValueOnce(new Error('timeout'));

      await expect(service.pruneRawEvents()).resolves.toBe(0);
      expect(sentry.captureMessage).toHaveBeenCalledWith(
        'Analytics retention job failed',
        'error',
        expect.objectContaining({ error_type: 'retention_failed' }),
      );
    });
  });
});
