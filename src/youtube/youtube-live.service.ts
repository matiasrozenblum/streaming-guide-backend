import { Injectable, Inject, forwardRef } from '@nestjs/common';
import axios from 'axios';
import * as cron from 'node-cron';
import * as dayjs from 'dayjs';
import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service'; // 🔥 Nuevo

@Injectable()
export class YoutubeLiveService {
  private readonly apiKey = process.env.YOUTUBE_API_KEY;
  private readonly apiUrl = 'https://www.googleapis.com/youtube/v3';

  constructor(
    @Inject(forwardRef(() => SchedulesService))
    private readonly schedulesService: SchedulesService,

    private readonly redisService: RedisService, // 🔥
  ) {
    console.log('🚀 YoutubeLiveService initialized');
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

    const schedules = await this.schedulesService.findByDay(currentDay);
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
          await this.redisService.set(`videoId:${schedule.program.id}`, videoId, 1800); // TTL de 30 min
          console.log(`✅ Cached live video ID for program ${schedule.program.id}: ${videoId}`);
        } else {
          console.warn(`⚠️ No live video ID found for program ${schedule.program.id}`);
        }
      } catch (error) {
        console.error(`Error caching live video ID for program ${schedule.program.id}:`, error);
      }
    }
  }
}
