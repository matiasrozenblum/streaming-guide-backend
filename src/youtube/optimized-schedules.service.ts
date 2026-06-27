import { Injectable, Logger } from '@nestjs/common';
import { SchedulesService } from '../schedules/schedules.service';
import { WeeklyOverridesService } from '../schedules/weekly-overrides.service';
import { RedisService } from '../redis/redis.service';
import { SimilarityUtil } from '../utils/similarity.util';
import { TimezoneUtil } from '../utils/timezone.util';

@Injectable()
export class OptimizedSchedulesService {
  private readonly logger = new Logger(OptimizedSchedulesService.name);

  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly weeklyOverridesService: WeeklyOverridesService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * V2: Get schedules with optimized live status using batched Redis reads.
   * Same business logic as v1 but uses MGET to batch all Redis operations
   * into ~4 round trips instead of ~150 sequential GETs.
   * Does NOT trigger async YouTube API fetches (background cron handles those).
   */
  async getSchedulesWithOptimizedLiveStatusV2(
    options: any = {},
  ): Promise<any[]> {
    const startTime = Date.now();

    // Get base schedules without live status
    const schedules = await this.schedulesService.findAll({
      ...options,
      liveStatus: false,
      applyOverrides: false,
    });
    this.logger.debug(
      `[OPTIMIZED-SCHEDULES-V2] Schedules fetched: ${schedules.length} (${Date.now() - startTime}ms)`,
    );

    // Apply weekly overrides
    let schedulesWithOverrides = schedules;
    if (options.applyOverrides !== false) {
      const weekStartDate =
        options.weekStart ||
        this.weeklyOverridesService.getWeekStartDate('current');
      schedulesWithOverrides =
        await this.weeklyOverridesService.applyWeeklyOverrides(
          schedules,
          weekStartDate,
        );
    }
    this.logger.debug(
      `[OPTIMIZED-SCHEDULES-V2] Overrides applied (${Date.now() - startTime}ms)`,
    );

    // If live status is requested, enrich using batched cache reads (fast)
    if (options.liveStatus) {
      const enrichedSchedules = await this.enrichWithCachedLiveStatusFast(
        schedulesWithOverrides,
      );
      this.logger.debug(
        `[OPTIMIZED-SCHEDULES-V2] TOTAL: ${Date.now() - startTime}ms`,
      );
      return enrichedSchedules;
    }

    this.logger.debug(
      `[OPTIMIZED-SCHEDULES-V2] TOTAL (no live status): ${Date.now() - startTime}ms`,
    );
    return schedulesWithOverrides;
  }

  /**
   * V2 fast enrichment: same business logic as enrichWithCachedLiveStatus
   * but batches all Redis operations via MGET (4 round trips instead of ~150).
   * Does not trigger async fetch — relies on background cron for live status updates.
   */
  private async enrichWithCachedLiveStatusFast(
    schedules: any[],
  ): Promise<any[]> {
    const batchStart = Date.now();

    // Build handle/channelId maps (same as v1)
    const channelIdToHandle = new Map<string, string>();
    const handles: string[] = [];
    for (const schedule of schedules) {
      const channelId = schedule.program.channel?.youtube_channel_id;
      const handle = schedule.program.channel?.handle;
      if (channelId && handle && !channelIdToHandle.has(channelId)) {
        channelIdToHandle.set(channelId, handle);
        handles.push(handle);
      }
    }

    // BATCH 1: MGET all liveStatusByHandle keys
    const liveStatusKeys = handles.map((h) => `liveStatusByHandle:${h}`);
    const liveStatusResults = await this.redisService.mget<any>(liveStatusKeys);

    const liveStatusMap = new Map<string, any>();
    for (let i = 0; i < handles.length; i++) {
      if (liveStatusResults[i]) {
        // Map by channelId for compatibility with enrichment logic
        const channelId = [...channelIdToHandle.entries()].find(
          ([, h]) => h === handles[i],
        )?.[0];
        if (channelId) {
          liveStatusMap.set(channelId, liveStatusResults[i]);
        }
      }
    }

    // BATCH 2: MGET all notFoundAttempts keys
    const attemptKeys = handles.map((h) => `notFoundAttempts:${h}`);
    const attemptResults = await this.redisService.mget<any>(attemptKeys);

    const attemptTrackingMap = new Map<string, any>();
    for (let i = 0; i < handles.length; i++) {
      if (attemptResults[i]) {
        attemptTrackingMap.set(handles[i], attemptResults[i]);
      }
    }

    // BATCH 3: MGET all fetch_enabled config keys
    const fetchEnabledKeys = handles.map(
      (h) => `config:fetch_enabled:youtube.fetch_enabled.${h}`,
    );
    const fetchEnabledResults =
      await this.redisService.mget<boolean>(fetchEnabledKeys);

    // Also get global fetch_enabled as fallback
    const globalFetchEnabled = await this.redisService.get<boolean>(
      'config:fetch_enabled:youtube.fetch_enabled',
    );

    const fetchEnabledMap = new Map<string, boolean>();
    for (let i = 0; i < handles.length; i++) {
      // Per-channel value takes priority, fallback to global, default true
      fetchEnabledMap.set(
        handles[i],
        fetchEnabledResults[i] ?? globalFetchEnabled ?? true,
      );
    }

    // BATCH 4: Holiday check (single GET, shared across all channels)
    const holidayCache = await this.redisService.get<{
      date: string;
      isHoliday: boolean;
    }>('config:holiday_status');
    const today = TimezoneUtil.currentDateString();
    const isHoliday =
      holidayCache && holidayCache.date === today
        ? holidayCache.isHoliday
        : false;

    // If it's a holiday, batch-get override keys
    const holidayOverrideMap = new Map<string, boolean>();
    if (isHoliday) {
      const overrideKeys = handles.map(
        (h) => `config:holiday_override:youtube.fetch_override_holiday.${h}`,
      );
      const overrideResults =
        await this.redisService.mget<boolean>(overrideKeys);
      for (let i = 0; i < handles.length; i++) {
        // Default to true (enabled on holidays) if no override configured
        holidayOverrideMap.set(handles[i], overrideResults[i] ?? true);
      }
    }

    // Build canFetchLive map from batch results (same logic as ConfigService.canFetchLive)
    const canFetchLiveMap = new Map<string, boolean>();
    for (const handle of handles) {
      const enabled = fetchEnabledMap.get(handle) ?? true;
      if (!enabled) {
        canFetchLiveMap.set(handle, false);
        continue;
      }
      if (!isHoliday) {
        canFetchLiveMap.set(handle, true);
        continue;
      }
      // Holiday: check override
      canFetchLiveMap.set(handle, holidayOverrideMap.get(handle) ?? true);
    }

    this.logger.debug(
      `[OPTIMIZED-SCHEDULES-V2] Batch Redis reads done (${Date.now() - batchStart}ms) - ${handles.length} channels`,
    );

    // Enrich schedules — same decision logic as v1 but without async fetch triggers
    const enriched: any[] = [];
    const currentDay = TimezoneUtil.currentDayOfWeek();
    const previousDay = TimezoneUtil.previousDayOfWeek();
    const currentTime = TimezoneUtil.currentTimeInMinutes();

    for (const schedule of schedules) {
      const enrichedSchedule = { ...schedule };
      const channelId = schedule.program.channel?.youtube_channel_id;
      const handle = schedule.program.channel?.handle;
      const isChannelVisible = schedule.program.channel?.is_visible !== false;
      const isProgramVisible = schedule.program?.is_visible !== false;

      // Hard guard: not visible → not live
      if (!isChannelVisible || !isProgramVisible) {
        enrichedSchedule.program = {
          ...schedule.program,
          is_live: false,
          stream_url:
            schedule.program.stream_url || schedule.program.youtube_url,
          live_streams: [],
          stream_count: 0,
        };
        enriched.push(enrichedSchedule);
        continue;
      }

      const attemptTracking = handle ? attemptTrackingMap.get(handle) : null;
      const isEscalated = attemptTracking?.escalated === true;
      const canFetchLive = handle
        ? (canFetchLiveMap.get(handle) ?? true)
        : true;

      const startNum = this.convertTimeToNumber(schedule.start_time);
      const endNum = this.convertTimeToNumber(schedule.end_time);
      const isCurrentlyLive =
        (schedule.day_of_week === currentDay &&
          TimezoneUtil.isTimeInRange(startNum, endNum, currentTime)) ||
        (endNum < startNum &&
          schedule.day_of_week === previousDay &&
          currentTime < endNum);

      if (channelId && liveStatusMap.has(channelId)) {
        const liveStatus = liveStatusMap.get(channelId)!;

        if (isEscalated && isCurrentlyLive) {
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: false,
            stream_url:
              schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: [],
            stream_count: 0,
          };
        } else if (isCurrentlyLive && liveStatus.isLive && canFetchLive) {
          const streamUrl = this.getBestStreamUrl(
            schedule.program.name,
            liveStatus.streams || [],
            liveStatus.streamUrl,
          );
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: true,
            stream_url:
              streamUrl ||
              schedule.program.stream_url ||
              schedule.program.youtube_url,
            live_streams: liveStatus.streams || [],
            stream_count: liveStatus.streamCount || 0,
          };
        } else if (isCurrentlyLive && !canFetchLive) {
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: false,
            stream_url:
              schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: [],
            stream_count: 0,
          };
        } else if (isCurrentlyLive) {
          // Program is in its scheduled time but cache says no live stream.
          // Match V1 behavior: mark as live (optimistic) — background cron will update.
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: true,
            stream_url:
              schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: [],
            stream_count: 0,
          };
        } else {
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: false,
            stream_url:
              schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: [],
            stream_count: 0,
          };
        }
      } else {
        // No live status cache — use time-based logic without triggering fetches
        if (isEscalated && isCurrentlyLive) {
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: false,
            stream_url:
              schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: [],
            stream_count: 0,
          };
        } else {
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: isCurrentlyLive && canFetchLive && !isEscalated,
            stream_url:
              schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: [],
            stream_count: 0,
          };
        }
      }

      enriched.push(enrichedSchedule);
    }

    return enriched;
  }

  /**
   * Convert time string to minutes
   */
  private convertTimeToNumber(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * When a channel has multiple simultaneous live streams, pick the one
   * whose title best matches the current program name.
   * Falls back to the cached primary URL when there is only one stream or no match improves on default.
   */
  private getBestStreamUrl(
    programName: string,
    streams: Array<{ videoId: string; title: string }>,
    defaultUrl: string | null,
  ): string | null {
    if (!streams || streams.length <= 1) return defaultUrl;

    let bestStream = streams[0];
    let bestScore = SimilarityUtil.calculateTitleSimilarity(
      programName,
      streams[0].title,
    );

    for (const stream of streams.slice(1)) {
      const score = SimilarityUtil.calculateTitleSimilarity(
        programName,
        stream.title,
      );
      if (score > bestScore) {
        bestScore = score;
        bestStream = stream;
      }
    }

    return `https://www.youtube.com/embed/${bestStream.videoId}?autoplay=1`;
  }
}
