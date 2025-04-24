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
    cron.schedule('0 * * * *', () => this.fetchLiveVideoIds());
  }

  private async incrementRequestCount(programId: number, isCron: boolean) {
    const prefix = isCron ? 'cron' : 'onDemand';
    const date = dayjs().format('YYYY-MM-DD');
    const globalKey = `${prefix}:${date}:count`;
    const programKey = `${prefix}:${date}:program:${programId}:count`;
    await Promise.all([
      this.redisService.incr(globalKey),
      this.redisService.incr(programKey),
    ]);
  }

  async getLiveVideoId(channelId: string, programId: number, isCron: boolean): Promise<string | null> {
    const notFoundKey = `videoIdNotFound:${channelId}`;
    const alreadyNotFound = await this.redisService.get<string>(notFoundKey);
    if (alreadyNotFound) {
      console.log(`🚫 Skipping fetch for channel ${channelId}, marked as not-found`);
      return '__SKIPPED__';
    }

    await this.incrementRequestCount(programId, isCron);

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

      const videoId = response.data.items?.[0]?.id?.videoId || null;

      if (!videoId) {
        await this.redisService.set(notFoundKey, '1', 900); // 15 min TTL
        return null;
      }

      const liveVideoKey = `liveVideoIdByChannel:${channelId}`;
      const cachedVideoId = await this.redisService.get<string>(liveVideoKey);
      if (!cachedVideoId) {
        await this.redisService.set(liveVideoKey, videoId, 86400); // 1 día
        console.log(`📌 Stored first live video ID for channel ${channelId}: ${videoId}`);
      } else if (cachedVideoId !== videoId) {
        console.log(`🔁 Channel ${channelId} changed video ID from ${cachedVideoId} to ${videoId}`);
      }

      return videoId;
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
      const program = schedule.program;
      const channelId = program.channel?.youtube_channel_id;

      if (!channelId) {
        console.warn(`⚠️ Program ${program.id} has no YouTube channel ID.`);
        continue;
      }

      if (channelsProcessed.has(channelId)) {
        console.log(`🔄 Skipping duplicate channel ${channelId}`);
        continue;
      }

      channelsProcessed.add(channelId);

      try {
        const videoId = await this.getLiveVideoId(channelId, program.id, true);
        if (videoId && videoId !== '__SKIPPED__') {
          const start = this.convertTimeToMinutes(schedule.start_time);
          const end = this.convertTimeToMinutes(schedule.end_time);
          const durationMinutes = end >= start ? end - start : (24 * 60 - start + end);
          const ttl = durationMinutes + 60;
          await this.redisService.set(`videoId:${program.id}`, videoId, ttl * 60);
          console.log(`✅ Cached video ID for program ${program.id}: ${videoId}`);
        }
      } catch (error) {
        console.error(`❌ Error fetching video ID for program ${program.id}:`, error);
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
