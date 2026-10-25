import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsDailyUser } from '../entities/analytics-daily-user.entity';
import { AnalyticsDailyUserStreamer } from '../entities/analytics-daily-user-streamer.entity';
import { AnalyticsDailyUserSlot } from '../entities/analytics-daily-user-slot.entity';
import { RedisService } from '../../redis/redis.service';
import { RecapPeriod } from '../dto/analytics-query.dto';
import {
  DEFAULT_METRIC,
  DEFAULT_STREAMER_METRIC,
} from './analytics-admin.service';

/** Below this, a recap is a sadder object than no recap. */
const MIN_PLAYS_FOR_RECAP = 3;
const TOP_PROGRAMS = 5;
const TOP_CHANNELS = 3;
const TOP_STREAMERS = 3;

/**
 * The channel-by-hour grid. Bands are applied here and not stored, so changing
 * them is a constant rather than a migration. The day starts at 06: earlier
 * activity is rare enough that a column for it would be empty for almost
 * everyone, and it rolls into the first band rather than being dropped.
 */
const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/**
 * Three day parts rather than fixed hour bands, because that is how people
 * describe when they watch. Anything before 06 folds into the night: a play at
 * 03:00 belongs to the night before, not to the morning after, and dropping it
 * would make the grid disagree with the totals beside it.
 */
const DAYPARTS = [
  { label: 'Mañana', from: 6, to: 12 },
  { label: 'Tarde', from: 12, to: 19 },
  { label: 'Noche', from: 19, to: 24 },
] as const;

/** Plural, for the sentence under the grid: "los miércoles a la mañana". */
const WEEKDAY_PLURAL = [
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábados',
  'domingos',
];

const WEEKDAY_LABELS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

export interface RecapProgram {
  position: number;
  program_id: number;
  program_name: string;
  channel_id: number | null;
  channel_name: string | null;
  channel_logo_url: string | null;
  channel_background_color: string | null;
  plays: number;
}

export interface RecapChannel {
  position: number;
  channel_id: number;
  channel_name: string;
  channel_logo_url: string | null;
  channel_background_color: string | null;
  plays: number;
}

export interface RecapStreamer {
  position: number;
  streamer_id: number;
  streamer_name: string;
  streamer_logo_url: string | null;
  plays: number;
}

/** One aggregated slot, before it is folded into a grid. */
interface SlotRow {
  date: string;
  hour: number;
  program_id: number | null;
  /** Channel id on a programme grid, streamer id on a streamer's. */
  key_id: number;
  key_name: string;
  platform: string | null;
  plays: number;
}

export type RecapGridShape = 'week' | 'month';

export interface RecapGridCell {
  /** The day this cell stands for; null for the calendar's leading padding. */
  date: string | null;
  plays: number;
  /** Whichever channel the cell is mostly made of, and its colour on screen. */
  channel_id: number | null;
  channel_name: string | null;
  /** Set instead of the channel on a streamer's grid: twitch, kick, youtube. */
  platform: string | null;
  /** The single busiest cell of the grid. */
  peak: boolean;
}

export interface RecapGridRow {
  /** 'Mañana' | 'Tarde' | 'Noche' on a week, 'Semana 1'… on a month. */
  label: string;
  /** Always seven, Monday first. */
  cells: RecapGridCell[];
}

export interface RecapGrid {
  shape: RecapGridShape;
  day_labels: string[];
  rows: RecapGridRow[];
  /** "los miércoles a la mañana", ready to drop into the sentence. */
  peak_label: string | null;
}

/**
 * Three views of the same plays. The placas show the whole period on a ranking,
 * and only that one programme or streamer on the cards that feature one.
 */
export interface RecapGrids {
  total: RecapGrid;
  program: RecapGrid | null;
  streamer: RecapGrid | null;
}

export interface Recap {
  enough_data: boolean;
  period: { type: RecapPeriod; from: string; to: string; label: string };
  top_programs: RecapProgram[];
  top_channels: RecapChannel[];
  top_streamers: RecapStreamer[];
  grids: RecapGrids;
  totals: {
    plays: number;
    distinct_programs: number;
    distinct_channels: number;
  };
  habits: { favorite_weekday: string | null };
  comparison: { plays_delta_pct_vs_previous: number | null };
}

/**
 * Builds a user's own listening recap — the Wrapped-style summary they can
 * share.
 *
 * Reads only analytics_daily_user, which means a recap stays available for the
 * whole retained history rather than the 90 days of raw events. The user id is
 * always supplied by the caller from the JWT; nothing here accepts one from the
 * request, so one account can never read another's.
 */
@Injectable()
export class AnalyticsRecapService {
  constructor(
    @InjectRepository(AnalyticsDailyUser)
    private readonly dailyUserRepository: Repository<AnalyticsDailyUser>,
    @InjectRepository(AnalyticsDailyUserStreamer)
    private readonly dailyUserStreamerRepository: Repository<AnalyticsDailyUserStreamer>,
    @InjectRepository(AnalyticsDailyUserSlot)
    private readonly dailyUserSlotRepository: Repository<AnalyticsDailyUserSlot>,
    private readonly redisService: RedisService,
  ) {}

  async getRecap(
    userId: number,
    period: RecapPeriod = RecapPeriod.WEEK,
    date?: string,
  ): Promise<Recap> {
    const range = this.resolveRange(period, date);
    const cacheKey = `analytics:recap:${userId}:${period}:${range.from}`;

    try {
      const cached = await this.redisService.get<Recap>(cacheKey);
      if (cached) return cached;
    } catch {
      // Cache unavailable — recompute.
    }

    const recap = await this.buildRecap(userId, period, range);

    try {
      await this.redisService.set(cacheKey, recap, this.cacheTtl(range.to));
    } catch {
      // Non-fatal.
    }

    return recap;
  }

  private async buildRecap(
    userId: number,
    period: RecapPeriod,
    range: { from: string; to: string; label: string },
  ): Promise<Recap> {
    const [programs, channels, streamers, totals, weekday, previousPlays] =
      await Promise.all([
        this.topPrograms(userId, range.from, range.to),
        this.topChannels(userId, range.from, range.to),
        this.topStreamers(userId, range.from, range.to),
        this.totals(userId, range.from, range.to),
        this.favoriteWeekday(userId, range.from, range.to),
        this.playCount(
          userId,
          ...this.previousRangeTuple(range.from, range.to),
        ),
      ]);

    // The grids need to know which programme and streamer came first, so they
    // run once that is settled rather than alongside it.
    const grids = await this.buildGrids(
      userId,
      period,
      range.from,
      range.to,
      programs[0]?.program_id ?? null,
      streamers[0]?.streamer_id ?? null,
    );

    const enoughData = totals.plays >= MIN_PLAYS_FOR_RECAP;

    return {
      enough_data: enoughData,
      period: {
        type: period,
        from: range.from,
        to: range.to,
        label: range.label,
      },
      top_programs: enoughData ? programs : [],
      top_channels: enoughData ? channels : [],
      top_streamers: enoughData ? streamers : [],
      grids: enoughData
        ? grids
        : { total: this.emptyGrid(period), program: null, streamer: null },
      totals,
      habits: { favorite_weekday: enoughData ? weekday : null },
      comparison: {
        plays_delta_pct_vs_previous:
          previousPlays === 0
            ? null
            : Math.round(
                ((totals.plays - previousPlays) / previousPlays) * 1000,
              ) / 10,
      },
    };
  }

  private async topPrograms(
    userId: number,
    from: string,
    to: string,
  ): Promise<RecapProgram[]> {
    const rows = await this.dailyUserRepository
      .createQueryBuilder('u')
      .select('u.program_id', 'program_id')
      .addSelect('prog.name', 'program_name')
      .addSelect('u.channel_id', 'channel_id')
      .addSelect('ch.name', 'channel_name')
      .addSelect('ch.logo_url', 'channel_logo_url')
      .addSelect('ch.background_color', 'channel_background_color')
      .addSelect('SUM(u.count)', 'plays')
      .innerJoin('program', 'prog', 'prog.id = u.program_id')
      .leftJoin('channel', 'ch', 'ch.id = u.channel_id')
      .where('u.user_id = :userId', { userId })
      .andWhere('u.date BETWEEN :from AND :to', { from, to })
      .andWhere('u.event_name = :metric', { metric: DEFAULT_METRIC })
      .groupBy('u.program_id')
      .addGroupBy('prog.name')
      .addGroupBy('u.channel_id')
      .addGroupBy('ch.name')
      .addGroupBy('ch.logo_url')
      .addGroupBy('ch.background_color')
      .orderBy('SUM(u.count)', 'DESC')
      .addOrderBy('prog.name', 'ASC')
      .limit(TOP_PROGRAMS)
      .getRawMany();

    return rows.map((row, index) => ({
      position: index + 1,
      program_id: Number(row.program_id),
      program_name: row.program_name,
      channel_id: row.channel_id === null ? null : Number(row.channel_id),
      channel_name: row.channel_name,
      channel_logo_url: row.channel_logo_url,
      channel_background_color: row.channel_background_color,
      plays: Number(row.plays),
    }));
  }

  private async topChannels(
    userId: number,
    from: string,
    to: string,
  ): Promise<RecapChannel[]> {
    const rows = await this.dailyUserRepository
      .createQueryBuilder('u')
      .select('u.channel_id', 'channel_id')
      .addSelect('ch.name', 'channel_name')
      .addSelect('ch.logo_url', 'channel_logo_url')
      .addSelect('ch.background_color', 'channel_background_color')
      .addSelect('SUM(u.count)', 'plays')
      .innerJoin('channel', 'ch', 'ch.id = u.channel_id')
      .where('u.user_id = :userId', { userId })
      .andWhere('u.date BETWEEN :from AND :to', { from, to })
      .andWhere('u.event_name = :metric', { metric: DEFAULT_METRIC })
      .groupBy('u.channel_id')
      .addGroupBy('ch.name')
      .addGroupBy('ch.logo_url')
      .addGroupBy('ch.background_color')
      .orderBy('SUM(u.count)', 'DESC')
      .addOrderBy('ch.name', 'ASC')
      .limit(TOP_CHANNELS)
      .getRawMany();

    return rows.map((row, index) => ({
      position: index + 1,
      channel_id: Number(row.channel_id),
      channel_name: row.channel_name,
      channel_logo_url: row.channel_logo_url,
      channel_background_color: row.channel_background_color,
      plays: Number(row.plays),
    }));
  }

  /**
   * Reads the streamer rollup, not analytics_daily_user, and counts
   * streamer_service_click: opening a streamer is a play like any other, but it
   * is a different event name than a program's.
   */
  private async topStreamers(
    userId: number,
    from: string,
    to: string,
  ): Promise<RecapStreamer[]> {
    const rows = await this.dailyUserStreamerRepository
      .createQueryBuilder('s')
      .select('s.streamer_id', 'streamer_id')
      .addSelect('st.name', 'streamer_name')
      .addSelect('st.logo_url', 'streamer_logo_url')
      .addSelect('SUM(s.count)', 'plays')
      .innerJoin('streamer', 'st', 'st.id = s.streamer_id')
      .where('s.user_id = :userId', { userId })
      .andWhere('s.date BETWEEN :from AND :to', { from, to })
      .andWhere('s.event_name = :metric', { metric: DEFAULT_STREAMER_METRIC })
      .groupBy('s.streamer_id')
      .addGroupBy('st.name')
      .addGroupBy('st.logo_url')
      .orderBy('SUM(s.count)', 'DESC')
      .addOrderBy('st.name', 'ASC')
      .limit(TOP_STREAMERS)
      .getRawMany();

    return rows.map((row, index) => ({
      position: index + 1,
      streamer_id: Number(row.streamer_id),
      streamer_name: row.streamer_name,
      streamer_logo_url: row.streamer_logo_url,
      plays: Number(row.plays),
    }));
  }

  /**
   * The three grids the placas draw. One query feeds the whole-period grid and
   * the one for the top programme; a second feeds the streamer's, which colours
   * by platform instead of channel.
   */
  private async buildGrids(
    userId: number,
    period: RecapPeriod,
    from: string,
    to: string,
    topProgramId: number | null,
    topStreamerId: number | null,
  ): Promise<RecapGrids> {
    const shape: RecapGridShape =
      period === RecapPeriod.WEEK ? 'week' : 'month';

    const [programRows, streamerRows] = await Promise.all([
      this.programSlots(userId, from, to),
      topStreamerId === null
        ? Promise.resolve([])
        : this.streamerSlots(userId, from, to, topStreamerId),
    ]);

    const build = (rows: SlotRow[]) =>
      shape === 'week'
        ? this.weekGrid(rows, from)
        : this.monthGrid(rows, from, to);

    return {
      total: build(programRows),
      program:
        topProgramId === null
          ? null
          : build(programRows.filter((r) => r.program_id === topProgramId)),
      streamer: streamerRows.length === 0 ? null : build(streamerRows),
    };
  }

  private async programSlots(
    userId: number,
    from: string,
    to: string,
  ): Promise<SlotRow[]> {
    const rows = await this.dailyUserSlotRepository
      .createQueryBuilder('s')
      // As text, not as a date: node-postgres would parse it in the server's
      // timezone, and toISOString() on a machine east of UTC shifts the day back
      // by one. The grid would then put a play on the wrong square.
      .select('s.date::text', 'date')
      .addSelect('s.hour', 'hour')
      .addSelect('s.program_id', 'program_id')
      .addSelect('s.channel_id', 'key_id')
      .addSelect('ch.name', 'key_name')
      .addSelect('SUM(s.count)', 'plays')
      .innerJoin('channel', 'ch', 'ch.id = s.channel_id')
      .where('s.user_id = :userId', { userId })
      .andWhere('s.date BETWEEN :from AND :to', { from, to })
      .andWhere('s.event_name = :metric', { metric: DEFAULT_METRIC })
      .groupBy('s.date')
      .addGroupBy('s.hour')
      .addGroupBy('s.program_id')
      .addGroupBy('s.channel_id')
      .addGroupBy('ch.name')
      .getRawMany();

    return rows.map((row) => ({
      date: row.date as string,
      hour: Number(row.hour),
      program_id: Number(row.program_id),
      key_id: Number(row.key_id),
      key_name: row.key_name as string,
      platform: null,
      plays: Number(row.plays),
    }));
  }

  /**
   * A streamer's grid is coloured by platform, which the rollup does not store:
   * it takes the streamer's first configured service. Someone who streams on
   * both Twitch and Kick is drawn in one of them rather than per play.
   */
  private async streamerSlots(
    userId: number,
    from: string,
    to: string,
    streamerId: number,
  ): Promise<SlotRow[]> {
    const rows = await this.dailyUserStreamerRepository
      .createQueryBuilder('s')
      // As text, not as a date: node-postgres would parse it in the server's
      // timezone, and toISOString() on a machine east of UTC shifts the day back
      // by one. The grid would then put a play on the wrong square.
      .select('s.date::text', 'date')
      .addSelect('s.hour', 'hour')
      // Aggregated rather than grouped: `services` is a json column and Postgres
      // has no equality operator for it, so grouping by it fails outright. The
      // streamer is already pinned by the WHERE, so every row carries the same
      // name and services and taking any one of them is exact.
      .addSelect('MAX(st.name)', 'key_name')
      .addSelect('MAX(st.services::text)', 'services')
      .addSelect('SUM(s.count)', 'plays')
      .innerJoin('streamer', 'st', 'st.id = s.streamer_id')
      .where('s.user_id = :userId', { userId })
      .andWhere('s.date BETWEEN :from AND :to', { from, to })
      .andWhere('s.streamer_id = :streamerId', { streamerId })
      .andWhere('s.event_name = :metric', { metric: DEFAULT_STREAMER_METRIC })
      .groupBy('s.date')
      .addGroupBy('s.hour')
      .getRawMany();

    return rows.map((row) => ({
      date: row.date as string,
      hour: Number(row.hour),
      program_id: null,
      key_id: streamerId,
      key_name: row.key_name as string,
      platform: this.firstService(row.services),
      plays: Number(row.plays),
    }));
  }

  private firstService(services: unknown): string | null {
    const list =
      typeof services === 'string'
        ? (JSON.parse(services) as Array<{ service?: string }>)
        : (services as Array<{ service?: string }> | null);
    return list?.[0]?.service ?? null;
  }

  /** 0 for the morning, 1 for the afternoon, 2 for the night and the small hours. */
  private daypartIndex(hour: number): number {
    const found = DAYPARTS.findIndex((p) => hour >= p.from && hour < p.to);
    return found === -1 ? DAYPARTS.length - 1 : found;
  }

  /** Monday 0 … Sunday 6. */
  private weekdayIndex(date: string): number {
    return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  }

  private weekGrid(rows: SlotRow[], from: string): RecapGrid {
    const buckets = new Map<string, Map<string, number>>();
    const start = new Date(`${from}T12:00:00Z`);

    for (const row of rows) {
      const key = `${this.daypartIndex(row.hour)}:${this.weekdayIndex(row.date)}`;
      const byKey = buckets.get(key) ?? new Map<string, number>();
      const id = `${row.key_id}|${row.key_name}|${row.platform ?? ''}`;
      byKey.set(id, (byKey.get(id) ?? 0) + row.plays);
      buckets.set(key, byKey);
    }

    const gridRows: RecapGridRow[] = DAYPARTS.map((part, partIndex) => ({
      label: part.label,
      cells: Array.from({ length: 7 }, (_, day) => {
        const date = new Date(start);
        date.setUTCDate(date.getUTCDate() + day);
        return this.cell(this.iso(date), buckets.get(`${partIndex}:${day}`));
      }),
    }));

    return this.finish('week', gridRows, rows);
  }

  private monthGrid(rows: SlotRow[], from: string, to: string): RecapGrid {
    const byDate = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const byKey = byDate.get(row.date) ?? new Map<string, number>();
      const id = `${row.key_id}|${row.key_name}|${row.platform ?? ''}`;
      byKey.set(id, (byKey.get(id) ?? 0) + row.plays);
      byDate.set(row.date, byKey);
    }

    const first = new Date(`${from}T12:00:00Z`);
    const last = new Date(`${to}T12:00:00Z`);
    const lead = this.weekdayIndex(from);
    const days = Math.round((last.getTime() - first.getTime()) / 86400000) + 1;

    const gridRows: RecapGridRow[] = [];
    let cells: RecapGridCell[] = [];
    // The month rarely starts on a Monday; the cells before it stay empty so the
    // columns still line up under the day letters.
    for (let i = 0; i < lead; i++) cells.push(this.blankCell());

    for (let day = 0; day < days; day++) {
      const date = new Date(first);
      date.setUTCDate(date.getUTCDate() + day);
      const iso = this.iso(date);
      cells.push(this.cell(iso, byDate.get(iso)));
      if (cells.length === 7) {
        gridRows.push({ label: `Semana ${gridRows.length + 1}`, cells });
        cells = [];
      }
    }
    if (cells.length > 0) {
      while (cells.length < 7) cells.push(this.blankCell());
      gridRows.push({ label: `Semana ${gridRows.length + 1}`, cells });
    }

    return this.finish('month', gridRows, rows);
  }

  private emptyGrid(period: RecapPeriod): RecapGrid {
    return {
      shape: period === RecapPeriod.WEEK ? 'week' : 'month',
      day_labels: DAY_LABELS,
      rows: [],
      peak_label: null,
    };
  }

  private blankCell(): RecapGridCell {
    return {
      date: null,
      plays: 0,
      channel_id: null,
      channel_name: null,
      platform: null,
      peak: false,
    };
  }

  /** Whichever key holds most of the cell wins its colour; ties break by name. */
  private cell(
    date: string,
    byKey: Map<string, number> | undefined,
  ): RecapGridCell {
    if (!byKey || byKey.size === 0) {
      return { ...this.blankCell(), date };
    }

    let bestKey = '';
    let bestPlays = -1;
    let plays = 0;
    for (const [key, value] of byKey) {
      plays += value;
      const better =
        value > bestPlays || (value === bestPlays && key < bestKey);
      if (better) {
        bestKey = key;
        bestPlays = value;
      }
    }

    const [id, name, platform] = bestKey.split('|');
    return {
      date,
      plays,
      channel_id: platform === '' ? Number(id) : null,
      channel_name: platform === '' ? name : null,
      platform: platform === '' ? null : platform,
      peak: false,
    };
  }

  /** Marks the busiest cell and writes the sentence that goes under the grid. */
  private finish(
    shape: RecapGridShape,
    rows: RecapGridRow[],
    slots: SlotRow[],
  ): RecapGrid {
    let peak: RecapGridCell | null = null;
    for (const row of rows) {
      for (const cell of row.cells) {
        if (cell.plays > 0 && (peak === null || cell.plays > peak.plays)) {
          peak = cell;
        }
      }
    }
    if (peak) peak.peak = true;

    return {
      shape,
      day_labels: DAY_LABELS,
      rows,
      peak_label: this.peakLabel(slots),
    };
  }

  /**
   * The weekday and day part with the most plays, as a phrase. Computed from the
   * slots rather than from the grid so a month — whose cells are whole days —
   * still names a day part.
   */
  private peakLabel(slots: SlotRow[]): string | null {
    if (slots.length === 0) return null;

    const totals = new Map<string, number>();
    for (const slot of slots) {
      const key = `${this.weekdayIndex(slot.date)}:${this.daypartIndex(slot.hour)}`;
      totals.set(key, (totals.get(key) ?? 0) + slot.plays);
    }

    let bestKey: string | null = null;
    let best = -1;
    for (const [key, plays] of totals) {
      if (plays > best) {
        best = plays;
        bestKey = key;
      }
    }
    if (bestKey === null) return null;

    const [weekday, part] = bestKey.split(':').map(Number);
    const day = WEEKDAY_PLURAL[weekday];
    const daypart = DAYPARTS[part].label.toLowerCase();
    return `los ${day} a la ${daypart}`;
  }

  private async totals(
    userId: number,
    from: string,
    to: string,
  ): Promise<{
    plays: number;
    distinct_programs: number;
    distinct_channels: number;
  }> {
    const row = await this.dailyUserRepository
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.count), 0)', 'plays')
      .addSelect('COUNT(DISTINCT u.program_id)', 'distinct_programs')
      .addSelect('COUNT(DISTINCT u.channel_id)', 'distinct_channels')
      .where('u.user_id = :userId', { userId })
      .andWhere('u.date BETWEEN :from AND :to', { from, to })
      .andWhere('u.event_name = :metric', { metric: DEFAULT_METRIC })
      .getRawOne<{
        plays: string;
        distinct_programs: string;
        distinct_channels: string;
      }>();

    return {
      plays: Number(row?.plays ?? 0),
      distinct_programs: Number(row?.distinct_programs ?? 0),
      distinct_channels: Number(row?.distinct_channels ?? 0),
    };
  }

  private async playCount(
    userId: number,
    from: string,
    to: string,
  ): Promise<number> {
    const row = await this.dailyUserRepository
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.count), 0)', 'plays')
      .where('u.user_id = :userId', { userId })
      .andWhere('u.date BETWEEN :from AND :to', { from, to })
      .andWhere('u.event_name = :metric', { metric: DEFAULT_METRIC })
      .getRawOne<{ plays: string }>();

    return Number(row?.plays ?? 0);
  }

  private async favoriteWeekday(
    userId: number,
    from: string,
    to: string,
  ): Promise<string | null> {
    const row = await this.dailyUserRepository
      .createQueryBuilder('u')
      .select('EXTRACT(DOW FROM u.date)', 'dow')
      .addSelect('SUM(u.count)', 'plays')
      .where('u.user_id = :userId', { userId })
      .andWhere('u.date BETWEEN :from AND :to', { from, to })
      .andWhere('u.event_name = :metric', { metric: DEFAULT_METRIC })
      .groupBy('1')
      .orderBy('SUM(u.count)', 'DESC')
      .limit(1)
      .getRawOne<{ dow: string; plays: string }>();

    if (!row) return null;
    return WEEKDAY_LABELS[Number(row.dow)] ?? null;
  }

  /**
   * Resolve the period containing `date` (default today). Weeks run Monday to
   * Sunday, matching how the schedule grid already presents a week.
   */
  private resolveRange(
    period: RecapPeriod,
    date?: string,
  ): { from: string; to: string; label: string } {
    const anchor = date ? new Date(`${date}T12:00:00Z`) : new Date();

    if (period === RecapPeriod.YEAR) {
      const year = anchor.getUTCFullYear();
      return {
        from: `${year}-01-01`,
        to: `${year}-12-31`,
        label: `${year}`,
      };
    }

    if (period === RecapPeriod.MONTH) {
      const year = anchor.getUTCFullYear();
      const month = anchor.getUTCMonth();
      const start = new Date(Date.UTC(year, month, 1));
      const end = new Date(Date.UTC(year, month + 1, 0));
      return {
        from: this.iso(start),
        to: this.iso(end),
        label: start.toLocaleDateString('es-AR', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }),
      };
    }

    // Monday-anchored week: getUTCDay() is 0 for Sunday, which must map to 6.
    const dow = anchor.getUTCDay();
    const daysSinceMonday = (dow + 6) % 7;
    const start = new Date(anchor);
    start.setUTCDate(start.getUTCDate() - daysSinceMonday);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);

    return {
      from: this.iso(start),
      to: this.iso(end),
      label: this.weekLabel(start, end),
    };
  }

  /**
   * "Semana del 1 al 7 de septiembre", but "Semana del 31 de agosto al 6 de
   * septiembre" when the week straddles two months — naming only the end month
   * would misdate the first half, and this string is shown on a card people share.
   */
  private weekLabel(start: Date, end: Date): string {
    const month = (date: Date) =>
      date.toLocaleDateString('es-AR', { month: 'long', timeZone: 'UTC' });

    if (start.getUTCMonth() === end.getUTCMonth()) {
      return `Semana del ${start.getUTCDate()} al ${end.getUTCDate()} de ${month(end)}`;
    }

    return `Semana del ${start.getUTCDate()} de ${month(start)} al ${end.getUTCDate()} de ${month(end)}`;
  }

  private previousRangeTuple(from: string, to: string): [string, string] {
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    const days =
      Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    const previousEnd = new Date(start);
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setUTCDate(previousStart.getUTCDate() - (days - 1));

    return [this.iso(previousStart), this.iso(previousEnd)];
  }

  /**
   * A closed period never changes, so cache it for a day. An in-progress one is
   * still accumulating and gets a short TTL so the user sees it move.
   */
  private cacheTtl(to: string): number {
    const periodEnded = new Date(`${to}T23:59:59Z`).getTime() < Date.now();
    return periodEnded ? 86400 : 900;
  }

  private iso(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
