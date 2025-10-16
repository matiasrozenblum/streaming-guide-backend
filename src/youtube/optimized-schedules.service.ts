import { Injectable } from '@nestjs/common';
import { SchedulesService } from '../schedules/schedules.service';
import { LiveStatusBackgroundService } from './live-status-background.service';
import { YoutubeLiveService } from './youtube-live.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class OptimizedSchedulesService {
  // Global set to track channels that have async fetches in progress (across all requests)
  private readonly globalAsyncFetchTriggered = new Set<string>();

  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly liveStatusBackgroundService: LiveStatusBackgroundService,
    private readonly youtubeLiveService: YoutubeLiveService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Get schedules with optimized live status (uses background cache)
   */
  async getSchedulesWithOptimizedLiveStatus(options: any = {}): Promise<any[]> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);

    const schedules = await this.schedulesService.findAll({
      ...options,
      liveStatus: false, // Skip expensive live status enrichment
    });

    // If live status is requested, enrich using background cache (fast)
    if (options.liveStatus) {
      const enrichedSchedules = await this.enrichWithCachedLiveStatus(schedules);
      return enrichedSchedules;
    }

    return schedules;
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
          // Program is live and has live stream - get actual live stream data
          const liveStreamsKey = `liveStreamsByChannel:${channelId}`;
          const cachedLiveStreams = await this.redisService.get<string>(liveStreamsKey);
          
          if (cachedLiveStreams) {
            try {
              const liveStreams = JSON.parse(cachedLiveStreams);
              enrichedSchedule.program = {
                ...schedule.program,
                is_live: true,
                stream_url: liveStatus.streamUrl,
                live_streams: liveStreams,
                stream_count: liveStreams.length,
              };
            } catch (error) {
              console.warn(`[OPTIMIZED-SCHEDULES] Failed to parse live streams for ${channelId}:`, error);
              // Fallback to basic live status
              enrichedSchedule.program = {
                ...schedule.program,
                is_live: true,
                stream_url: liveStatus.streamUrl,
                live_streams: [{
                  videoId: liveStatus.videoId,
                  title: schedule.program.name,
                  publishedAt: new Date().toISOString(),
                  description: '',
                  channelTitle: schedule.program.channel.name
                }],
                stream_count: 1,
              };
            }
          } else {
            // Fallback to basic live status if no cached streams
            enrichedSchedule.program = {
              ...schedule.program,
              is_live: true,
              stream_url: liveStatus.streamUrl,
              live_streams: [{
                videoId: liveStatus.videoId,
                title: schedule.program.name,
                publishedAt: new Date().toISOString(),
                description: '',
                channelTitle: schedule.program.channel.name
              }],
              stream_count: 1,
            };
          }
        } else if (isCurrentlyLive) {
          // Program is live by time but background cache says no live stream
          // Mark as live but don't block on YouTube API calls
          console.log(`[OPTIMIZED-SCHEDULES] Program "${schedule.program.name}" is live by time but cache says no stream. Marking as live without blocking API call.`);
          
          const liveStreamsKey = `liveStreamsByChannel:${channelId}`;
          let cachedLiveStreams = await this.redisService.get<string>(liveStreamsKey);
          
          if (cachedLiveStreams) {
            // Use cached streams if available
            try {
              const liveStreams = JSON.parse(cachedLiveStreams);
              enrichedSchedule.program = {
                ...schedule.program,
                is_live: true,
                stream_url: liveStreams[0] ? `https://www.youtube.com/embed/${liveStreams[0].videoId}?autoplay=1` : schedule.program.stream_url,
                live_streams: liveStreams,
                stream_count: liveStreams.length,
              };
            } catch {
              enrichedSchedule.program = {
                ...schedule.program,
                is_live: true,
                stream_url: schedule.program.stream_url || schedule.program.youtube_url,
                live_streams: [],
                stream_count: 0,
              };
            }
          } else {
            // No cached streams - mark as live but trigger async background fetch
            enrichedSchedule.program = {
              ...schedule.program,
              is_live: true,
              stream_url: schedule.program.stream_url || schedule.program.youtube_url,
              live_streams: [],
              stream_count: 0,
            };
            
            // Trigger async background fetch (non-blocking) - but only once per channel globally
            if (schedule.program.channel?.handle && !this.globalAsyncFetchTriggered.has(channelId)) {
              this.globalAsyncFetchTriggered.add(channelId); // Mark as triggered BEFORE setImmediate
              setImmediate(async () => {
                try {
                  console.log(`[OPTIMIZED-SCHEDULES] Triggering async fetch for ${schedule.program.channel.handle}...`);
                  await this.youtubeLiveService.getLiveStreams(
                    channelId,
                    schedule.program.channel.handle,
                    300, // 5 min TTL for on-demand fetches
                    'onDemand' // Special programs use on-demand fetching
                  );
                  console.log(`[OPTIMIZED-SCHEDULES] Async fetch completed for ${schedule.program.channel.handle}`);
                } catch (error) {
                  console.error(`[OPTIMIZED-SCHEDULES] Async fetch failed for ${channelId}:`, error.message);
                } finally {
                  // Clean up the global set after the fetch completes (success or failure)
                  this.globalAsyncFetchTriggered.delete(channelId);
                }
              });
            }
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
