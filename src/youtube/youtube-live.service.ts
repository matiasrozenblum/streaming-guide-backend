import { Injectable, Inject, forwardRef } from '@nestjs/common';
import axios from 'axios';
import * as cron from 'node-cron';
import * as dayjs from 'dayjs';
import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class YoutubeLiveService {
  private readonly apiKey = process.env.YOUTUBE_API_KEY;
  private readonly apiUrl = 'https://www.googleapis.com/youtube/v3';

  constructor(
    @Inject(forwardRef(() => SchedulesService))
    private readonly schedulesService: SchedulesService,

    private readonly redisService: RedisService,
  ) {
    console.log('🚀 YoutubeLiveService initialized');
    // Schedule the task to run every hour (at minute 0)
    cron.schedule('0 * * * *', () => this.fetchLiveVideoIds());
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
      const errData = error?.response?.data || error.message || error;
      console.error(`❌ Error fetching live video ID for channel ${channelId}:`, errData);
      return null;
    }
  }

  async fetchLiveVideoIds() {
    const now = dayjs().tz('America/Argentina/Buenos_Aires');
    const currentTimeNum = now.hour() * 100 + now.minute();
    const currentDay = now.format('dddd').toLowerCase();

    const schedules = await this.schedulesService.findByDay(currentDay);

    if (!schedules || schedules.length === 0) {
      console.warn('⚠️ No schedules found for today.');
      return;
    }

    const enrichedSchedules = await this.schedulesService.enrichSchedules(schedules);

    const liveOrSoonSchedules = enrichedSchedules.filter(schedule => {
      const start = this.convertTimeToNumber(schedule.start_time);
      const isToday = schedule.day_of_week === currentDay;
      const startsSoon = isToday && start > currentTimeNum && start <= currentTimeNum + 30;
      return schedule.program.is_live || startsSoon;
    });

    console.log(`🎯 Found ${liveOrSoonSchedules.length} programs live or starting soon.`);

    const channelsProcessed = new Set<string>();

    for (const schedule of liveOrSoonSchedules) {
      const channelId = schedule.program.channel?.youtube_channel_id;
      if (!channelId) {
        console.warn(`⚠️ Program ${schedule.program.id} has no YouTube channel ID.`);
        continue;
      }

      if (!channelsProcessed.has(channelId)) {
        channelsProcessed.add(channelId);

        try {
          const videoId = await this.getLiveVideoId(channelId);
          if (videoId) {
            const start = this.convertTimeToMinutes(schedule.start_time);
            const end = this.convertTimeToMinutes(schedule.end_time);
            const durationMinutes = end >= start ? end - start : (24 * 60 - start + end);
            const ttl = durationMinutes + 60; // Duración + 1h
            await this.redisService.set(`videoId:${schedule.program.id}`, videoId, ttl * 60);
            console.log(`✅ Cached video ID for program ${schedule.program.id}: ${videoId}`);
          } else {
            console.warn(`⚠️ No live video ID found for program ${schedule.program.id}`);
          }
        } catch (error) {
          console.error(`❌ Error fetching video ID for program ${schedule.program.id}:`, error);
        }
      } else {
        console.log(`🔄 Skipping duplicate channel ${channelId}`);
      }
    }
  }

  private convertTimeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }

  private convertTimeToNumber(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 100 + m;
  }
}
