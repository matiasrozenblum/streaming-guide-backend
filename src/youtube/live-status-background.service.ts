import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { YoutubeLiveService } from './youtube-live.service';
import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
import { SentryService } from '../sentry/sentry.service';
import { TimezoneUtil } from '../utils/timezone.util';
import { Channel } from '../channels/channels.entity';
import { getCurrentBlockTTL } from '../utils/getBlockTTL.util';
import { SimilarityUtil } from '../utils/similarity.util';
import { filterVisibleSchedules } from '../utils/scheduleVisibility.util';

interface LiveStream {
  videoId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  publishedAt?: string;
}

interface OvertimeEntry {
  scheduleId: string;
  videoId: string;
  streamUrl: string;
  startedAt: number;
}

/**
 * Snapshot of the last stream known to be live on a channel, kept alive well
 * past the block TTL so the overtime pass still has a videoId to validate once
 * the regular live-status cache has expired.
 */
interface LastLiveVideoMarker {
  channelId: string;
  handle: string;
  scheduleId: string;
  programName: string;
  videoId: string;
  streamUrl: string;
  stream: LiveStream | null;
  overtimeStartedAt: number | null;
  updatedAt: number;
}

interface LiveStatusCache {
  channelId: string;
  handle: string;
  isLive: boolean;
  streamUrl: string | null;
  videoId: string | null;
  lastUpdated: number;
  ttl: number;
  overtime?: OvertimeEntry[];
  // Block-aware fields for accurate timing
  blockEndTime: number | null; // When the current block ends (in minutes), null if unknown
  validationCooldown: number; // When we can validate again (timestamp)
  lastValidation: number; // Last time we validated the video ID
  // Stream details (unified cache - replaces liveStreamsByChannel)
  streams: LiveStream[];
  streamCount: number;
}

@Injectable()
export class LiveStatusBackgroundService {
  private readonly logger = new Logger(LiveStatusBackgroundService.name);
  private readonly CACHE_PREFIX = 'liveStatusByHandle:'; // Migration complete
  private readonly CACHE_TTL = 5 * 60; // 5 minutes default TTL
  /**
   * TTL used when a program is on-air but no live stream was found.
   * Must stay short so the next background run retries instead of freezing the channel as
   * "not live" for the whole program block (a stream that starts a few minutes late, or that
   * YouTube's search index hasn't picked up yet, would otherwise never be detected).
   */
  private readonly NOT_FOUND_RETRY_TTL = 2 * 60; // 2 minutes

  // ── Overtime: programs still on air after their scheduled block ended ──
  private readonly LAST_LIVE_PREFIX = 'lastLiveVideo:';
  /** Hard cap on how long a program may extend past its scheduled end. */
  private readonly OVERTIME_MAX_MINUTES = 180;
  /**
   * Short TTL for overtime cache entries. The block-aligned TTL is meaningless
   * here — the block is over — so we re-validate every cron cycle instead.
   */
  private readonly OVERTIME_TTL = 150; // 2.5 minutes (cron runs every 2)

  constructor(
    private readonly youtubeLiveService: YoutubeLiveService,
    private readonly schedulesService: SchedulesService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly sentryService: SentryService,
    @InjectRepository(Channel)
    private readonly channelsRepository: Repository<Channel>,
  ) {}

  /**
   * Background job that runs every 2 minutes to pre-fetch live status
   * This ensures live status is always cached and ready for fast API responses
   */
  @Cron('*/2 * * * *') // Every 2 minutes
  async updateLiveStatusBackground() {
    const startTime = Date.now();

    // Distributed lock to prevent multiple replicas from running simultaneously
    const lockKey = 'cron:live-status-background:lock';
    const lockTTL = 90; // 90 seconds (less than 2-minute cron interval)

    const acquired = await this.redisService.setNX(
      lockKey,
      { timestamp: Date.now() },
      lockTTL,
    );

    if (!acquired) {
      this.logger.log(
        '⏸️  Skipping background update - another replica is already running',
      );
      return;
    }

    this.logger.log(
      '🔄 Starting background live status update (lock acquired)',
    );

    try {
      const currentDay = TimezoneUtil.currentDayOfWeek();
      const previousDay = TimezoneUtil.previousDayOfWeek();
      const currentTime = TimezoneUtil.currentTimeInMinutes();

      // Get schedules with weekly overrides applied (includes virtual/special programs)
      // This is crucial for detecting special programs from weekly overrides
      // ✅ Hidden programs/channels (is_visible=false) are backoffice-only and must not take
      // part in live detection or title matching
      const todaySchedules = filterVisibleSchedules(
        await this.schedulesService.findAll({
          dayOfWeek: currentDay,
          liveStatus: false, // Don't need live status, just schedule data
          applyOverrides: true, // ✅ CRITICAL: Apply weekly overrides to include special programs
        }),
      );

      // Also fetch previous day's schedules to catch cross-midnight programs still running
      const previousDaySchedules = filterVisibleSchedules(
        await this.schedulesService.findAll({
          dayOfWeek: previousDay,
          liveStatus: false,
          applyOverrides: true,
        }),
      );
      const crossMidnightSchedules = previousDaySchedules.filter((s) => {
        const startNum = this.convertTimeToNumber(s.start_time);
        const endNum = this.convertTimeToNumber(s.end_time);
        return endNum < startNum && currentTime < endNum;
      });

      const allSchedules = [...todaySchedules, ...crossMidnightSchedules];

      const channelsToUpdate: string[] = [];
      const liveChannels = new Map<
        string,
        { channelId: string; handle: string }
      >();

      // Find channels with programs running right now (including special programs)
      for (const schedule of allSchedules) {
        const channelId = schedule.program?.channel?.youtube_channel_id;
        const handle = schedule.program?.channel?.handle;

        if (!channelId || !handle) continue;

        // Check if this schedule is currently live
        const startNum = this.convertTimeToNumber(schedule.start_time);
        const endNum = this.convertTimeToNumber(schedule.end_time);
        const isLive =
          (schedule.day_of_week === currentDay &&
            TimezoneUtil.isTimeInRange(startNum, endNum, currentTime)) ||
          (endNum < startNum &&
            schedule.day_of_week === previousDay &&
            currentTime < endNum);

        if (isLive) {
          liveChannels.set(channelId, { channelId, handle });
        }
      }

      // Check which channels need cache updates
      for (const [channelId, channelInfo] of liveChannels) {
        this.logger.debug(
          `[LIVE-STATUS-BG] Checking cache for channel ${channelInfo.handle} (${channelId})`,
        );
        const cached = await this.getCachedLiveStatus(channelInfo.handle);

        if (!cached) {
          channelsToUpdate.push(channelId);
          continue;
        }

        // A program is on air on this channel, so any overtime left over from
        // the previous one is stale. Drop it now — updateChannelLiveStatus has
        // paths that mutate and re-save the cached object, which would
        // otherwise carry it forward and light up two programs at once.
        if (cached.overtime?.length) {
          delete cached.overtime;
          await this.cacheLiveStatus(channelId, cached);
        }

        // Find current program name for this channel
        const currentSchedule = allSchedules.find((schedule) => {
          const scheduleChannelId =
            schedule.program?.channel?.youtube_channel_id;
          if (scheduleChannelId !== channelId) return false;
          const startNum = this.convertTimeToNumber(schedule.start_time);
          const endNum = this.convertTimeToNumber(schedule.end_time);
          return (
            (schedule.day_of_week === currentDay &&
              TimezoneUtil.isTimeInRange(startNum, endNum, currentTime)) ||
            (endNum < startNum &&
              schedule.day_of_week === previousDay &&
              currentTime < endNum)
          );
        });
        const currentProgramName = currentSchedule?.program?.name || '';

        // Remember the stream currently on air so the overtime pass can keep
        // validating it after the block-aligned cache TTL expires.
        await this.recordLastLiveVideo(cached, currentSchedule);

        // Check if title matching is disabled for this channel
        // Some channels use a single unified live stream for all programs
        let shouldCheckTitle = true;
        try {
          shouldCheckTitle = !(await this.configService.isTitleMatchDisabled(
            channelInfo.handle,
          ));
        } catch (error) {
          // If we can't check the config, assume title matching is enabled
          this.logger.debug(
            `[LIVE-STATUS-BG] Error checking title match config for ${channelInfo.handle}, assuming enabled`,
          );
        }

        if (
          await this.shouldUpdateCache(
            cached,
            shouldCheckTitle ? currentProgramName : undefined,
          )
        ) {
          this.logger.debug(
            `[LIVE-STATUS-BG] Cache update needed for channel ${channelInfo.handle} (${channelId})`,
          );
          channelsToUpdate.push(channelId);
        }
      }

      this.logger.log(
        `📊 Found ${liveChannels.size} channels with live programs, ${channelsToUpdate.length} needing update`,
      );

      if (channelsToUpdate.length === 0) {
        this.logger.log('✅ All channels up to date, skipping update');
      } else {
        // Update live status for channels in batches
        await this.updateChannelsInBatches(channelsToUpdate);

        // Update unified enriched cache with fresh live status
        await this.updateLiveStatusForAllChannels();
      }

      // Channels with no program on air right now may still be broadcasting the
      // stream of a program that just ended. This runs on every cycle, including
      // when nothing above needed an update.
      await this.processOvertimeChannels(new Set(liveChannels.keys()));

      const duration = Date.now() - startTime;
      this.logger.log(
        `✅ Background live status update completed in ${duration}ms`,
      );
    } catch (error) {
      this.logger.error('❌ Error in background live status update:', error);
    }
  }

  /**
   * Get cached live status for a channel (fast, non-blocking)
   * Migration complete - only uses handle-based format
   */
  async getCachedLiveStatus(handle?: string): Promise<LiveStatusCache | null> {
    if (!handle) {
      return null;
    }

    const cacheKey = `${this.CACHE_PREFIX}${handle}`;
    const cache = await this.redisService.get<LiveStatusCache>(cacheKey);
    if (cache) {
      this.logger.debug(`[LIVE-STATUS-BG] Cache hit for ${handle}`);
      return cache;
    }

    return null;
  }

  /**
   * Persist the stream currently on air for a channel.
   *
   * The regular live-status cache uses a block-aligned TTL, so it expires right
   * about when the program ends — exactly when the overtime pass needs it. This
   * marker outlives the block so we always have a videoId to validate.
   */
  private async recordLastLiveVideo(
    cached: LiveStatusCache,
    currentSchedule:
      | { id: number | string; program?: { name?: string } }
      | undefined,
  ): Promise<void> {
    if (!cached.isLive || !cached.videoId || !cached.handle) return;
    if (!currentSchedule?.id) return;

    const key = `${this.LAST_LIVE_PREFIX}${cached.handle}`;
    const existing = await this.redisService.get<LastLiveVideoMarker>(key);

    const marker: LastLiveVideoMarker = {
      channelId: cached.channelId,
      handle: cached.handle,
      // String: special programs from weekly overrides use `virtual_<id>` ids.
      scheduleId: String(currentSchedule.id),
      programName: currentSchedule.program?.name || '',
      videoId: cached.videoId,
      streamUrl:
        cached.streamUrl ||
        `https://www.youtube.com/embed/${cached.videoId}?autoplay=1`,
      stream: cached.streams?.[0] ?? existing?.stream ?? null,
      // The program is on air right now, so it is not in overtime yet.
      overtimeStartedAt: null,
      updatedAt: Date.now(),
    };

    await this.redisService.set(
      key,
      marker,
      (this.OVERTIME_MAX_MINUTES + 10) * 60,
    );
  }

  /**
   * Keep programs live past their scheduled end while their stream is still up.
   *
   * Only runs for channels with nothing on air right now — a channel whose next
   * program already started has handed the stream over, so the previous program
   * must not extend.
   */
  private async processOvertimeChannels(
    liveChannelIds: Set<string>,
  ): Promise<void> {
    try {
      const channels = await this.channelsRepository.find();
      const candidates = channels.filter(
        (c) =>
          c.handle &&
          c.youtube_channel_id &&
          !liveChannelIds.has(c.youtube_channel_id),
      );
      if (candidates.length === 0) return;

      const markers = await this.redisService.mget<LastLiveVideoMarker>(
        candidates.map((c) => `${this.LAST_LIVE_PREFIX}${c.handle}`),
      );

      const pending = markers.filter(
        (m): m is LastLiveVideoMarker => !!m?.videoId && !!m.handle,
      );
      if (pending.length === 0) return;

      let extended = 0;
      let ended = 0;
      for (const marker of pending) {
        const result = await this.resolveOvertimeForChannel(marker);
        if (result === 'extended') extended++;
        else if (result === 'ended') ended++;
      }

      this.logger.log(
        `⏱️  Overtime pass: ${pending.length} candidates, ${extended} still on air, ${ended} ended`,
      );
    } catch (error) {
      this.logger.error('❌ Error in overtime pass:', error);
    }
  }

  /**
   * Decide whether a single channel's just-ended program is still broadcasting.
   *
   * Uses `isVideoLive` (videos.list, 1 quota unit) rather than the search-based
   * refresh path — the daily search budget is the scarce one and must not be
   * spent on polling programs that already ended.
   */
  private async resolveOvertimeForChannel(
    marker: LastLiveVideoMarker,
  ): Promise<'extended' | 'ended' | 'skipped'> {
    const key = `${this.LAST_LIVE_PREFIX}${marker.handle}`;

    // Same guards as the regular path: disabled channels, holidays.
    let canFetch = true;
    try {
      canFetch = await this.configService.canFetchLive(marker.handle);
    } catch {
      this.logger.debug(
        `[OVERTIME] Could not read fetch config for ${marker.handle}, skipping`,
      );
      canFetch = false;
    }
    if (!canFetch) {
      await this.endOvertime(marker, key);
      return 'skipped';
    }

    // On the first overtime cycle, fall back to the last time we confirmed the
    // program was on air — effectively its block end. Anchoring to `now` instead
    // would restart the cap from zero after any gap in cron execution.
    const startedAt =
      marker.overtimeStartedAt ?? marker.updatedAt ?? Date.now();
    const elapsedMinutes = (Date.now() - startedAt) / 60000;
    if (elapsedMinutes > this.OVERTIME_MAX_MINUTES) {
      this.logger.log(
        `[OVERTIME] Cap reached for ${marker.handle} (${Math.round(elapsedMinutes)}min), ending overtime for "${marker.programName}"`,
      );
      await this.endOvertime(marker, key);
      return 'ended';
    }

    const stillLive = await this.youtubeLiveService.isVideoLive(marker.videoId);
    if (!stillLive) {
      this.logger.log(
        `[OVERTIME] Stream ${marker.videoId} ended for ${marker.handle} ("${marker.programName}")`,
      );
      await this.endOvertime(marker, key);
      return 'ended';
    }

    const cacheData: LiveStatusCache = {
      channelId: marker.channelId,
      handle: marker.handle,
      isLive: true,
      streamUrl: marker.streamUrl,
      videoId: marker.videoId,
      lastUpdated: Date.now(),
      ttl: this.OVERTIME_TTL,
      overtime: [
        {
          scheduleId: marker.scheduleId,
          videoId: marker.videoId,
          streamUrl: marker.streamUrl,
          startedAt,
        },
      ],
      // The block is over, so there is no meaningful block end to track.
      blockEndTime: null,
      validationCooldown: Date.now() + this.OVERTIME_TTL * 1000,
      lastValidation: Date.now(),
      streams: marker.stream ? [marker.stream] : [],
      streamCount: marker.stream ? 1 : 0,
    };
    await this.cacheLiveStatus(marker.channelId, cacheData);

    const isFirstCycle = marker.overtimeStartedAt === null;

    await this.redisService.set(
      key,
      { ...marker, overtimeStartedAt: startedAt, updatedAt: Date.now() },
      (this.OVERTIME_MAX_MINUTES + 10) * 60,
    );

    if (isFirstCycle) {
      await this.notifyOvertimeChange(marker, marker.videoId);
    }

    this.logger.debug(
      `[OVERTIME] "${marker.programName}" (${marker.handle}) still on air, ${Math.round(elapsedMinutes)}min past its block`,
    );
    return 'extended';
  }

  /**
   * Drop the overtime marker and publish a not-live status so clients stop
   * showing the program as live instead of waiting for the entry to expire.
   */
  private async endOvertime(
    marker: LastLiveVideoMarker,
    key: string,
  ): Promise<void> {
    await this.redisService.del(key);
    await this.cacheLiveStatus(
      marker.channelId,
      this.createNotLiveCacheData(
        marker.channelId,
        marker.handle,
        this.CACHE_TTL,
      ),
    );

    // Only worth telling clients when they were actually shown the overtime.
    if (marker.overtimeStartedAt !== null) {
      await this.notifyOvertimeChange(marker, null);
    }
  }

  /**
   * Push an SSE notification so clients refresh right away instead of waiting
   * up to 5 minutes for their next poll. Fired only on overtime transitions,
   * never on the steady-state re-validation that runs every cycle.
   *
   * The payload goes in as an object because RedisService.set already
   * serialises it. Double-encoding (as the older call sites do) makes the SSE
   * controller parse it back into a string, which collapses every notification
   * onto the same dedup id and silently drops all but the first.
   */
  private async notifyOvertimeChange(
    marker: LastLiveVideoMarker,
    videoId: string | null,
  ): Promise<void> {
    try {
      const timestamp = Date.now();
      await this.redisService.set(
        `live_notification:${marker.channelId}:${timestamp}`,
        {
          type: 'live_status_changed',
          channelId: marker.channelId,
          videoId,
          channelName: marker.handle,
          timestamp,
        },
        300,
      );
    } catch {
      this.logger.warn(
        `[OVERTIME] Could not publish SSE notification for ${marker.handle}`,
      );
    }
  }

  /**
   * Update channels in batches to avoid API rate limits
   */
  private async updateChannelsInBatches(
    channelIds: string[],
  ): Promise<Map<string, LiveStatusCache>> {
    const results = new Map<string, LiveStatusCache>();
    const batchSize = 10; // Process 10 channels at a time

    for (let i = 0; i < channelIds.length; i += batchSize) {
      this.logger.debug(`[LIVE-STATUS-BG] Updating channel ${channelIds[i]}`);
      const batch = channelIds.slice(i, i + batchSize);
      this.logger.log(
        `🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(channelIds.length / batchSize)}: ${batch.length} channels`,
      );

      // Process batch in parallel
      const batchPromises = batch.map((channelId) =>
        this.updateChannelLiveStatus(channelId),
      );
      const batchResults = await Promise.allSettled(batchPromises);

      // Collect successful results
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          results.set(batch[index], result.value);
        }
      });

      // Small delay between batches to be respectful to YouTube API
      if (i + batchSize < channelIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  /**
   * Update live status for a single channel
   */
  private async updateChannelLiveStatus(
    channelId: string,
  ): Promise<LiveStatusCache | null> {
    try {
      // Get current day and time
      const currentDay = TimezoneUtil.currentDayOfWeek();
      const previousDay = TimezoneUtil.previousDayOfWeek();
      const currentTime = TimezoneUtil.currentTimeInMinutes();

      // Get schedules with weekly overrides applied (includes virtual/special programs)
      // Hidden programs/channels are excluded: they must not drive live detection, block TTL
      // or title matching (see scheduleVisibility.util)
      const todayAllSchedules = filterVisibleSchedules(
        await this.schedulesService.findAll({
          dayOfWeek: currentDay,
          liveStatus: false,
          applyOverrides: true, // ✅ Include special programs from weekly overrides
        }),
      );

      // Also include previous day's cross-midnight schedules still in progress
      const previousDayAllSchedules = filterVisibleSchedules(
        await this.schedulesService.findAll({
          dayOfWeek: previousDay,
          liveStatus: false,
          applyOverrides: true,
        }),
      );
      const crossMidnightAllSchedules = previousDayAllSchedules.filter((s) => {
        const startNum = this.convertTimeToNumber(s.start_time);
        const endNum = this.convertTimeToNumber(s.end_time);
        return endNum < startNum && currentTime < endNum;
      });

      const allSchedules = [...todayAllSchedules, ...crossMidnightAllSchedules];

      // Find ALL schedules for this channel today (not just live ones)
      const channelSchedules = allSchedules.filter((schedule) => {
        const scheduleChannelId = schedule.program?.channel?.youtube_channel_id;
        return scheduleChannelId === channelId;
      });

      if (channelSchedules.length === 0) {
        // Channel has no schedules today (unusual - caller should have checked this)
        return null;
      }

      // Get channel handle from the first schedule
      const handle = channelSchedules[0].program.channel.handle;
      if (!handle) {
        return null;
      }

      // Check if channel is enabled for live fetching
      try {
        if (!(await this.configService.canFetchLive(handle))) {
          return null;
        }
      } catch (error) {
        // If we can't check the config (e.g., database connection issue), log and skip
        this.logger.error(
          `❌ Error checking fetch config for ${handle}: with error ${error.message}`,
          error.message,
        );
        return null;
      }

      // Now filter for currently live schedules
      const liveSchedules = channelSchedules.filter((schedule) => {
        const startNum = this.convertTimeToNumber(schedule.start_time);
        const endNum = this.convertTimeToNumber(schedule.end_time);
        return (
          (schedule.day_of_week === currentDay &&
            TimezoneUtil.isTimeInRange(startNum, endNum, currentTime)) ||
          (endNum < startNum &&
            schedule.day_of_week === previousDay &&
            currentTime < endNum)
        );
      });

      // If no live schedules, cache as not live (program ended)
      if (liveSchedules.length === 0) {
        const cacheData: LiveStatusCache = {
          channelId,
          handle,
          isLive: false,
          streamUrl: null,
          videoId: null,
          lastUpdated: Date.now(),
          ttl: 5 * 60, // 5 minutes
          blockEndTime: null, // No current program - unknown when next one starts
          validationCooldown: Date.now() + 30 * 60 * 1000,
          lastValidation: Date.now(),
          // Unified stream data
          streams: [],
          streamCount: 0,
        };
        await this.cacheLiveStatus(channelId, cacheData);
        return cacheData;
      }

      // Calculate TTL using block TTL logic for accurate timing
      // ✅ CRITICAL: Use channelSchedules (from allSchedules with overrides) instead of findByDay
      // findByDay doesn't include weekly overrides, which is why futurock's cache was failing
      const ttl = await getCurrentBlockTTL(
        channelId,
        channelSchedules,
        this.sentryService,
      );

      // Calculate block end time for cache metadata
      const blockEndTime = this.calculateBlockEndTime(
        liveSchedules,
        currentTime,
      );

      // Check unified cache (liveStatusByHandle replaces liveStreamsByChannel)
      const statusCacheKey = `${this.CACHE_PREFIX}${handle}`;
      const cachedStatus =
        await this.redisService.get<LiveStatusCache>(statusCacheKey);

      // CRITICAL: Detect program block transitions
      // If blockEndTime changed, we've transitioned between programs - need to validate/fetch new video
      // Skip if blockEndTime is null (cache needs enrichment from background cron)
      const programBlockChanged =
        cachedStatus &&
        cachedStatus.blockEndTime !== null &&
        blockEndTime !== null &&
        cachedStatus.blockEndTime !== blockEndTime;

      if (programBlockChanged) {
        this.logger.debug(
          `[LIVE-STATUS-BG] Program block changed for ${handle}: blockEndTime ${cachedStatus.blockEndTime} → ${blockEndTime}`,
        );

        // Check if cached video ID is still live
        if (cachedStatus.videoId) {
          this.logger.debug(
            `[LIVE-STATUS-BG] Checking if cached video ${cachedStatus.videoId} is still live after program transition`,
          );
          const isStillLive = await this.youtubeLiveService.isVideoLive(
            cachedStatus.videoId,
          );

          if (isStillLive) {
            // Video is still live but program changed - set 7-minute cooldown to catch rotation soon
            this.logger.debug(
              `[LIVE-STATUS-BG] Video ${cachedStatus.videoId} still live after program transition for ${handle}, setting 7-minute validation cooldown`,
            );
            cachedStatus.ttl = ttl;
            cachedStatus.blockEndTime = blockEndTime;
            cachedStatus.lastValidation = Date.now();
            cachedStatus.validationCooldown = Date.now() + 7 * 60 * 1000; // 7 minutes
            cachedStatus.lastUpdated = Date.now();
            await this.cacheLiveStatus(channelId, cachedStatus);
            return cachedStatus;
          } else {
            // Video is no longer live - fetch new one
            this.logger.debug(
              `[LIVE-STATUS-BG] Video ${cachedStatus.videoId} no longer live after program transition for ${handle}, fetching new one`,
            );
            await this.redisService.del(statusCacheKey);
            // Continue to fetch fresh data below
          }
        } else {
          // No cached video ID - invalidate and fetch
          this.logger.debug(
            `[LIVE-STATUS-BG] No cached video ID after program transition, invalidating cache`,
          );
          await this.redisService.del(statusCacheKey);
          // Continue to fetch fresh data below
        }
      }

      if (cachedStatus && cachedStatus.videoId && !programBlockChanged) {
        // We have cached status - check if we need to validate using video age
        // Only validate if video is >30 minutes old (to avoid excessive API calls)
        // CRITICAL: Use video age (lastValidation) instead of validationCooldown timestamp
        const videoAge = Date.now() - cachedStatus.lastValidation;
        const videoAgeMinutes = videoAge / (60 * 1000);
        const needsValidation = videoAgeMinutes > 30;

        if (needsValidation) {
          // Validation needed - video is >30 minutes old, check if it's still live
          // Use videos API (cheaper than search) to validate
          this.logger.debug(
            `[LIVE-STATUS-BG] Video ID ${cachedStatus.videoId} is ${Math.round(videoAgeMinutes)}min old, validating if still live for ${handle}`,
          );
          const isStillLive = await this.youtubeLiveService.isVideoLive(
            cachedStatus.videoId,
          );
          if (isStillLive) {
            // Video is still live, update cache with current schedules metadata
            this.logger.debug(
              `[LIVE-STATUS-BG] Video ID ${cachedStatus.videoId} still live for ${handle}`,
            );
            // Update TTL and blockEndTime from current schedules, update lastValidation time
            cachedStatus.ttl = ttl;
            cachedStatus.blockEndTime = blockEndTime;
            cachedStatus.lastValidation = Date.now(); // Reset validation time - won't validate again for 30 min
            cachedStatus.lastUpdated = Date.now();
            await this.cacheLiveStatus(channelId, cachedStatus);
            return cachedStatus;
          } else {
            // Video is no longer live - check if program is still scheduled before triggering expensive search API
            // If program ended, don't waste API quota searching for new streams
            const hasLiveSchedules = liveSchedules.length > 0;

            if (hasLiveSchedules) {
              // Program still scheduled, video might have rotated - fetch new one
              this.logger.debug(
                `[LIVE-STATUS-BG] Video ID ${cachedStatus.videoId} no longer live for ${handle}, but program still scheduled - fetching new one`,
              );
              await this.redisService.del(statusCacheKey);
              // Continue to fetch fresh data below
            } else {
              // Program ended, don't waste API quota - just mark as not live
              this.logger.debug(
                `[LIVE-STATUS-BG] Video ID ${cachedStatus.videoId} no longer live for ${handle}, and program ended - marking as not live`,
              );
              const notLiveData = this.createNotLiveCacheData(
                channelId,
                handle,
                ttl,
              );
              await this.cacheLiveStatus(channelId, notLiveData);
              return notLiveData;
            }
          }
        } else {
          // Validation not needed - video is fresh (<30 minutes old), but check title match
          // If video title doesn't match current program, ignore cooldown and validate anyway
          const programName =
            liveSchedules.length > 0 ? liveSchedules[0].program.name : '';
          const videoTitle = cachedStatus.streams[0]?.title || '';
          const titleSimilarity =
            programName && videoTitle
              ? SimilarityUtil.calculateTitleSimilarity(programName, videoTitle)
              : 1;

          if (titleSimilarity < 0.3) {
            // Title doesn't match well (<30%) - this might be a previous program's video, validate now
            // CRITICAL: Validate first to see if the old video is still live
            // If it's no longer live, we'll fetch and get the new one
            // If it's still live, we'll keep it (don't fetch) since search would likely return the same video ID
            this.logger.debug(
              `[LIVE-STATUS-BG] Video title '${videoTitle}' doesn't match program '${programName}' (${Math.round(titleSimilarity * 100)}%), forcing validation despite cooldown`,
            );
            const isStillLive = await this.youtubeLiveService.isVideoLive(
              cachedStatus.videoId,
            );

            if (!isStillLive) {
              // Old video is no longer live - fetch new one
              this.logger.debug(
                `[LIVE-STATUS-BG] Video ${cachedStatus.videoId} no longer live for ${handle} (title mismatch), fetching new one`,
              );
              await this.redisService.del(statusCacheKey);
              // Continue to fetch fresh data below
            } else {
              // Old video is still live but title doesn't match
              // CRITICAL: Don't fetch - search would likely return the same video ID anyway, which is costly
              // Just update metadata (TTL, blockEndTime) and keep the cached video
              this.logger.debug(
                `[LIVE-STATUS-BG] Video ${cachedStatus.videoId} still live for ${handle} but title doesn't match program. Keeping cached video (fetch would return same ID)`,
              );
              cachedStatus.ttl = ttl;
              cachedStatus.blockEndTime = blockEndTime;
              cachedStatus.lastUpdated = Date.now();
              await this.cacheLiveStatus(channelId, cachedStatus);
              return cachedStatus;
            }
          } else {
            // Title matches well - just update metadata (TTL, blockEndTime) from current schedules
            this.logger.debug(
              `[LIVE-STATUS-BG] Using cached video ID ${cachedStatus.videoId} for ${handle} (fresh video, ${Math.round(videoAgeMinutes)}min old, title match ${Math.round(titleSimilarity * 100)}%)`,
            );
            cachedStatus.ttl = ttl;
            cachedStatus.blockEndTime = blockEndTime;
            cachedStatus.lastUpdated = Date.now();
            await this.cacheLiveStatus(channelId, cachedStatus);
            return cachedStatus;
          }
        }
      }

      // No cached video ID or validation failed, check not-found cache
      const notFoundKey = `videoIdNotFound:${handle}`;
      const notFoundData = await this.redisService.get<string>(notFoundKey);

      if (notFoundData) {
        // Channel is marked as not-found, skip fetching
        this.logger.debug(
          `[LIVE-STATUS-BG] Skipping ${handle} - marked as not-found`,
        );
        return this.createNotLiveCacheData(channelId, handle, ttl);
      }

      // Fetch live streams from YouTube using main cron method (should extend not-found marks)
      this.logger.debug(
        `[LIVE-STATUS-BG] Fetching live streams for ${handle} (${channelId})`,
      );
      const liveStreams = await this.youtubeLiveService.getLiveStreamsMain(
        channelId,
        handle,
        ttl,
      );
      this.logger.debug(
        `[LIVE-STATUS-BG] Live streams result for ${handle}:`,
        liveStreams,
      );

      const foundLiveStreams =
        liveStreams !== null &&
        liveStreams !== '__SKIPPED__' &&
        liveStreams.streams.length > 0;

      // A program is on-air (liveSchedules.length > 0) but we found no stream: keep the negative
      // result short-lived so the next background run retries. Caching it for the whole block
      // (ttl) would freeze the channel as "not live" until the program ends, even if the stream
      // shows up a few minutes later.
      const cacheTTL = foundLiveStreams
        ? ttl
        : Math.min(ttl, this.NOT_FOUND_RETRY_TTL);

      const cacheData: LiveStatusCache = {
        channelId,
        handle,
        isLive: foundLiveStreams,
        streamUrl:
          liveStreams &&
          liveStreams !== '__SKIPPED__' &&
          liveStreams.streams.length > 0
            ? `https://www.youtube.com/embed/${liveStreams.primaryVideoId}?autoplay=1`
            : null,
        videoId:
          liveStreams && liveStreams !== '__SKIPPED__'
            ? liveStreams.primaryVideoId
            : null,
        lastUpdated: Date.now(),
        ttl: cacheTTL,
        blockEndTime,
        validationCooldown: Date.now() + 30 * 60 * 1000, // Can validate again in 30 minutes
        lastValidation: Date.now(),
        // Unified stream data
        streams:
          liveStreams && liveStreams !== '__SKIPPED__'
            ? liveStreams.streams
            : [],
        streamCount:
          liveStreams && liveStreams !== '__SKIPPED__'
            ? liveStreams.streamCount
            : 0,
      };

      this.logger.debug(
        `[LIVE-STATUS-BG] Cache data for ${handle}:`,
        cacheData,
      );

      await this.cacheLiveStatus(channelId, cacheData);
      return cacheData;
    } catch (error) {
      this.logger.error(
        `❌ Error updating live status for channel ${channelId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Cache live status data
   * Migration complete - only uses handle-based format
   */
  private async cacheLiveStatus(
    channelId: string,
    data: LiveStatusCache,
  ): Promise<void> {
    if (!data.handle) {
      return;
    }

    const cacheKey = `${this.CACHE_PREFIX}${data.handle}`;
    await this.redisService.set(cacheKey, data, data.ttl);
    this.logger.debug(`✅ Live status cache updated for ${data.handle}`);
    this.logger.log(
      `✅ Live status cache updated for channel ${data.handle} (${channelId}): isLive=${data.isLive}, streams=${data.streamCount}`,
    );
  }

  /**
   * Check if cache should be updated
   * Considers TTL, program block changes, and title similarity with current program
   * Validation is done separately in updateChannelLiveStatus to avoid excessive API calls
   *
   * IMPORTANT: Returns false (cache is valid) for slightly stale cache to prevent excessive async fetches
   * The background cron will handle updates, and we don't want every request triggering fetches
   *
   * @param cached The cached live status
   * @param currentProgramName The name of the program currently scheduled (optional, for title comparison)
   */
  private async shouldUpdateCache(
    cached: LiveStatusCache,
    currentProgramName?: string,
  ): Promise<boolean> {
    const now = Date.now();
    const age = now - cached.lastUpdated;

    // Always update if TTL has expired
    if (age > cached.ttl * 1000) {
      return true;
    }

    // CRITICAL: Check title similarity if we have both cached video title and current program name
    // If title doesn't match current program, force update to validate and potentially refresh
    if (
      currentProgramName &&
      cached.streams &&
      cached.streams.length > 0 &&
      cached.streams[0]?.title
    ) {
      const videoTitle = cached.streams[0].title;
      const titleSimilarity = SimilarityUtil.calculateTitleSimilarity(
        currentProgramName,
        videoTitle,
      );

      if (titleSimilarity < 0.3) {
        // Title doesn't match current program - force update to validate video status
        this.logger.debug(
          `[LIVE-STATUS-BG] Title mismatch for ${cached.handle}: cached '${videoTitle}' vs program '${currentProgramName}' (${Math.round(titleSimilarity * 100)}%), forcing update`,
        );
        return true;
      }
    }

    // CRITICAL: Enrichment needed - main cron created cache without blockEndTime
    // Background cron needs to add the proper blockEndTime
    if (cached.blockEndTime === null && cached.isLive) {
      const ageMinutes = age / (60 * 1000);
      if (ageMinutes > 2) {
        // Cache is >2 minutes old and still needs enrichment - refresh it
        this.logger.debug(
          `[LIVE-STATUS-BG] Cache needs enrichment (null blockEndTime, ${Math.round(ageMinutes)}min old), forcing refresh`,
        );
        return true;
      }
    }

    // CRITICAL: Use blockEndTime for cache refresh check
    // If we're past the blockEndTime, the program has ended - update cache metadata
    // Note: This refreshes metadata (TTL, blockEndTime) but preserves video ID if still live
    // The actual video ID validation happens in updateChannelLiveStatus (>30 min age check)
    if (cached.blockEndTime !== null) {
      const currentTimeInMinutes = this.convertTimeToMinutes(now);
      if (currentTimeInMinutes >= cached.blockEndTime) {
        this.logger.debug(
          `[LIVE-STATUS-BG] Block ended for ${cached.handle}: blockEndTime (${cached.blockEndTime}) passed (current: ${currentTimeInMinutes}), refreshing metadata`,
        );
        return true;
      }
    }

    // DO NOT validate here - it causes excessive API calls
    // Validation will happen in updateChannelLiveStatus when actually updating the cache
    // This prevents cascading API calls during the initial check phase

    // IMPORTANT: Only mark as needing update when 90% of TTL has passed (was 80%)
    // This gives more margin before triggering async fetches, relying on background cron for updates
    // This reduces the window where optimized-schedules triggers unnecessary fetches
    return age > cached.ttl * 1000 * 0.9;
  }

  /**
   * Convert current timestamp to minutes since midnight (Argentina timezone)
   * Uses TimezoneUtil for consistency with schedule calculations
   */
  private convertTimeToMinutes(timestamp: number): number {
    const timeInArgentina = TimezoneUtil.toArgentinaTime(new Date(timestamp));
    return timeInArgentina.hour() * 60 + timeInArgentina.minute();
  }

  /**
   * Calculate block end time for cache metadata
   * Uses the same logic as getCurrentBlockTTL but returns the end time in minutes
   */
  private calculateBlockEndTime(
    schedules: any[],
    currentTime: number,
  ): number | null {
    // Sort schedules by start time
    const sortedSchedules = schedules
      .map((s) => ({
        start: this.convertTimeToNumber(s.start_time),
        end: this.convertTimeToNumber(s.end_time),
      }))
      .sort((a, b) => a.start - b.start);

    // Find the current block end time
    let blockEnd: number | null = null;
    let prevEnd: number | null = null;

    for (const schedule of sortedSchedules) {
      if (schedule.start <= currentTime && schedule.end > currentTime) {
        // Start block with this schedule
        prevEnd = schedule.end;
        blockEnd = schedule.end;
        continue;
      }
      if (prevEnd !== null && schedule.start - prevEnd < 2) {
        // Extend block (gap < 2 minutes)
        blockEnd = schedule.end;
        prevEnd = schedule.end;
        continue;
      }
      // If block already detected and can't extend, break
      if (blockEnd !== null) break;
    }

    return blockEnd || null; // Return null if no block found (unknown when program ends)
  }

  /**
   * Convert time string to minutes
   */
  private convertTimeToNumber(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  /**
   * Create cache data from existing streams
   */
  private createCacheDataFromStreams(
    channelId: string,
    handle: string,
    streams: any,
    ttl: number,
    blockEndTime: number,
  ): LiveStatusCache {
    return {
      channelId,
      handle,
      isLive: streams.streams && streams.streams.length > 0,
      streamUrl:
        streams.streams && streams.streams.length > 0
          ? `https://www.youtube.com/embed/${streams.primaryVideoId}?autoplay=1`
          : null,
      videoId: streams.primaryVideoId || null,
      lastUpdated: Date.now(),
      ttl,
      blockEndTime,
      validationCooldown: Date.now() + 30 * 60 * 1000,
      lastValidation: Date.now(),
      streams: streams.streams || [],
      streamCount: streams.streamCount || 0,
    };
  }

  /**
   * Create cache data for not-live channels
   */
  private createNotLiveCacheData(
    channelId: string,
    handle: string,
    ttl: number,
  ): LiveStatusCache {
    return {
      channelId,
      handle,
      isLive: false,
      streamUrl: null,
      videoId: null,
      lastUpdated: Date.now(),
      ttl,
      blockEndTime: null, // No current program - unknown when next one starts
      validationCooldown: Date.now() + 30 * 60 * 1000,
      lastValidation: Date.now(),
      streams: [],
      streamCount: 0,
    };
  }

  /**
   * Update live status for channels that actually have live programs
   * This method should NOT update all channels - only those with live programs
   */
  private async updateLiveStatusForAllChannels(): Promise<void> {
    try {
      this.logger.log(
        '[LIVE-STATUS-UPDATE] Skipping bulk update - only updating channels with live programs',
      );

      // This method was causing excessive API calls by updating ALL channels
      // Instead, we only update channels that have live programs (handled in main loop)
      // No action needed here - the main updateLiveStatusBackground method handles this correctly
    } catch (error) {
      this.logger.error(
        '[LIVE-STATUS-UPDATE] Error in live status update:',
        error,
      );
    }
  }
}
