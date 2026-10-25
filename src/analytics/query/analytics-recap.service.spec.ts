import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsRecapService } from './analytics-recap.service';
import { AnalyticsDailyUser } from '../entities/analytics-daily-user.entity';
import { AnalyticsDailyUserStreamer } from '../entities/analytics-daily-user-streamer.entity';
import { AnalyticsDailyUserSlot } from '../entities/analytics-daily-user-slot.entity';
import { RedisService } from '../../redis/redis.service';
import { RecapPeriod } from '../dto/analytics-query.dto';

describe('AnalyticsRecapService', () => {
  let service: AnalyticsRecapService;
  let redisService: { get: jest.Mock; set: jest.Mock };
  let builder: Record<string, jest.Mock>;
  let streamerBuilder: Record<string, jest.Mock>;
  /** Rows the streamer rollup returns; kept apart from rawManyQueue. */
  let streamerRows: unknown[];
  let slotBuilder: Record<string, jest.Mock>;
  /** Rows the slot rollup returns; also kept apart from rawManyQueue. */
  let slotRows: unknown[];
  let whereCalls: Array<[string, Record<string, unknown>]>;

  /** Rows returned by getRawMany, in call order. */
  let rawManyQueue: unknown[][];
  /** Rows returned by getRawOne, in call order. */
  let rawOneQueue: unknown[];

  beforeEach(async () => {
    whereCalls = [];
    rawManyQueue = [];
    rawOneQueue = [];
    streamerRows = [];
    slotRows = [];

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

    // Its own builder: the streamer rollup is a separate table, and sharing the
    // queue would make every existing expectation depend on call interleaving.
    const streamerChain = () => streamerBuilder;
    streamerBuilder = {
      select: jest.fn(streamerChain),
      addSelect: jest.fn(streamerChain),
      innerJoin: jest.fn(streamerChain),
      where: jest.fn((sql: string, params: Record<string, unknown>) => {
        whereCalls.push([sql, params]);
        return streamerBuilder;
      }),
      andWhere: jest.fn((sql: string, params: Record<string, unknown>) => {
        whereCalls.push([sql, params]);
        return streamerBuilder;
      }),
      groupBy: jest.fn(streamerChain),
      addGroupBy: jest.fn(streamerChain),
      orderBy: jest.fn(streamerChain),
      addOrderBy: jest.fn(streamerChain),
      limit: jest.fn(streamerChain),
      getRawMany: jest.fn(() => Promise.resolve(streamerRows)),
    };

    const slotChain = () => slotBuilder;
    slotBuilder = {
      select: jest.fn(slotChain),
      addSelect: jest.fn(slotChain),
      innerJoin: jest.fn(slotChain),
      where: jest.fn((sql: string, params: Record<string, unknown>) => {
        whereCalls.push([sql, params]);
        return slotBuilder;
      }),
      andWhere: jest.fn((sql: string, params: Record<string, unknown>) => {
        whereCalls.push([sql, params]);
        return slotBuilder;
      }),
      groupBy: jest.fn(slotChain),
      addGroupBy: jest.fn(slotChain),
      getRawMany: jest.fn(() => Promise.resolve(slotRows)),
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
        {
          provide: getRepositoryToken(AnalyticsDailyUserStreamer),
          useValue: { createQueryBuilder: jest.fn(() => streamerBuilder) },
        },
        {
          provide: getRepositoryToken(AnalyticsDailyUserSlot),
          useValue: { createQueryBuilder: jest.fn(() => slotBuilder) },
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
      // The streamer rollup is a second table holding the same private data,
      // so it has to be scoped too — it would not be covered by the check above.
      const streamerFilters = whereCalls.filter(([sql]) =>
        sql.includes('s.user_id = :userId'),
      );
      expect(streamerFilters.length).toBeGreaterThan(0);
      for (const [, params] of [...userFilters, ...streamerFilters]) {
        expect(params).toEqual(expect.objectContaining({ userId: 42 }));
      }
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

  describe('grilla', () => {
    /** La semana del 5 al 11 de octubre de 2026 arranca lunes. */
    const slot = (date: string, hour: number, plays = 1, channel = 1) => ({
      date,
      hour: String(hour),
      program_id: '92',
      key_id: String(channel),
      key_name: channel === 1 ? 'Luzu TV' : 'Olga',
      plays: String(plays),
    });

    /** Tres plays superan MIN_PLAYS_FOR_RECAP, asi que la grilla no se retiene. */
    const withEnoughPlays = () => {
      rawOneQueue = [
        { plays: '3', distinct_programs: '1', distinct_channels: '1' },
        { dow: '3', plays: '3' },
        { plays: '0' },
      ];
    };

    it('arma 3 franjas por 7 dias en la semana', async () => {
      withEnoughPlays();
      slotRows = [slot('2026-10-05', 10)];

      const { grids } = await service.getRecap(
        42,
        RecapPeriod.WEEK,
        '2026-10-07',
      );

      expect(grids.total.shape).toBe('week');
      expect(grids.total.day_labels).toEqual([
        'L',
        'M',
        'X',
        'J',
        'V',
        'S',
        'D',
      ]);
      expect(grids.total.rows.map((r) => r.label)).toEqual([
        'Mañana',
        'Tarde',
        'Noche',
      ]);
      for (const row of grids.total.rows) expect(row.cells).toHaveLength(7);
    });

    it('ubica cada play en su franja y su dia', async () => {
      withEnoughPlays();
      // lunes a la mañana, miercoles a la tarde, viernes a la noche
      slotRows = [
        slot('2026-10-05', 9),
        slot('2026-10-07', 15),
        slot('2026-10-09', 21),
      ];

      const { grids } = await service.getRecap(
        42,
        RecapPeriod.WEEK,
        '2026-10-07',
      );
      const [manana, tarde, noche] = grids.total.rows;

      expect(manana.cells[0].plays).toBe(1);
      expect(tarde.cells[2].plays).toBe(1);
      expect(noche.cells[4].plays).toBe(1);
    });

    it('pliega la trasnoche en la noche y no la pierde', async () => {
      withEnoughPlays();
      slotRows = [slot('2026-10-05', 3, 4)];

      const { grids } = await service.getRecap(
        42,
        RecapPeriod.WEEK,
        '2026-10-07',
      );

      expect(grids.total.rows[2].cells[0].plays).toBe(4);
      expect(grids.total.rows[0].cells[0].plays).toBe(0);
    });

    it('pinta la celda con el canal que mas la ocupa', async () => {
      withEnoughPlays();
      slotRows = [slot('2026-10-05', 9, 2, 1), slot('2026-10-05', 10, 5, 2)];

      const { grids } = await service.getRecap(
        42,
        RecapPeriod.WEEK,
        '2026-10-07',
      );
      const cell = grids.total.rows[0].cells[0];

      expect(cell.plays).toBe(7);
      expect(cell.channel_name).toBe('Olga');
    });

    it('marca una sola celda como pico', async () => {
      withEnoughPlays();
      slotRows = [slot('2026-10-05', 9, 2), slot('2026-10-07', 10, 9)];

      const { grids } = await service.getRecap(
        42,
        RecapPeriod.WEEK,
        '2026-10-07',
      );
      const peaks = grids.total.rows.flatMap((r) =>
        r.cells.filter((c) => c.peak),
      );

      expect(peaks).toHaveLength(1);
      expect(peaks[0].plays).toBe(9);
    });

    it('nombra el pico en la frase', async () => {
      withEnoughPlays();
      slotRows = [slot('2026-10-05', 9, 2), slot('2026-10-07', 10, 9)];

      const { grids } = await service.getRecap(
        42,
        RecapPeriod.WEEK,
        '2026-10-07',
      );

      expect(grids.total.peak_label).toBe('los miércoles a la mañana');
    });

    it('arma un calendario con el relleno del primer dia en el mes', async () => {
      withEnoughPlays();
      slotRows = [slot('2026-10-01', 10)];

      const { grids } = await service.getRecap(
        42,
        RecapPeriod.MONTH,
        '2026-10-07',
      );

      // El 1 de octubre de 2026 cae jueves: las tres celdas previas van vacias.
      expect(grids.total.shape).toBe('month');
      const first = grids.total.rows[0].cells;
      expect(first.slice(0, 3).every((c) => c.date === null)).toBe(true);
      expect(first[3].date).toBe('2026-10-01');
      for (const row of grids.total.rows) expect(row.cells).toHaveLength(7);
    });

    it('la grilla del programa deja afuera a los demas', async () => {
      withEnoughPlays();
      slotRows = [
        { ...slot('2026-10-05', 9, 4), program_id: '92' },
        { ...slot('2026-10-06', 9, 7), program_id: '99' },
      ];

      const { grids } = await service.getRecap(
        42,
        RecapPeriod.WEEK,
        '2026-10-07',
      );

      // topPrograms viene vacio en este mock, asi que no hay programa destacado.
      expect(grids.program).toBeNull();
      expect(grids.total.rows[0].cells[1].plays).toBe(7);
    });

    it('no devuelve grilla cuando no alcanza el minimo', async () => {
      rawOneQueue = [
        { plays: '1', distinct_programs: '1', distinct_channels: '1' },
        { dow: '3', plays: '1' },
        { plays: '0' },
      ];
      slotRows = [slot('2026-10-05', 9)];

      const recap = await service.getRecap(42, RecapPeriod.WEEK, '2026-10-07');

      expect(recap.enough_data).toBe(false);
      expect(recap.grids.total.rows).toEqual([]);
      expect(recap.grids.streamers.rows).toEqual([]);
      expect(recap.grids.program).toBeNull();
    });
  });
});
