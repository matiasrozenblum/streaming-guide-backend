import { Injectable, Logger } from '@nestjs/common';
import { SchedulesService } from '../schedules/schedules.service';
import { WeeklyOverridesService } from '../schedules/weekly-overrides.service';
import { LiveStatusBackgroundService } from './live-status-background.service';
import { YoutubeLiveService } from './youtube-live.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';

@Injectable()
export class OptimizedSchedulesService {
  private readonly logger = new Logger(OptimizedSchedulesService.name);
  
  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly weeklyOverridesService: WeeklyOverridesService,
    private readonly liveStatusBackgroundService: LiveStatusBackgroundService,
    private readonly youtubeLiveService: YoutubeLiveService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get schedules with optimized live status (Approach B: cache combination)
   */
  async getSchedulesWithOptimizedLiveStatus(options: any = {}): Promise<any[]> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);

    // Get base schedules without live status
    const schedules = await this.schedulesService.findAll({
      ...options,
      liveStatus: false, // Skip expensive live status enrichment
      applyOverrides: false, // We'll apply overrides separately
    });

    // Apply weekly overrides
    let schedulesWithOverrides = schedules;
    if (options.applyOverrides !== false) {
      const currentWeekStart = this.weeklyOverridesService.getWeekStartDate('current');
      schedulesWithOverrides = await this.weeklyOverridesService.applyWeeklyOverrides(schedules, currentWeekStart);
    }

    // If live status is requested, enrich using background cache (fast)
    if (options.liveStatus) {
      const enrichedSchedules = await this.enrichWithCachedLiveStatus(schedulesWithOverrides);
      return enrichedSchedules;
    }

    return schedulesWithOverrides;
  }

  /**
   * Enrich schedules with cached live status (non-blocking)
   */
  private async enrichWithCachedLiveStatus(schedules: any[]): Promise<any[]> {
    // Group schedules by channel
    const channelGroups = new Map<string, any[]>();
    for (const schedule of schedules) {
      const channelId = schedule.program.channel?.youtube_channel_id;
      if (channelId) {
        if (!channelGroups.has(channelId)) {
          channelGroups.set(channelId, []);
        }
        channelGroups.get(channelId)!.push(schedule);
      }
    }

    // Build channelId -> handle map and handle -> channelId map for accurate sync
    const channelIdToHandle = new Map<string, string>();
    const handleToChannelId = new Map<string, string>();
    const handles: string[] = [];
    for (const schedule of schedules) {
      const channelId = schedule.program.channel?.youtube_channel_id;
      const handle = schedule.program.channel?.handle;
      if (channelId && handle && !channelIdToHandle.has(channelId)) {
        channelIdToHandle.set(channelId, handle);
        handleToChannelId.set(handle, channelId);
        handles.push(handle);
      }
    }
    const liveStatusMapByHandle = await this.liveStatusBackgroundService.getLiveStatusForChannels(handles, handleToChannelId);
    
    // Convert handle-based map back to channelId-based map for compatibility
    const liveStatusMap = new Map<string, any>();
    for (const [channelId, handle] of channelIdToHandle) {
      if (liveStatusMapByHandle.has(handle)) {
        liveStatusMap.set(channelId, liveStatusMapByHandle.get(handle));
      }
    }

    // Fetch attempt tracking data for all channels to check for not-found escalation
    const attemptTrackingMap = new Map<string, any>();
    for (const handle of handles) {
      const attemptTrackingKey = `notFoundAttempts:${handle}`;
      const attemptTracking = await this.redisService.get<any>(attemptTrackingKey);
      if (attemptTracking) {
        attemptTrackingMap.set(handle, attemptTracking);
      }
    }

    // Check canFetchLive for all handles (respects holiday overrides)
    const canFetchLiveMap = new Map<string, boolean>();
    for (const handle of handles) {
      try {
        const canFetch = await this.configService.canFetchLive(handle);
        canFetchLiveMap.set(handle, canFetch);
      } catch (error) {
        // If we can't check the config, assume fetching is enabled
        this.logger.debug(`[OPTIMIZED-SCHEDULES] Error checking canFetchLive for ${handle}, assuming enabled`);
        canFetchLiveMap.set(handle, true);
      }
    }

    // Enrich schedules with cached live status
    const enriched: any[] = [];
    const currentDay = require('../utils/timezone.util').TimezoneUtil.currentDayOfWeek();
    const currentTime = require('../utils/timezone.util').TimezoneUtil.currentTimeInMinutes();
    
    for (const schedule of schedules) {
      const enrichedSchedule = { ...schedule };
      const channelId = schedule.program.channel?.youtube_channel_id;
      const handle = schedule.program.channel?.handle;
      // Treat undefined as visible (default true in DB)
      const isChannelVisible = schedule.program.channel?.is_visible !== false;
      const isProgramVisible = schedule.program?.is_visible !== false;
      
      // Hard guard: if not visible, never attempt live fetches and mark as not live
      if (!isChannelVisible || !isProgramVisible) {
        enrichedSchedule.program = {
          ...schedule.program,
          is_live: false,
          stream_url: schedule.program.stream_url || schedule.program.youtube_url,
          live_streams: [],
          stream_count: 0,
        };
        enriched.push(enrichedSchedule);
        continue;
      }
      
      // Check if this channel has been marked as not-found due to escalation
      const attemptTracking = handle ? attemptTrackingMap.get(handle) : null;
      const isEscalated = attemptTracking?.escalated === true;
      
      // Get canFetchLive status for this handle (defaults to true if not found)
      const canFetchLive = handle ? (canFetchLiveMap.get(handle) ?? true) : true;
      
      if (channelId && liveStatusMap.has(channelId)) {
        const liveStatus = liveStatusMap.get(channelId)!;
        
        // Check if this schedule is currently live based on time
        const startNum = this.convertTimeToNumber(schedule.start_time);
        const endNum = this.convertTimeToNumber(schedule.end_time);
        const isCurrentlyLive = schedule.day_of_week === currentDay &&
                               currentTime >= startNum &&
                               currentTime < endNum;

        // CRITICAL: If escalated to not-found, set is_live to false regardless of cache status
        if (isEscalated && isCurrentlyLive) {
          this.logger.debug(`[OPTIMIZED-SCHEDULES] Program "${schedule.program.name}" on ${handle} has been escalated to not-found, setting is_live to false`);
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: false,
            stream_url: schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: [],
            stream_count: 0,
          };
        } else if (isCurrentlyLive && liveStatus.isLive && canFetchLive) {
          // Program is live and has live stream - use unified cache data
          // CRITICAL: Only set is_live to true if canFetchLive is true (respects holiday overrides)
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: true,
            stream_url: liveStatus.streamUrl || schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: liveStatus.streams || [],
            stream_count: liveStatus.streamCount || 0,
          };
        } else if (isCurrentlyLive && !canFetchLive) {
          // Program is in scheduled time but fetch is disabled (e.g., holiday override)
          this.logger.debug(`[OPTIMIZED-SCHEDULES] Program "${schedule.program.name}" on ${handle} is in scheduled time but canFetchLive is false, setting is_live to false`);
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: false,
            stream_url: schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: [],
            stream_count: 0,
          };
        } else if (isCurrentlyLive) {
          // Program is live by time but background cache says no live stream
          // At this point, canFetchLive is guaranteed to be true (otherwise condition 3 would have matched)
          // CRITICAL: Trust recent cache - if cache was updated recently (< 10 min) and says "not live",
          // don't trigger expensive API calls. The background cron will handle updates.
          const cacheAge = Date.now() - liveStatus.lastUpdated;
          const cacheAgeMinutes = cacheAge / (60 * 1000);
          const shouldTrustCache = cacheAgeMinutes < 10; // Trust cache if updated within last 10 minutes
          
          if (shouldTrustCache) {
            // Cache is recent and says not live - trust it, background cron will update if needed
            this.logger.debug(`[OPTIMIZED-SCHEDULES] Program "${schedule.program.name}" is live by time but cache (updated ${Math.round(cacheAgeMinutes)}min ago) says no stream. Trusting cache, background cron will update.`);
          } else {
            // Cache is stale - trigger async fetch only if not already triggered
            this.logger.debug(`[OPTIMIZED-SCHEDULES] Program "${schedule.program.name}" is live by time but cache is stale (${Math.round(cacheAgeMinutes)}min old). Triggering async fetch.`);
          }
          
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: true,
            stream_url: schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: [],
            stream_count: 0,
          };
          
          // Only trigger async fetch if cache is stale AND lock not already acquired AND still visible
          if (!shouldTrustCache && schedule.program.channel?.handle && isChannelVisible && isProgramVisible) {
            const handle = schedule.program.channel.handle;
            const fetchLockKey = `async-fetch-triggered:${handle}`;
            const fetchLockTTL = 600; // 10 minutes - longer to prevent excessive triggering
            
            // Check lock BEFORE setImmediate to prevent race conditions
            const lockAcquired = await this.redisService.setNX(fetchLockKey, { timestamp: Date.now() }, fetchLockTTL);
            
            if (lockAcquired) {
              setImmediate(async () => {
                try {
                  this.logger.debug(`[OPTIMIZED-SCHEDULES] Triggering async fetch for ${handle} (stale cache)...`);
                  // Use program-aware TTL instead of hardcoded 300
                  const { getCurrentBlockTTL } = await import('../utils/getBlockTTL.util');
                  const schedulesForTTL = schedules.filter(s => s.program.channel?.youtube_channel_id === channelId);
                  const ttl = schedulesForTTL.length > 0 
                    ? await getCurrentBlockTTL(channelId, schedulesForTTL, undefined)
                    : 300; // Fallback to 5 min if no schedules
                  
                  await this.youtubeLiveService.getLiveStreamsMain(
                    channelId,
                    handle,
                    ttl
                  );
                  this.logger.debug(`[OPTIMIZED-SCHEDULES] Async fetch completed for ${handle}`);
                } catch (error) {
                  this.logger.error(`[OPTIMIZED-SCHEDULES] Async fetch failed for ${channelId}:`, error.message);
                }
                // Note: We don't delete the lock - let it expire naturally
                // This prevents rapid re-fetching even if the API call completes quickly
              });
            } else {
              this.logger.debug(`[OPTIMIZED-SCHEDULES] Async fetch already triggered for ${handle}, skipping duplicate`);
            }
          } else if (shouldTrustCache) {
            this.logger.debug(`[OPTIMIZED-SCHEDULES] Trusting recent cache for ${schedule.program.channel?.handle} (${Math.round(cacheAgeMinutes)}min old), skipping fetch`);
          }
        } else {
          // Program is not currently live
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: false,
            stream_url: schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: [],
            stream_count: 0,
          };
        }
      } else {
        // No live status data available, use time-based logic
        const startNum = this.convertTimeToNumber(schedule.start_time);
        const endNum = this.convertTimeToNumber(schedule.end_time);
        const isCurrentlyLive = schedule.day_of_week === currentDay &&
                               currentTime >= startNum &&
                               currentTime < endNum;

        // CRITICAL: If escalated to not-found, set is_live to false even if program is in its scheduled time
        if (isEscalated && isCurrentlyLive) {
          this.logger.debug(`[OPTIMIZED-SCHEDULES] Program "${schedule.program.name}" on ${handle} has been escalated to not-found (no cache), setting is_live to false`);
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: false,
            stream_url: schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: [],
            stream_count: 0,
          };
        } else if (isCurrentlyLive && !canFetchLive) {
          // Program is in scheduled time but fetch is disabled (e.g., holiday override)
          this.logger.debug(`[OPTIMIZED-SCHEDULES] Program "${schedule.program.name}" on ${handle} is in scheduled time but canFetchLive is false (no cache), setting is_live to false`);
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: false,
            stream_url: schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: [],
            stream_count: 0,
          };
        } else {
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: isCurrentlyLive && canFetchLive,
            stream_url: schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: [],
            stream_count: 0,
          };
        }
        
        // If program is live but no cache data exists, trigger async fetch to populate cache
        // CRITICAL: Only trigger if lock not already acquired (deduplicate by channel, not by schedule)
        // AND not escalated AND canFetchLive is true AND visible
        if (isCurrentlyLive && schedule.program.channel?.handle && !isEscalated && canFetchLive && isChannelVisible && isProgramVisible) {
          const handle = schedule.program.channel.handle;
          const fetchLockKey = `async-fetch-triggered:${handle}`;
          const fetchLockTTL = 600; // 10 minutes - longer to prevent excessive triggering
          
          // Check lock BEFORE setImmediate to prevent race conditions
          const lockAcquired = await this.redisService.setNX(fetchLockKey, { timestamp: Date.now() }, fetchLockTTL);
          
          if (lockAcquired) {
            setImmediate(async () => {
              try {
                this.logger.debug(`[OPTIMIZED-SCHEDULES] Triggering async fetch for ${handle} (no cache data)...`);
                // Use program-aware TTL instead of hardcoded 300
                const { getCurrentBlockTTL } = await import('../utils/getBlockTTL.util');
                const schedulesForTTL = schedules.filter(s => s.program.channel?.youtube_channel_id === channelId);
                const ttl = schedulesForTTL.length > 0 
                  ? await getCurrentBlockTTL(channelId, schedulesForTTL, undefined)
                  : 300; // Fallback to 5 min if no schedules
                
                await this.youtubeLiveService.getLiveStreamsMain(
                  channelId,
                  handle,
                  ttl
                );
                this.logger.debug(`[OPTIMIZED-SCHEDULES] Async fetch completed for ${handle}`);
              } catch (error) {
                this.logger.error(`[OPTIMIZED-SCHEDULES] Async fetch failed for ${channelId}:`, error.message);
              }
            });
          } else {
            this.logger.debug(`[OPTIMIZED-SCHEDULES] Async fetch already triggered for ${handle}, skipping duplicate`);
          }
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
}
