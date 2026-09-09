import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AnalyticsEvent,
  AnalyticsPlatform,
} from '../entities/analytics-event.entity';
import { Program } from '../../programs/programs.entity';
import { Channel } from '../../channels/channels.entity';
import { Streamer } from '../../streamers/streamers.entity';
import { RedisService } from '../../redis/redis.service';
import { SentryService } from '../../sentry/sentry.service';
import { IngestEventsDto } from '../dto/ingest-events.dto';

/** Redis list that buffers events between flushes. */
const BUFFER_KEY = 'analytics:buffer';
/** Ceiling on how many buffered events one flush drains, to bound the INSERT. */
const FLUSH_BATCH_SIZE = 500;
/** Per-device write budget, enforced over RATE_LIMIT_WINDOW_S. */
const RATE_LIMIT_MAX_EVENTS = 600;
const RATE_LIMIT_WINDOW_S = 60;
/** Name->id lookup cache for clients that still send names instead of ids. */
const NAME_MAP_TTL_S = 300;

interface BufferedEvent {
  event_name: string;
  occurred_at: string;
  platform: AnalyticsPlatform;
  app_version: string | null;
  user_id: number | null;
  device_id: string | null;
  session_id: string | null;
  program_id: number | null;
  channel_id: number | null;
  streamer_id: number | null;
  program_name: string | null;
  channel_name: string | null;
  streamer_name: string | null;
  user_gender: string | null;
  user_age_group: string | null;
  properties: Record<string, any>;
}

export interface IngestResult {
  accepted: number;
  dropped: number;
}

/**
 * Accepts event batches from the web and mobile clients and lands them in
 * analytics_event.
 *
 * Writes go through a Redis list rather than straight to Postgres: a click on a
 * program is a single row, and at peak the grid produces bursts of them. Buffering
 * turns hundreds of tiny INSERTs into one multi-row INSERT per minute, which
 * matters because the connection pool is shared with the request path (35 max,
 * see app.module.ts) and analytics must never be the reason a page fails to load.
 *
 * Every failure mode here is deliberately silent to the caller — the controller
 * answers 202 regardless. Losing an analytics event is acceptable; making the
 * product slower or flakier to record one is not.
 */
@Injectable()
export class AnalyticsIngestService {
  private readonly logger = new Logger(AnalyticsIngestService.name);

  constructor(
    @InjectRepository(AnalyticsEvent)
    private readonly eventRepository: Repository<AnalyticsEvent>,
    @InjectRepository(Program)
    private readonly programRepository: Repository<Program>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(Streamer)
    private readonly streamerRepository: Repository<Streamer>,
    private readonly redisService: RedisService,
    private readonly sentryService: SentryService,
  ) {}

  /**
   * Buffer a validated batch. `userId` comes from the JWT when present — never
   * from the payload, so a caller cannot attribute events to someone else.
   */
  async ingest(
    dto: IngestEventsDto,
    userId: number | null,
    userRole: string | null,
  ): Promise<IngestResult> {
    // Admins are excluded from every other analytics sink already (see the
    // clients' gtag.ts / analytics.ts); mirroring it here means an admin who
    // clears their local state still cannot skew the numbers.
    const role = userRole ?? dto.user_role ?? null;
    if (role === 'admin') {
      return { accepted: 0, dropped: dto.events.length };
    }

    if (dto.device_id && !(await this.withinRateLimit(dto.device_id))) {
      this.logger.warn(`Rate limit exceeded for device ${dto.device_id}`);
      return { accepted: 0, dropped: dto.events.length };
    }

    const now = Date.now();
    const buffered: BufferedEvent[] = [];

    for (const event of dto.events) {
      const occurredAt = this.normaliseTimestamp(event.ts, now);
      if (!occurredAt) continue;

      buffered.push({
        event_name: event.name,
        occurred_at: occurredAt,
        platform: dto.platform,
        app_version: dto.app_version ?? null,
        user_id: userId,
        device_id: dto.device_id ?? null,
        session_id: dto.session_id ?? null,
        program_id: event.program_id ?? null,
        channel_id: event.channel_id ?? null,
        streamer_id: event.streamer_id ?? null,
        program_name: event.program_name ?? null,
        channel_name: event.channel_name ?? null,
        streamer_name: event.streamer_name ?? null,
        user_gender: dto.user_gender ?? null,
        user_age_group: dto.user_age_group ?? null,
        properties: event.properties ?? {},
      });
    }

    if (buffered.length === 0) {
      return { accepted: 0, dropped: dto.events.length };
    }

    try {
      await this.redisService.client.rpush(
        BUFFER_KEY,
        ...buffered.map((e) => JSON.stringify(e)),
      );
    } catch (error) {
      // Redis down: fall back to writing straight through. Slower, but a Redis
      // outage shouldn't mean a silent hole in the history.
      this.logger.warn(
        `Redis buffer unavailable, writing through: ${(error as Error).message}`,
      );
      await this.persist(buffered);
    }

    return {
      accepted: buffered.length,
      dropped: dto.events.length - buffered.length,
    };
  }

  /**
   * Reject timestamps that can't be real. Clients send their own clock, and a
   * device set to 2031 would otherwise create rollup rows in the future that
   * the nightly job never revisits.
   */
  private normaliseTimestamp(ts: string, now: number): string | null {
    const parsed = Date.parse(ts);
    if (Number.isNaN(parsed)) return null;

    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const FIVE_MINUTES_MS = 5 * 60 * 1000;
    if (parsed < now - THIRTY_DAYS_MS) return null;
    // Small forward skew is normal; clamp instead of dropping.
    if (parsed > now + FIVE_MINUTES_MS) return new Date(now).toISOString();

    return new Date(parsed).toISOString();
  }

  private async withinRateLimit(deviceId: string): Promise<boolean> {
    const key = `analytics:rate:${deviceId}`;
    try {
      const count = await this.redisService.incr(key);
      if (count === 1) {
        await this.redisService.client.expire(key, RATE_LIMIT_WINDOW_S);
      }
      return count <= RATE_LIMIT_MAX_EVENTS;
    } catch {
      // Can't check the budget — let the event through rather than lose data.
      return true;
    }
  }

  /**
   * Drain the buffer into Postgres. Runs every minute; the ceiling of
   * FLUSH_BATCH_SIZE per tick keeps a backlog from turning into one giant
   * statement, and the loop keeps draining while there is more to take.
   */
  @Cron(CronExpression.EVERY_MINUTE, { name: 'analytics-flush' })
  async flush(): Promise<number> {
    let total = 0;

    try {
      for (;;) {
        const raw = await this.redisService.client.lpop(
          BUFFER_KEY,
          FLUSH_BATCH_SIZE,
        );
        if (!raw || raw.length === 0) break;

        const events: BufferedEvent[] = [];
        for (const item of raw) {
          try {
            events.push(JSON.parse(item) as BufferedEvent);
          } catch {
            this.logger.warn('Skipping unparseable buffered event');
          }
        }

        await this.persist(events);
        total += events.length;

        if (raw.length < FLUSH_BATCH_SIZE) break;
      }
    } catch (error) {
      this.logger.error(`Flush failed: ${(error as Error).message}`);
      this.sentryService.captureMessage(
        'Analytics buffer flush failed',
        'error',
        {
          service: 'analytics',
          error_type: 'flush_failed',
          error_message: (error as Error).message,
        },
      );
    }

    if (total > 0) {
      this.logger.debug(`Flushed ${total} analytics events`);
    }
    return total;
  }

  private async persist(events: BufferedEvent[]): Promise<void> {
    if (events.length === 0) return;

    const { programs, channels, streamers } =
      await this.resolveNameMaps(events);

    const rows = events.map((e) => {
      // Prefer ids; fall back to name resolution for older clients. A name that
      // no longer matches anything still gets stored, just unattributed — the
      // raw properties keep enough to reconcile later if needed.
      const programId =
        e.program_id ??
        (e.program_name
          ? (programs.get(e.program_name.toLowerCase()) ?? null)
          : null);
      const channelId =
        e.channel_id ??
        (e.channel_name
          ? (channels.get(e.channel_name.toLowerCase()) ?? null)
          : null);
      const streamerId =
        e.streamer_id ??
        (e.streamer_name
          ? (streamers.get(e.streamer_name.toLowerCase()) ?? null)
          : null);

      return {
        event_name: e.event_name,
        occurred_at: new Date(e.occurred_at),
        platform: e.platform,
        app_version: e.app_version,
        user_id: e.user_id,
        device_id: e.device_id,
        session_id: e.session_id,
        program_id: programId,
        channel_id: channelId,
        streamer_id: streamerId,
        user_gender: e.user_gender,
        user_age_group: e.user_age_group,
        properties: e.properties,
      };
    });

    await this.eventRepository
      .createQueryBuilder()
      .insert()
      .into(AnalyticsEvent)
      .values(rows)
      .updateEntity(false)
      .execute();
  }

  /**
   * Build lowercase name->id maps for the batch, cached in Redis. Only queries
   * the tables when the cache is cold, so the common path costs one MGET.
   */
  private async resolveNameMaps(events: BufferedEvent[]): Promise<{
    programs: Map<string, number>;
    channels: Map<string, number>;
    streamers: Map<string, number>;
  }> {
    const needsPrograms = events.some((e) => !e.program_id && e.program_name);
    const needsChannels = events.some((e) => !e.channel_id && e.channel_name);
    const needsStreamers = events.some(
      (e) => !e.streamer_id && e.streamer_name,
    );

    const programs = needsPrograms
      ? await this.nameMap('analytics:namemap:programs', () =>
          this.programRepository.find({ select: ['id', 'name'] }),
        )
      : new Map<string, number>();

    const channels = needsChannels
      ? await this.nameMap('analytics:namemap:channels', () =>
          this.channelRepository.find({ select: ['id', 'name'] }),
        )
      : new Map<string, number>();

    const streamers = needsStreamers
      ? await this.nameMap('analytics:namemap:streamers', () =>
          this.streamerRepository.find({ select: ['id', 'name'] }),
        )
      : new Map<string, number>();

    return { programs, channels, streamers };
  }

  private async nameMap(
    cacheKey: string,
    load: () => Promise<Array<{ id: number; name: string }>>,
  ): Promise<Map<string, number>> {
    try {
      const cached =
        await this.redisService.get<Record<string, number>>(cacheKey);
      if (cached) return new Map(Object.entries(cached));
    } catch {
      // Cache miss by way of an outage — fall through to the query.
    }

    const rows = await load();
    const entries: Record<string, number> = {};
    for (const row of rows) {
      if (row.name) entries[row.name.toLowerCase()] = row.id;
    }

    try {
      await this.redisService.set(cacheKey, entries, NAME_MAP_TTL_S);
    } catch {
      // Non-fatal: the map is still correct for this batch.
    }

    return new Map(Object.entries(entries));
  }
}
