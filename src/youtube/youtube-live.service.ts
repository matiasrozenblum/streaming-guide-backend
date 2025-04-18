import { Inject, Injectable, forwardRef } from '@nestjs/common';
import axios from 'axios';
import * as cron from 'node-cron';
import * as redis from 'redis';
import dayjs from 'dayjs';
import { SchedulesService } from '../schedules/schedules.service';

@Injectable()
export class YoutubeLiveService {
  private readonly apiKey = process.env.YOUTUBE_API_KEY;
  private readonly apiUrl = 'https://www.googleapis.com/youtube/v3';
  private readonly redisClient = redis.createClient();

  constructor(
    @Inject(forwardRef(() => SchedulesService))
    private readonly schedulesService: SchedulesService,
  ) {
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

  private async fetchLiveVideoIds() {
    const currentDay = dayjs().tz('America/Argentina/Buenos_Aires').format('dddd').toLowerCase();

    // Fetch today's schedule
    const schedules = await this.schedulesService.findByDay(currentDay);

    // Filter live programs using is_live property
    const liveSchedules = schedules.filter(schedule => schedule.program.is_live);

    for (const schedule of liveSchedules) {
      try {
        const videoId = await this.getLiveVideoId(schedule.program.channel.youtube_channel_id);
        if (videoId) {
          // Cache the video ID
          this.redisClient.setEx(`videoId:${schedule.program.id}`, 1800, videoId); // Cache for 30 minutes
        }
      } catch (error) {
        console.error(`Failed to fetch video ID for program ${schedule.program.id}:`, error);
      }
    }
  }

  private timeToNumber(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 100 + minutes;
  }
} 