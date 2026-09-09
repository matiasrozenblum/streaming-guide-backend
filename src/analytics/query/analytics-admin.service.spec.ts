import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsAdminService } from './analytics-admin.service';
import { AnalyticsDailyTotals } from '../entities/analytics-daily-totals.entity';
import { AnalyticsDailyProgram } from '../entities/analytics-daily-program.entity';
import { Granularity } from '../dto/analytics-query.dto';

/** Minimal chainable query-builder double that records what it was asked. */
function makeBuilder(queue: unknown[][]) {
  const state = {
    selects: [] as string[],
    wheres: [] as Array<[string, Record<string, unknown>]>,
    limit: undefined as number | undefined,
  };

  const builder: Record<string, jest.Mock> = {};
  const chain = () => builder;

  Object.assign(builder, {
    select: jest.fn((expr: string) => {
      state.selects.push(expr);
      return builder;
    }),
    addSelect: jest.fn(chain),
    from: jest.fn(chain),
    innerJoin: jest.fn(chain),
    leftJoin: jest.fn(chain),
    where: jest.fn((sql: string, params: Record<string, unknown>) => {
      state.wheres.push([sql, params]);
      return builder;
    }),
    andWhere: jest.fn((sql: string, params: Record<string, unknown>) => {
      state.wheres.push([sql, params]);
      return builder;
    }),
    groupBy: jest.fn(chain),
    addGroupBy: jest.fn(chain),
    orderBy: jest.fn(chain),
    addOrderBy: jest.fn(chain),
    limit: jest.fn((n: number) => {
      state.limit = n;
      return builder;
    }),
    getRawMany: jest.fn(() => Promise.resolve(queue.shift() ?? [])),
  });

  return { builder, state };
}

describe('AnalyticsAdminService', () => {
  let service: AnalyticsAdminService;
  let queue: unknown[][];
  let totalsBuilder: ReturnType<typeof makeBuilder>;
  let programBuilder: ReturnType<typeof makeBuilder>;

  beforeEach(async () => {
    queue = [];
    totalsBuilder = makeBuilder(queue);
    programBuilder = makeBuilder(queue);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsAdminService,
        {
          provide: getRepositoryToken(AnalyticsDailyTotals),
          useValue: { createQueryBuilder: () => totalsBuilder.builder },
        },
        {
          provide: getRepositoryToken(AnalyticsDailyProgram),
          useValue: {
            createQueryBuilder: () => programBuilder.builder,
            manager: { createQueryBuilder: () => programBuilder.builder },
          },
        },
      ],
    }).compile();

    service = module.get<AnalyticsAdminService>(AnalyticsAdminService);
  });

  describe('getOverview', () => {
    it('compares against the equally sized window ending the day before', async () => {
      queue.push([], []);

      const result = await service.getOverview('2026-09-08', '2026-09-14');

      expect(result.previous_from).toBe('2026-09-01');
      expect(result.previous_to).toBe('2026-09-07');
    });

    it('computes a percentage delta per metric', async () => {
      queue.push(
        [{ event_name: 'click_youtube_live', count: '150' }],
        [{ event_name: 'click_youtube_live', count: '100' }],
      );

      const result = await service.getOverview('2026-09-08', '2026-09-14');

      expect(result.tiles[0]).toMatchObject({
        metric: 'click_youtube_live',
        value: 150,
        previous: 100,
        delta_pct: 50,
      });
    });

    it('reports null instead of an infinite delta off a zero baseline', async () => {
      queue.push([{ event_name: 'zap_use', count: '10' }], []);

      const result = await service.getOverview('2026-09-08', '2026-09-14');

      expect(result.tiles[0].delta_pct).toBeNull();
    });

    it('keeps a metric that disappeared this period', async () => {
      queue.push([], [{ event_name: 'zap_use', count: '80' }]);

      const result = await service.getOverview('2026-09-08', '2026-09-14');

      expect(result.tiles[0]).toMatchObject({
        metric: 'zap_use',
        value: 0,
        previous: 80,
        delta_pct: -100,
      });
    });

    it('orders tiles by current volume', async () => {
      queue.push(
        [
          { event_name: 'small', count: '5' },
          { event_name: 'big', count: '500' },
        ],
        [],
      );

      const result = await service.getOverview('2026-09-08', '2026-09-14');

      expect(result.tiles.map((t) => t.metric)).toEqual(['big', 'small']);
    });
  });

  describe('getTrends', () => {
    it('buckets by raw date for day granularity', async () => {
      queue.push([]);
      await service.getTrends(
        '2026-09-01',
        '2026-09-30',
        'click_youtube_live',
        Granularity.DAY,
      );

      expect(totalsBuilder.state.selects[0]).toBe('t.date');
    });

    it('truncates to the week when asked', async () => {
      queue.push([]);
      await service.getTrends(
        '2026-09-01',
        '2026-09-30',
        'click_youtube_live',
        Granularity.WEEK,
      );

      expect(totalsBuilder.state.selects[0]).toContain("date_trunc('week'");
    });

    it('truncates to the month when asked', async () => {
      queue.push([]);
      await service.getTrends(
        '2026-01-01',
        '2026-12-31',
        'click_youtube_live',
        Granularity.MONTH,
      );

      expect(totalsBuilder.state.selects[0]).toContain("date_trunc('month'");
    });

    it('normalises Date buckets to ISO date strings', async () => {
      queue.push([
        {
          bucket: new Date('2026-09-01T00:00:00Z'),
          count: '10',
          unique_users: '4',
          unique_devices: '6',
        },
      ]);

      const result = await service.getTrends('2026-09-01', '2026-09-30');

      expect(result.points[0].bucket).toBe('2026-09-01');
      expect(result.points[0].count).toBe(10);
    });

    it('filters by platform only when one is given', async () => {
      queue.push([]);
      await service.getTrends(
        '2026-09-01',
        '2026-09-30',
        'click_youtube_live',
        Granularity.DAY,
        'web',
      );

      const platformFilter = totalsBuilder.state.wheres.find(([sql]) =>
        sql.includes('platform'),
      );
      expect(platformFilter?.[1]).toMatchObject({ platform: 'web' });
    });
  });

  describe('getProgramRanking', () => {
    const row = (id: number, name: string, value: string) => ({
      program_id: id,
      program_name: name,
      channel_id: 9,
      channel_name: 'Luzu',
      channel_logo_url: 'logo.png',
      channel_background_color: '#2D0A4E',
      value,
      unique_users: '5',
    });

    it('numbers positions from one, in descending volume', async () => {
      queue.push([row(1, 'A', '100'), row(2, 'B', '50')], []);

      const result = await service.getProgramRanking(
        '2026-09-01',
        '2026-09-07',
      );

      expect(result.map((r) => r.position)).toEqual([1, 2]);
      expect(result[0].program_name).toBe('A');
    });

    it('returns the channel branding the share image needs', async () => {
      queue.push([row(1, 'Nadie dice Nada', '100')], []);

      const result = await service.getProgramRanking(
        '2026-09-01',
        '2026-09-07',
      );

      expect(result[0]).toMatchObject({
        channel_name: 'Luzu',
        channel_logo_url: 'logo.png',
        channel_background_color: '#2D0A4E',
      });
    });

    it('resolves the previous position from the prior window', async () => {
      queue.push(
        [row(1, 'A', '100'), row(2, 'B', '50')],
        [row(2, 'B', '90'), row(1, 'A', '10')],
      );

      const result = await service.getProgramRanking(
        '2026-09-01',
        '2026-09-07',
      );

      expect(result[0]).toMatchObject({ position: 1, previous_position: 2 });
      expect(result[1]).toMatchObject({ position: 2, previous_position: 1 });
    });

    it('leaves previous_position null for a program with no prior data', async () => {
      queue.push([row(1, 'Nuevo', '100')], []);

      const result = await service.getProgramRanking(
        '2026-09-01',
        '2026-09-07',
      );

      expect(result[0].previous_position).toBeNull();
    });

    it('looks deeper into the prior window than the requested limit', async () => {
      queue.push([row(1, 'A', '100')], []);

      await service.getProgramRanking(
        '2026-09-01',
        '2026-09-07',
        'click_youtube_live',
        10,
      );

      // Second call is the prior window; it must not be capped at 10, or a
      // program that climbed from position 12 would look brand new.
      expect(programBuilder.state.limit).toBeGreaterThan(10);
    });

    it('coerces the aggregate strings Postgres returns into numbers', async () => {
      queue.push([row(1, 'A', '100')], []);

      const result = await service.getProgramRanking(
        '2026-09-01',
        '2026-09-07',
      );

      expect(result[0].value).toBe(100);
      expect(result[0].unique_users).toBe(5);
    });
  });

  describe('getChannelRanking', () => {
    it('ranks channels with the same movement semantics', async () => {
      const channelRow = (id: number, name: string, value: string) => ({
        channel_id: id,
        channel_name: name,
        channel_logo_url: null,
        channel_background_color: null,
        value,
        unique_users: '3',
      });
      queue.push(
        [channelRow(1, 'Luzu', '200'), channelRow(2, 'Olga', '150')],
        [channelRow(2, 'Olga', '300')],
      );

      const result = await service.getChannelRanking(
        '2026-09-01',
        '2026-09-07',
      );

      expect(result[0]).toMatchObject({ position: 1, previous_position: null });
      expect(result[1]).toMatchObject({ position: 2, previous_position: 1 });
    });
  });

  describe('getProgramTrend', () => {
    it('scopes the series to the requested program', async () => {
      queue.push([]);

      await service.getProgramTrend(42, '2026-09-01', '2026-09-30');

      const programFilter = programBuilder.state.wheres.find(([sql]) =>
        sql.includes('p.program_id'),
      );
      expect(programFilter?.[1]).toMatchObject({ programId: 42 });
    });
  });
});
