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

  private async incrementCounter(channelId: string, type: 'cron' | 'onDemand') {
    const date = dayjs().format('YYYY-MM-DD');
    const generalKey = `${type}:count:${date}`;
    const channelKey = `${type}:${channelId}:count:${date}`;

    await this.redisService.incr(generalKey);
    await this.redisService.incr(channelKey);
  }

  async getLiveVideoId(channelId: string, context: 'cron' | 'onDemand'): Promise<string | null | '__SKIPPED__'> {
    const notFoundKey = `videoIdNotFound:${channelId}`;
    const alreadyNotFound = await this.redisService.get<string>(notFoundKey);
    if (alreadyNotFound) {
      console.log(`🚫 Skipping fetch for channel ${channelId}, marked as not-found`);
      return '__SKIPPED__';
    }

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
        await this.redisService.set(notFoundKey, '1', 900);
        return null;
      }

      const liveVideoKey = `liveVideoIdByChannel:${channelId}`;
      const cached = await this.redisService.get<string>(liveVideoKey);
      if (!cached) {
        const firstLiveVideoKey = `firstLiveVideoIdByChannel:${channelId}`;
        await this.redisService.set(firstLiveVideoKey, videoId, 86400);
        console.log(`📌 Stored first live video ID for channel ${channelId}: ${videoId} by ${context}`);
      } else if (cached !== videoId) {
        console.log(`🔁 Channel ${channelId} changed video ID from ${cached} to ${videoId} by ${context}`);
      }
      await this.redisService.set(liveVideoKey, videoId, 86400);
      console.log(`📌 Stored current live video ID for channel ${channelId}: ${videoId} by ${context}`);

      await this.incrementCounter(channelId, context);
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
    if (!schedules?.length) {
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

    const programsByChannel = new Map<string, any[]>();

    for (const schedule of liveOrSoonSchedules) {
      const channelId = schedule.program.channel?.youtube_channel_id;
      if (!channelId) continue;
      if (!programsByChannel.has(channelId)) programsByChannel.set(channelId, []);
      programsByChannel.get(channelId)!.push(schedule);
    }

    for (const [channelId, programGroup] of programsByChannel.entries()) {
      let lastEnd: string | null = null;
      let currentVideoId: string | null | '__SKIPPED__' = null;

      for (const schedule of programGroup.sort((a, b) => a.start_time.localeCompare(b.start_time))) {
        const startNum = this.convertTimeToMinutes(schedule.start_time);
        const endNum = this.convertTimeToMinutes(schedule.end_time);

        const hasGap = lastEnd ? startNum - this.convertTimeToMinutes(lastEnd) >= 2 : true;

        if (!currentVideoId || hasGap) {
          currentVideoId = await this.getLiveVideoId(channelId, 'cron');
        }

        if (currentVideoId && currentVideoId !== '__SKIPPED__') {
          const ttl = (endNum >= startNum ? endNum - startNum : (24 * 60 - startNum + endNum)) + 60;
          await this.redisService.set(`videoId:${schedule.program.id}`, currentVideoId, ttl * 60);
          console.log(`✅ Cached video ID for program ${schedule.program.id}: ${currentVideoId}`);
        }

        lastEnd = schedule.end_time;
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
