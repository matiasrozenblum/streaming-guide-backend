import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsRecapService } from './analytics-recap.service';
import { AnalyticsDailyUser } from '../entities/analytics-daily-user.entity';
import { RedisService } from '../../redis/redis.service';
import { RecapPeriod } from '../dto/analytics-query.dto';

describe('AnalyticsRecapService', () => {
  let service: AnalyticsRecapService;
  let redisService: { get: jest.Mock; set: jest.Mock };
  let builder: Record<string, jest.Mock>;
  let whereCalls: Array<[string, Record<string, unknown>]>;

  /** Rows returned by getRawMany, in call order. */
  let rawManyQueue: unknown[][];
  /** Rows returned by getRawOne, in call order. */
  let rawOneQueue: unknown[];

  beforeEach(async () => {
    whereCalls = [];
    rawManyQueue = [];
    rawOneQueue = [];

    const chain = () => builder;
    builder = {
      select: jest.fn(chain),
      addSelect: jest.fn(chain),
      innerJoin: jest.fn(chain),
      leftJoin: jest.fn(chain),
      where: jest.fn((sql: string, params: Record<string, unknown>) => {
        whereCalls.push([sql, params]);
        return builder;
      }),
      andWhere: jest.fn((sql: string, params: Record<string, unknown>) => {
        whereCalls.push([sql, params]);
        return builder;
      }),
      groupBy: jest.fn(chain),
      addGroupBy: jest.fn(chain),
      orderBy: jest.fn(chain),
      addOrderBy: jest.fn(chain),
      limit: jest.fn(chain),
      getRawMany: jest.fn(() => Promise.resolve(rawManyQueue.shift() ?? [])),
      getRawOne: jest.fn(() =>
        Promise.resolve(rawOneQueue.shift() ?? undefined),
      ),
    };

    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsRecapService,
        {
          provide: getRepositoryToken(AnalyticsDailyUser),
          useValue: { createQueryBuilder: jest.fn(() => builder) },
        },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<AnalyticsRecapService>(AnalyticsRecapService);
  });

  describe('user isolation', () => {
    it('scopes every query to the requested user id', async () => {
      await service.getRecap(42, RecapPeriod.WEEK, '2026-09-02');

      const userFilters = whereCalls.filter(([sql]) =>
        sql.includes('u.user_id = :userId'),
      );
      expect(userFilters.length).toBeGreaterThan(0);
      for (const [, params] of userFilters) {
        expect(params).toMatchObject({ userId: 42 });
      }
    });

    it('never queries a user id other than the one passed in', async () => {
      await service.getRecap(7, RecapPeriod.WEEK, '2026-09-02');

      const ids = whereCalls
        .map(([, params]) => params?.userId)
        .filter((id) => id !== undefined);
      expect(new Set(ids)).toEqual(new Set([7]));
    });

    it('keys the cache per user, so one recap cannot serve another', async () => {
      await service.getRecap(1, RecapPeriod.WEEK, '2026-09-02');
      const keyForUser1 = redisService.get.mock.calls[0][0] as string;

      redisService.get.mockClear();
      await service.getRecap(2, RecapPeriod.WEEK, '2026-09-02');
      const keyForUser2 = redisService.get.mock.calls[0][0] as string;

      expect(keyForUser1).not.toBe(keyForUser2);
      expect(keyForUser1).toContain(':1:');
      expect(keyForUser2).toContain(':2:');
    });
  });

  describe('period resolution', () => {
    it('anchors a week Monday to Sunday', async () => {
      // 2026-09-02 is a Wednesday.
      const recap = await service.getRecap(1, RecapPeriod.WEEK, '2026-09-02');

      expect(recap.period.from).toBe('2026-08-31');
      expect(recap.period.to).toBe('2026-09-06');
    });

    it('treats Sunday as the end of its week, not the start', async () => {
      // 2026-09-06 is a Sunday; it must close the week that began 08-31.
      const recap = await service.getRecap(1, RecapPeriod.WEEK, '2026-09-06');

      expect(recap.period.from).toBe('2026-08-31');
      expect(recap.period.to).toBe('2026-09-06');
    });

    it('names both months when a week straddles them', async () => {
      // 2026-08-31 is a Monday; the week ends 2026-09-06.
      const recap = await service.getRecap(1, RecapPeriod.WEEK, '2026-09-02');

      expect(recap.period.label).toBe(
        'Semana del 31 de agosto al 6 de septiembre',
      );
    });

    it('names the month once when the week sits inside it', async () => {
      const recap = await service.getRecap(1, RecapPeriod.WEEK, '2026-09-09');

      expect(recap.period.label).toBe('Semana del 7 al 13 de septiembre');
    });

    it('covers a full calendar month', async () => {
      const recap = await service.getRecap(1, RecapPeriod.MONTH, '2026-09-15');

      expect(recap.period.from).toBe('2026-09-01');
      expect(recap.period.to).toBe('2026-09-30');
    });

    it('covers a full calendar year', async () => {
      const recap = await service.getRecap(1, RecapPeriod.YEAR, '2026-05-15');

      expect(recap.period.from).toBe('2026-01-01');
      expect(recap.period.to).toBe('2026-12-31');
      expect(recap.period.label).toBe('2026');
    });
  });

  describe('empty state', () => {
    it('flags too little activity and withholds the lists', async () => {
      rawManyQueue = [[{ program_id: '1', program_name: 'A', plays: '2' }], []];
      rawOneQueue = [
        { plays: '2', distinct_programs: '1', distinct_channels: '1' },
        undefined,
        { plays: '0' },
      ];

      const recap = await service.getRecap(1, RecapPeriod.WEEK, '2026-09-02');

      expect(recap.enough_data).toBe(false);
      expect(recap.top_programs).toEqual([]);
      expect(recap.top_channels).toEqual([]);
      expect(recap.habits.favorite_weekday).toBeNull();
    });

    it('returns the lists once there is enough activity', async () => {
      rawManyQueue = [
        [
          {
            program_id: '1',
            program_name: 'Nadie dice Nada',
            channel_id: '9',
            channel_name: 'Luzu',
            channel_logo_url: 'logo.png',
            channel_background_color: '#000',
            plays: '10',
          },
        ],
        [
          {
            channel_id: '9',
            channel_name: 'Luzu',
            channel_logo_url: 'logo.png',
            channel_background_color: '#000',
            plays: '10',
          },
        ],
      ];
      rawOneQueue = [
        { plays: '10', distinct_programs: '1', distinct_channels: '1' },
        { dow: '3', plays: '10' },
        { plays: '5' },
      ];

      const recap = await service.getRecap(1, RecapPeriod.WEEK, '2026-09-02');

      expect(recap.enough_data).toBe(true);
      expect(recap.top_programs[0]).toMatchObject({
        position: 1,
        program_name: 'Nadie dice Nada',
        plays: 10,
      });
      expect(recap.top_channels[0]).toMatchObject({ channel_name: 'Luzu' });
      expect(recap.habits.favorite_weekday).toBe('miércoles');
    });
  });

  describe('comparison', () => {
    it('reports null rather than a fake percentage against a zero baseline', async () => {
      rawManyQueue = [[], []];
      rawOneQueue = [
        { plays: '10', distinct_programs: '2', distinct_channels: '1' },
        { dow: '1', plays: '10' },
        { plays: '0' },
      ];

      const recap = await service.getRecap(1, RecapPeriod.WEEK, '2026-09-02');

      expect(recap.comparison.plays_delta_pct_vs_previous).toBeNull();
    });

    it('computes the delta against the preceding period', async () => {
      rawManyQueue = [[], []];
      rawOneQueue = [
        { plays: '15', distinct_programs: '2', distinct_channels: '1' },
        { dow: '1', plays: '15' },
        { plays: '10' },
      ];

      const recap = await service.getRecap(1, RecapPeriod.WEEK, '2026-09-02');

      expect(recap.comparison.plays_delta_pct_vs_previous).toBe(50);
    });
  });

  describe('caching', () => {
    it('serves a cached recap without touching the database', async () => {
      redisService.get.mockResolvedValue({ enough_data: true } as never);

      const recap = await service.getRecap(1, RecapPeriod.WEEK, '2026-09-02');

      expect(recap).toEqual({ enough_data: true });
      expect(builder.getRawMany).not.toHaveBeenCalled();
    });

    it('still builds the recap when the cache is unavailable', async () => {
      redisService.get.mockRejectedValue(new Error('redis down'));
      redisService.set.mockRejectedValue(new Error('redis down'));

      await expect(
        service.getRecap(1, RecapPeriod.WEEK, '2026-09-02'),
      ).resolves.toBeDefined();
    });

    it('caches a closed period for longer than an open one', async () => {
      await service.getRecap(1, RecapPeriod.WEEK, '2026-09-02');
      const closedTtl = redisService.set.mock.calls[0][2] as number;

      redisService.set.mockClear();
      const today = new Date().toISOString().slice(0, 10);
      await service.getRecap(1, RecapPeriod.YEAR, today);
      const openTtl = redisService.set.mock.calls[0][2] as number;

      expect(closedTtl).toBeGreaterThan(openTtl);
    });
  });
});
