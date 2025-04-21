import { Inject, Injectable, forwardRef, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import * as cron from 'node-cron';
import * as redis from 'redis';
import dayjs from 'dayjs';
import { SchedulesService } from '../schedules/schedules.service';

@Injectable()
export class YoutubeLiveService implements OnModuleInit {
  private readonly apiKey = process.env.YOUTUBE_API_KEY;
  private readonly apiUrl = 'https://www.googleapis.com/youtube/v3';
  private readonly redisClient = redis.createClient();

  constructor(
    @Inject(forwardRef(() => SchedulesService))
    private readonly schedulesService: SchedulesService,
  ) {}

  async onModuleInit() {
    // Conectar a Redis
    await this.redisClient.connect();
    console.log('✅ Redis client connected');

    // Ahora sí iniciar el cron job
    cron.schedule('0,30 * * * *', async () => {
      try {
        console.log('🚀 Fetching YouTube live video IDs...');
        await this.fetchLiveVideoIds();
      } catch (error) {
        console.error('❌ Error running fetchLiveVideoIds:', error);
      }
    });
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
      console.error(`❌ Error fetching live video ID for channel ${channelId}:`, error);
      return null;
    }
  }

  private async fetchLiveVideoIds() {
    const currentDay = dayjs().tz('America/Argentina/Buenos_Aires').format('dddd').toLowerCase();

    const schedules = await this.schedulesService.findByDay(currentDay);
    const liveSchedules = schedules.filter(schedule => schedule.program.is_live);

    for (const schedule of liveSchedules) {
      try {
        const videoId = await this.getLiveVideoId(schedule.program.channel.youtube_channel_id);
        if (videoId) {
          await this.redisClient.setEx(`videoId:${schedule.program.id}`, 1800, videoId); // 30 min
          console.log(`✅ Cached videoId for program ${schedule.program.id}`);
        }
      } catch (error) {
        console.error(`❌ Failed to fetch/caching video ID for program ${schedule.program.id}:`, error);
      }
    }
  }
}
