import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as cron from 'node-cron';
import * as redis from 'redis';
import { getRepository } from 'typeorm';
import { Program } from '../programs/programs.entity';
import { LessThanOrEqual, MoreThan } from 'typeorm';
import dayjs from 'dayjs';

@Injectable()
export class YoutubeLiveService {
  private readonly apiKey = process.env.YOUTUBE_API_KEY;
  private readonly apiUrl = 'https://www.googleapis.com/youtube/v3';
  private readonly redisClient = redis.createClient();

  constructor() {
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
    const programRepository = getRepository(Program);
    const now = dayjs().format('HH:mm:ss');

    // Get live programs
    const livePrograms = await programRepository.find({
      where: {
        is_live: true,
        start_time: LessThanOrEqual(now),
        end_time: MoreThan(now),
      },
    });

    for (const program of livePrograms) {
      try {
        const videoId = await this.getLiveVideoId(program.channel.youtube_channel_id);
        if (videoId) {
          // Cache the video ID
          this.redisClient.setEx(`videoId:${program.id}`, 1800, videoId); // Cache for 30 minutes
        }
      } catch (error) {
        console.error(`Failed to fetch video ID for program ${program.id}:`, error);
      }
    }
  }
} 