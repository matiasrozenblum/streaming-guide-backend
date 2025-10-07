import { Injectable } from '@nestjs/common';
import { SchedulesService } from '../schedules/schedules.service';
import { LiveStatusBackgroundService } from './live-status-background.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class OptimizedSchedulesService {
  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly liveStatusBackgroundService: LiveStatusBackgroundService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Get schedules with optimized live status (uses background cache)
   */
  async getSchedulesWithOptimizedLiveStatus(options: any = {}): Promise<any[]> {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substr(2, 9);
    console.log(`[OPTIMIZED-SCHEDULES-${requestId}] Starting at ${new Date().toISOString()}, options:`, options);
    
    // Get schedules without live status enrichment (fast)
    console.log(`[OPTIMIZED-SCHEDULES-${requestId}] Calling schedulesService.findAll...`);
    const schedulesStart = Date.now();
    const schedules = await this.schedulesService.findAll({
      ...options,
      liveStatus: false, // Skip expensive live status enrichment
    });
    console.log(`[OPTIMIZED-SCHEDULES-${requestId}] schedulesService.findAll completed in ${Date.now() - schedulesStart}ms, got ${schedules.length} schedules`);

    console.log(`[OPTIMIZED-SCHEDULES] Got ${schedules.length} schedules in ${Date.now() - startTime}ms`);

    // If live status is requested, enrich using background cache (fast)
    if (options.liveStatus) {
      console.log(`[OPTIMIZED-SCHEDULES-${requestId}] Enriching ${schedules.length} schedules with live status...`);
      const enrichStart = Date.now();
      const enrichedSchedules = await this.enrichWithCachedLiveStatus(schedules);
      console.log(`[OPTIMIZED-SCHEDULES-${requestId}] Enrichment completed in ${Date.now() - enrichStart}ms`);
      console.log(`[OPTIMIZED-SCHEDULES-${requestId}] Total time: ${Date.now() - startTime}ms`);
      return enrichedSchedules;
    }

    console.log(`[OPTIMIZED-SCHEDULES] Total time: ${Date.now() - startTime}ms`);
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
    console.log(`[OPTIMIZED-SCHEDULES] Getting live status for channels:`, channelIds);
    const liveStatusMap = await this.liveStatusBackgroundService.getLiveStatusForChannels(channelIds);
    console.log(`[OPTIMIZED-SCHEDULES] Live status map size:`, liveStatusMap.size);
    console.log(`[OPTIMIZED-SCHEDULES] Live status map entries:`, Array.from(liveStatusMap.entries()));

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
          console.log(`[OPTIMIZED-SCHEDULES] Checking live streams cache for ${channelId}: ${liveStreamsKey}`);
          const cachedLiveStreams = await this.redisService.get<string>(liveStreamsKey);
          console.log(`[OPTIMIZED-SCHEDULES] Cached live streams for ${channelId}:`, cachedLiveStreams);
          
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
          // Program is live but no live stream found
          enrichedSchedule.program = {
            ...schedule.program,
            is_live: true,
            stream_url: schedule.program.stream_url || schedule.program.youtube_url,
            live_streams: [],
            stream_count: 0,
          };
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
