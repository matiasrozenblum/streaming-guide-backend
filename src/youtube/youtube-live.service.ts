import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import axios from 'axios';
import * as cron from 'node-cron';
import * as dayjs from 'dayjs';
import { SchedulesService } from '../schedules/schedules.service';

@Injectable()
export class YoutubeLiveService {
  private readonly apiKey = process.env.YOUTUBE_API_KEY;
  private readonly apiUrl = 'https://www.googleapis.com/youtube/v3';

  constructor(
    @Inject(forwardRef(() => SchedulesService))
    private readonly schedulesService: SchedulesService,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {
    console.log('🚀 Redis connected: ', this.cacheManager['store']);
    // Schedule the task to run every 30 minutes
    cron.schedule('0,30 * * * *', () => this.fetchLiveVideoIds());
  }

  async getLiveVideoId(channelId: string): Promise<string | null> {
    try {
      const response = await axios.get(`${this.apiUrl}/search`, {
        params: {
          part: 'snippet',
          channelId,
          eventType: 'live',
          type: 'video',
          key: this.apiKey,
        },
      });
      
      return response.data.items?.[0]?.id?.videoId || null;
    } catch (error) {
      console.error(`Error fetching live video ID for channel ${channelId}:`, error);
      return null;
    }
  }

  async fetchLiveVideoIds() {
    const currentDay = dayjs().tz('America/Argentina/Buenos_Aires').format('dddd').toLowerCase();

    // Fetch today's schedule
    const schedules = await this.schedulesService.findByDay(currentDay);

    // Filter live programs using is_live property
    const liveSchedules = schedules.filter(schedule => schedule.program.is_live);

    for (const schedule of liveSchedules) {
      try {
        const channelId = schedule.program.channel?.youtube_channel_id;
        if (!channelId) {
          console.warn(`Program ${schedule.program.id} has no YouTube channel ID.`);
          continue;
        }

        const videoId = await this.getLiveVideoId(channelId);
        if (videoId) {
          // Cache the video ID using cache-manager
          await this.cacheManager.set(`videoId:${schedule.program.id}`, videoId, 1800); // 30 minutes TTL
          console.log(`Cached video ID for program ${schedule.program.id}: ${videoId}`);
        } else {
          console.warn(`No live video ID found for program ${schedule.program.id}`);
        }
      } catch (error) {
        console.error(`Failed to fetch video ID for program ${schedule.program.id}:`, error);
      }
    }
  }
}

