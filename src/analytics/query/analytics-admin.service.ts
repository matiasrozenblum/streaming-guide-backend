import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsDailyTotals } from '../entities/analytics-daily-totals.entity';
import { AnalyticsDailyProgram } from '../entities/analytics-daily-program.entity';
import { Granularity } from '../dto/analytics-query.dto';

/**
 * The event that means "someone opened a live stream". It is what the public
 * top-10 ranking counts, so it is the default metric everywhere.
 */
export const DEFAULT_METRIC = 'click_youtube_live';

export interface OverviewTile {
  metric: string;
  value: number;
  previous: number;
  delta_pct: number | null;
}

export interface TrendPoint {
  bucket: string;
  count: number;
  unique_users: number;
  unique_devices: number;
}

export interface RankingRow {
  position: number;
  program_id?: number;
  program_name?: string;
  channel_id: number | null;
  channel_name: string | null;
  channel_logo_url: string | null;
  channel_background_color: string | null;
  value: number;
  unique_users: number;
  previous_position: number | null;
}

@Injectable()
export class AnalyticsAdminService {
  constructor(
    @InjectRepository(AnalyticsDailyTotals)
    private readonly totalsRepository: Repository<AnalyticsDailyTotals>,
    @InjectRepository(AnalyticsDailyProgram)
    private readonly programRepository: Repository<AnalyticsDailyProgram>,
  ) {}

  /**
   * Headline numbers for the range, each paired with the same-length window
   * immediately before it so the UI can show a delta without a second call.
   */
  async getOverview(
    from: string,
    to: string,
    platform?: string,
  ): Promise<{
    from: string;
    to: string;
    previous_from: string;
    previous_to: string;
    tiles: OverviewTile[];
  }> {
    const previous = this.previousRange(from, to);

    const [current, prior] = await Promise.all([
      this.totalsFor(from, to, platform),
      this.totalsFor(previous.from, previous.to, platform),
    ]);

    const metrics = new Set([...current.keys(), ...prior.keys()]);
    const tiles: OverviewTile[] = [...metrics]
      .map((metric) => {
        const value = current.get(metric) ?? 0;
        const previousValue = prior.get(metric) ?? 0;
        return {
          metric,
          value,
          previous: previousValue,
          // A delta against zero is undefined, not "+100%" — the UI shows "nuevo".
          delta_pct:
            previousValue === 0
              ? null
              : Math.round(((value - previousValue) / previousValue) * 1000) /
                10,
        };
      })
      .sort((a, b) => b.value - a.value);

    return {
      from,
      to,
      previous_from: previous.from,
      previous_to: previous.to,
      tiles,
    };
  }

  private async totalsFor(
    from: string,
    to: string,
    platform?: string,
  ): Promise<Map<string, number>> {
    const query = this.totalsRepository
      .createQueryBuilder('t')
      .select('t.event_name', 'event_name')
      .addSelect('SUM(t.count)', 'count')
      .where('t.date BETWEEN :from AND :to', { from, to })
      .groupBy('t.event_name');

    if (platform) {
      query.andWhere('t.platform = :platform', { platform });
    }

    const rows = await query.getRawMany<{
      event_name: string;
      count: string;
    }>();
    return new Map(rows.map((r) => [r.event_name, Number(r.count)]));
  }

  /** Time series for one metric, bucketed by day, week or month. */
  async getTrends(
    from: string,
    to: string,
    metric: string = DEFAULT_METRIC,
    granularity: Granularity = Granularity.DAY,
    platform?: string,
  ): Promise<{
    metric: string;
    granularity: Granularity;
    points: TrendPoint[];
  }> {
    const bucket = this.bucketExpression(granularity, 't.date');

    const query = this.totalsRepository
      .createQueryBuilder('t')
      .select(bucket, 'bucket')
      .addSelect('SUM(t.count)', 'count')
      // Uniques are per platform-row, so summing them across platforms
      // double-counts anyone who used both. Treated as an upper bound; the
      // exact figure would need the raw events, which age out at 90 days.
      .addSelect('SUM(t.unique_users)', 'unique_users')
      .addSelect('SUM(t.unique_devices)', 'unique_devices')
      .where('t.date BETWEEN :from AND :to', { from, to })
      .andWhere('t.event_name = :metric', { metric })
      .groupBy('1')
      .orderBy('1', 'ASC');

    if (platform) {
      query.andWhere('t.platform = :platform', { platform });
    }

    const rows = await query.getRawMany<{
      bucket: string | Date;
      count: string;
      unique_users: string;
      unique_devices: string;
    }>();

    return {
      metric,
      granularity,
      points: rows.map((r) => ({
        bucket: this.toIsoDate(r.bucket),
        count: Number(r.count),
        unique_users: Number(r.unique_users),
        unique_devices: Number(r.unique_devices),
      })),
    };
  }

  /**
   * Top programs for the range, joined to their channel so callers get
   * everything the shareable ranking image needs in one response (logo and
   * brand colour included).
   *
   * `previous_position` compares against the equally-sized preceding window,
   * which is what makes the ranking readable as movement rather than a snapshot.
   */
  async getProgramRanking(
    from: string,
    to: string,
    metric: string = DEFAULT_METRIC,
    limit = 10,
    platform?: string,
  ): Promise<RankingRow[]> {
    const previous = this.previousRange(from, to);

    const [current, prior] = await Promise.all([
      this.rankPrograms(from, to, metric, limit, platform),
      // Pull a deeper prior list so a program that climbed from far down still
      // resolves to a real previous position instead of null.
      this.rankPrograms(
        previous.from,
        previous.to,
        metric,
        limit * 5,
        platform,
      ),
    ]);

    const priorPositions = new Map(
      prior.map((row, index) => [row.program_id, index + 1]),
    );

    return current.map((row, index) => ({
      position: index + 1,
      program_id: row.program_id,
      program_name: row.program_name,
      channel_id: row.channel_id,
      channel_name: row.channel_name,
      channel_logo_url: row.channel_logo_url,
      channel_background_color: row.channel_background_color,
      value: Number(row.value),
      unique_users: Number(row.unique_users),
      previous_position: priorPositions.get(row.program_id) ?? null,
    }));
  }

  private async rankPrograms(
    from: string,
    to: string,
    metric: string,
    limit: number,
    platform?: string,
  ) {
    // platform is not a column on the program rollup — the daily tables are
    // aggregated across platforms by design. Accepting and ignoring it here
    // keeps the query shape uniform; a platform-split ranking would need a
    // wider rollup key and is deliberately out of scope.
    void platform;

    const rows = await this.programRepository
      .createQueryBuilder('p')
      .select('p.program_id', 'program_id')
      .addSelect('prog.name', 'program_name')
      .addSelect('p.channel_id', 'channel_id')
      .addSelect('ch.name', 'channel_name')
      .addSelect('ch.logo_url', 'channel_logo_url')
      .addSelect('ch.background_color', 'channel_background_color')
      .addSelect('SUM(p.count)', 'value')
      .addSelect('SUM(p.unique_users)', 'unique_users')
      .innerJoin('program', 'prog', 'prog.id = p.program_id')
      .leftJoin('channel', 'ch', 'ch.id = p.channel_id')
      .where('p.date BETWEEN :from AND :to', { from, to })
      .andWhere('p.event_name = :metric', { metric })
      .groupBy('p.program_id')
      .addGroupBy('prog.name')
      .addGroupBy('p.channel_id')
      .addGroupBy('ch.name')
      .addGroupBy('ch.logo_url')
      .addGroupBy('ch.background_color')
      .orderBy('SUM(p.count)', 'DESC')
      .addOrderBy('prog.name', 'ASC')
      .limit(limit)
      .getRawMany();

    return rows as Array<{
      program_id: number;
      program_name: string;
      channel_id: number | null;
      channel_name: string | null;
      channel_logo_url: string | null;
      channel_background_color: string | null;
      value: string;
      unique_users: string;
    }>;
  }

  /** Top channels for the range, same movement semantics as the program ranking. */
  async getChannelRanking(
    from: string,
    to: string,
    metric: string = DEFAULT_METRIC,
    limit = 10,
  ): Promise<RankingRow[]> {
    const previous = this.previousRange(from, to);

    const [current, prior] = await Promise.all([
      this.rankChannels(from, to, metric, limit),
      this.rankChannels(previous.from, previous.to, metric, limit * 5),
    ]);

    const priorPositions = new Map(
      prior.map((row, index) => [row.channel_id, index + 1]),
    );

    return current.map((row, index) => ({
      position: index + 1,
      channel_id: row.channel_id,
      channel_name: row.channel_name,
      channel_logo_url: row.channel_logo_url,
      channel_background_color: row.channel_background_color,
      value: Number(row.value),
      unique_users: Number(row.unique_users),
      previous_position: priorPositions.get(row.channel_id) ?? null,
    }));
  }

  private async rankChannels(
    from: string,
    to: string,
    metric: string,
    limit: number,
  ) {
    const rows = await this.programRepository.manager
      .createQueryBuilder()
      .select('c.channel_id', 'channel_id')
      .addSelect('ch.name', 'channel_name')
      .addSelect('ch.logo_url', 'channel_logo_url')
      .addSelect('ch.background_color', 'channel_background_color')
      .addSelect('SUM(c.count)', 'value')
      .addSelect('SUM(c.unique_users)', 'unique_users')
      .from('analytics_daily_channel', 'c')
      .innerJoin('channel', 'ch', 'ch.id = c.channel_id')
      .where('c.date BETWEEN :from AND :to', { from, to })
      .andWhere('c.event_name = :metric', { metric })
      .groupBy('c.channel_id')
      .addGroupBy('ch.name')
      .addGroupBy('ch.logo_url')
      .addGroupBy('ch.background_color')
      .orderBy('SUM(c.count)', 'DESC')
      .addOrderBy('ch.name', 'ASC')
      .limit(limit)
      .getRawMany();

    return rows as Array<{
      channel_id: number;
      channel_name: string;
      channel_logo_url: string | null;
      channel_background_color: string | null;
      value: string;
      unique_users: string;
    }>;
  }

  /** Per-program time series, for the drill-down view. */
  async getProgramTrend(
    programId: number,
    from: string,
    to: string,
    metric: string = DEFAULT_METRIC,
    granularity: Granularity = Granularity.DAY,
  ): Promise<{ program_id: number; metric: string; points: TrendPoint[] }> {
    const bucket = this.bucketExpression(granularity, 'p.date');

    const rows = await this.programRepository
      .createQueryBuilder('p')
      .select(bucket, 'bucket')
      .addSelect('SUM(p.count)', 'count')
      .addSelect('SUM(p.unique_users)', 'unique_users')
      .addSelect('SUM(p.unique_devices)', 'unique_devices')
      .where('p.program_id = :programId', { programId })
      .andWhere('p.date BETWEEN :from AND :to', { from, to })
      .andWhere('p.event_name = :metric', { metric })
      .groupBy('1')
      .orderBy('1', 'ASC')
      .getRawMany<{
        bucket: string | Date;
        count: string;
        unique_users: string;
        unique_devices: string;
      }>();

    return {
      program_id: programId,
      metric,
      points: rows.map((r) => ({
        bucket: this.toIsoDate(r.bucket),
        count: Number(r.count),
        unique_users: Number(r.unique_users),
        unique_devices: Number(r.unique_devices),
      })),
    };
  }

  /**
   * Which event names actually have data, so the UI's metric picker offers real
   * options instead of a hardcoded list that drifts from the clients.
   */
  async getEventNames(): Promise<Array<{ event_name: string; total: number }>> {
    const rows = await this.totalsRepository
      .createQueryBuilder('t')
      .select('t.event_name', 'event_name')
      .addSelect('SUM(t.count)', 'total')
      .groupBy('t.event_name')
      .orderBy('SUM(t.count)', 'DESC')
      .getRawMany<{ event_name: string; total: string }>();

    return rows.map((r) => ({
      event_name: r.event_name,
      total: Number(r.total),
    }));
  }

  private bucketExpression(granularity: Granularity, column: string): string {
    // granularity is a validated enum, so interpolating it into date_trunc is
    // safe — it can only ever be one of the three literals below.
    switch (granularity) {
      case Granularity.WEEK:
        return `date_trunc('week', ${column})::date`;
      case Granularity.MONTH:
        return `date_trunc('month', ${column})::date`;
      default:
        return `${column}`;
    }
  }

  private toIsoDate(value: string | Date): string {
    return value instanceof Date
      ? value.toISOString().slice(0, 10)
      : String(value);
  }

  /**
   * The window of equal length ending the day before `from`. Comparing a week
   * to the week before it is the only comparison that reads honestly on a
   * dashboard where the user picks arbitrary ranges.
   */
  private previousRange(
    from: string,
    to: string,
  ): { from: string; to: string } {
    const start = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    const days =
      Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;

    const previousEnd = new Date(start);
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setUTCDate(previousStart.getUTCDate() - (days - 1));

    return {
      from: previousStart.toISOString().slice(0, 10),
      to: previousEnd.toISOString().slice(0, 10),
    };
  }
}
