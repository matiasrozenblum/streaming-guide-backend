import { Injectable, Logger } from '@nestjs/common';
import { SchedulesService } from '../schedules/schedules.service';
import { WeeklyOverridesService } from '../schedules/weekly-overrides.service';
import { LiveStatusBackgroundService } from './live-status-background.service';
import { YoutubeLiveService } from './youtube-live.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class OptimizedSchedulesService {
  private readonly logger = new Logger(OptimizedSchedulesService.name);
  
  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly weeklyOverridesService: WeeklyOverridesService,
    private readonly liveStatusBackgroundService: LiveStatusBackgroundService,
    private readonly youtubeLiveService: YoutubeLiveService,
    private readonly redisService: RedisService,
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

    // Get cached live status for all channels
    const channelIds = Array.from(channelGroups.keys());
    const liveStatusMap = await this.liveStatusBackgroundService.getLiveStatusForChannels(channelIds);

    // Enrich schedules with cached live status
    const enriched: any[] = [];
    const currentDay = require('../utils/timezone.util').TimezoneUtil.currentDayOfWeek();
    const currentTime = require('../utils/timezone.util').TimezoneUtil.currentTimeInMinutes();
    
    for (const schedule of schedules) {
      const enrichedSchedule = { ...schedule };
      const channelId = schedule.program.channel?.youtube_channel_id;
      
      if (channelId && liveStatusMap.has(channelId)) {
        const liveStatus = liveStatusMap.get(channelId)!;
        
        // Check if this schedule is currently live based on time
        const startNum = this.convertTimeToNumber(schedule.start_time);
        const endNum = this.convertTimeToNumber(schedule.end_time);
        const isCurrentlyLive = schedule.day_of_week === currentDay &&
                               currentTime >= startNum &&
                               currentTime < endNum;

        if (isCurrentlyLive && liveStatus.isLive) {
          // Program is live and has live stream - use unified cache data
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: true,
            stream_url: liveStatus.streamUrl || schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: liveStatus.streams || [],
            stream_count: liveStatus.streamCount || 0,
          };
        } else if (isCurrentlyLive) {
          // Program is live by time but background cache says no live stream
          // Mark as live but don't block on YouTube API calls
          this.logger.debug(`[OPTIMIZED-SCHEDULES] Program "${schedule.program.name}" is live by time but cache says no stream. Marking as live without blocking API call.`);
          
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: true,
            stream_url: schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: [],
            stream_count: 0,
          };
          
          // Trigger async background fetch (non-blocking) - with Redis-based deduplication
          if (schedule.program.channel?.handle) {
            const fetchLockKey = `async-fetch-triggered:${channelId}`;
            const fetchLockTTL = 300; // 5 minutes - matches cache TTL
            
            setImmediate(async () => {
              try {
                // Try to acquire lock - only one replica/request should trigger the fetch
                const lockAcquired = await this.redisService.setNX(fetchLockKey, { timestamp: Date.now() }, fetchLockTTL);
                
                if (!lockAcquired) {
                  this.logger.debug(`[OPTIMIZED-SCHEDULES] Async fetch already triggered for ${schedule.program.channel.handle}, skipping duplicate`);
                  return;
                }
                
                this.logger.debug(`[OPTIMIZED-SCHEDULES] Triggering async fetch for ${schedule.program.channel.handle}...`);
                await this.youtubeLiveService.getLiveStreamsMain(
                  channelId,
                  schedule.program.channel.handle,
                  300 // 5 min TTL for on-demand fetches
                );
                this.logger.debug(`[OPTIMIZED-SCHEDULES] Async fetch completed for ${schedule.program.channel.handle}`);
              } catch (error) {
                this.logger.error(`[OPTIMIZED-SCHEDULES] Async fetch failed for ${channelId}:`, error.message);
              }
              // Note: We don't delete the lock - let it expire naturally after 5 minutes
              // This prevents rapid re-fetching even if the API call completes quickly
            });
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

        enrichedSchedule.program = {
          ...schedule.program,
          is_live: isCurrentlyLive,
          stream_url: schedule.program.stream_url || schedule.program.youtube_url,
          live_streams: [],
          stream_count: 0,
        };
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
