import { Injectable } from '@nestjs/common';
import { SchedulesService } from '../schedules/schedules.service';
import { LiveStatusBackgroundService } from './live-status-background.service';

@Injectable()
export class OptimizedSchedulesService {
  constructor(
    private readonly schedulesService: SchedulesService,
    private readonly liveStatusBackgroundService: LiveStatusBackgroundService,
  ) {}

  /**
   * Get schedules with optimized live status (uses background cache)
   */
  async getSchedulesWithOptimizedLiveStatus(options: any = {}): Promise<any[]> {
    const startTime = Date.now();
    
    // Get schedules without live status enrichment (fast)
    const schedules = await this.schedulesService.findAll({
      ...options,
      liveStatus: false, // Skip expensive live status enrichment
    });

    console.log(`[OPTIMIZED-SCHEDULES] Got ${schedules.length} schedules in ${Date.now() - startTime}ms`);

    // If live status is requested, enrich using background cache (fast)
    if (options.liveStatus) {
      const enrichStart = Date.now();
      const enrichedSchedules = await this.enrichWithCachedLiveStatus(schedules);
      console.log(`[OPTIMIZED-SCHEDULES] Enriched ${schedules.length} schedules in ${Date.now() - enrichStart}ms`);
      console.log(`[OPTIMIZED-SCHEDULES] Total time: ${Date.now() - startTime}ms`);
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
          // Program is live and has live stream
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
