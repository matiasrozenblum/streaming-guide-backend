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
    const now = dayjs().tz('America/Argentina/Buenos_Aires');
    const currentDay = now.format('dddd').toLowerCase();
  
    const schedules = await this.schedulesService.findByDay(currentDay);
  
    if (!schedules) {
      console.warn('⚠️ No schedules found for today.');
      return;
    }
  
    // 🔥 Enriquecemos los schedules para que tengan is_live bien seteado
    const enrichedSchedules = await this.schedulesService.enrichSchedules(schedules);
  
    // 🔥 Filtramos solo los que están efectivamente en vivo ahora
    const liveNowSchedules = enrichedSchedules.filter(schedule => schedule.program.is_live);
  
    console.log(`🎯 Found ${liveNowSchedules.length} programs live right now.`);
  
    const channelsProcessed = new Set<string>();
  
    for (const schedule of liveNowSchedules) {
      const channelId = schedule.program.channel?.youtube_channel_id;
      if (!channelId) {
        console.warn(`⚠️ Program ${schedule.program.id} has no YouTube channel ID.`);
        continue;
      }
  
      if (channelsProcessed.has(channelId)) {
        console.log(`🔄 Skipping duplicate channel ${channelId}`);
        continue;
      }
  
      channelsProcessed.add(channelId);
  
      try {
        const videoId = await this.getLiveVideoId(channelId);
        if (videoId) {
          await this.redisService.set(`videoId:${schedule.program.id}`, videoId, 1800); // 30 min TTL
          console.log(`✅ Cached video ID for program ${schedule.program.id}: ${videoId}`);
        } else {
          console.warn(`⚠️ No live video ID found for program ${schedule.program.id}`);
        }
      } catch (error) {
        console.error(`❌ Error fetching video ID for program ${schedule.program.id}:`, error);
      }
    }
  }
  
}
