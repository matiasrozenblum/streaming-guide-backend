import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalyticsDailyUser } from '../entities/analytics-daily-user.entity';
import { RedisService } from '../../redis/redis.service';
import { RecapPeriod } from '../dto/analytics-query.dto';
import { DEFAULT_METRIC } from './analytics-admin.service';

/** Below this, a recap is a sadder object than no recap. */
const MIN_PLAYS_FOR_RECAP = 3;
const TOP_PROGRAMS = 5;
const TOP_CHANNELS = 3;

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

export interface Recap {
  enough_data: boolean;
  period: { type: RecapPeriod; from: string; to: string; label: string };
  top_programs: RecapProgram[];
  top_channels: RecapChannel[];
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
    const [programs, channels, totals, weekday, previousPlays] =
      await Promise.all([
        this.topPrograms(userId, range.from, range.to),
        this.topChannels(userId, range.from, range.to),
        this.totals(userId, range.from, range.to),
        this.favoriteWeekday(userId, range.from, range.to),
        this.playCount(
          userId,
          ...this.previousRangeTuple(range.from, range.to),
        ),
      ]);

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
