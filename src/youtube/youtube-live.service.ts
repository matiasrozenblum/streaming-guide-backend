import { Injectable, Inject, forwardRef } from '@nestjs/common';
import axios from 'axios';
import * as cron from 'node-cron';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import * as DateHolidays from 'date-holidays';

import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '../config/config.service';
import { getCurrentBlockTTL } from '@/utils/getBlockTTL.util';

const HolidaysClass = (DateHolidays as any).default ?? DateHolidays;

@Injectable()
export class YoutubeLiveService {
  private readonly apiKey = process.env.YOUTUBE_API_KEY;
  private readonly apiUrl = 'https://www.googleapis.com/youtube/v3';

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => SchedulesService))
    private readonly schedulesService: SchedulesService,
    private readonly redisService: RedisService,
  ) {
    dayjs.extend(utc);
    dayjs.extend(timezone);

    console.log('🚀 YoutubeLiveService initialized');
    
    // Main cron: runs every hour at :00
    cron.schedule('0 * * * *', () => this.fetchLiveVideoIds('main'), {
      timezone: 'America/Argentina/Buenos_Aires',
    });
    
    // Back-to-back fix cron: runs 7 minutes after each hour to catch overlapping programs
    cron.schedule('7 * * * *', () => this.fetchLiveVideoIds('back-to-back-fix'), {
      timezone: 'America/Argentina/Buenos_Aires',
    });
  }

  /**
   * Notify connected clients about live status changes
   */
  private async notifyLiveStatusChange(channelId: string, videoId: string | null, channelName: string) {
    try {
      // Store the notification in Redis for SSE clients to pick up
      const notification = {
        type: 'live_status_change',
        channelId,
        videoId,
        channelName,
        timestamp: Date.now(),
      };
      
      await this.redisService.set(
        `live_notification:${channelId}:${Date.now()}`,
        JSON.stringify(notification),
        300 // 5 minutes TTL
      );
      
      console.log(`📡 Notified clients about live status change for ${channelName}: ${videoId || 'no video'}`);
    } catch (error) {
      console.error('Failed to notify live status change:', error);
    }
  }

  /**
   * Devuelve videoId | null | '__SKIPPED__' según estado de flags, cache y fetch
   */
  async getLiveVideoId(
    channelId: string,
    handle: string,
    blockTTL: number,
    context: 'cron' | 'onDemand',
  ): Promise<string | null | '__SKIPPED__'> {
    // gating centralizado
    if (!(await this.configService.canFetchLive(handle))) {
      console.log(`[YouTube] fetch skipped for ${handle}`);
      return '__SKIPPED__';
    }

    const liveKey = `liveVideoIdByChannel:${channelId}`;
    const notFoundKey = `videoIdNotFound:${channelId}`;

    // skip rápido si ya está marcado como no-found
    if (await this.redisService.get<string>(notFoundKey)) {
      console.log(`🚫 Skipping ${handle}, marked as not-found`);
      return '__SKIPPED__';
    }

    // cache-hit: reuse si sigue vivo
    const cachedId = await this.redisService.get<string>(liveKey);
    if (cachedId && (await this.isVideoLive(cachedId))) {
      console.log(`🔁 Reusing cached videoId for ${handle}`);
      return cachedId;
    }
    if (cachedId) {
      await this.redisService.del(liveKey);
      console.log(`🗑️ Deleted cached videoId for ${handle} (no longer live)`);
    }

    // fetch a YouTube
    try {
      const { data } = await axios.get(`${this.apiUrl}/search`, {
        params: {
          part: 'snippet',
          channelId,
          eventType: 'live',
          type: 'video',
          key: this.apiKey,
        },
      });
      const videoId = data.items?.[0]?.id?.videoId ?? null;

      if (!videoId) {
        console.log(`🚫 No live video for ${handle} (${context})`);
        await this.redisService.set(notFoundKey, '1', 900);
        return null;
      }

      await this.redisService.set(liveKey, videoId, blockTTL);
      console.log(`📌 Cached ${handle} → ${videoId} (TTL ${blockTTL}s)`);

      // Notify clients about the new video ID
      if (context === 'cron') {
        await this.notifyLiveStatusChange(channelId, videoId, handle);
      }

      return videoId;
    } catch (err) {
      console.error(`❌ Error fetching live video for ${handle}:`, err.message || err);
      return null;
    }
  }

  private async isVideoLive(videoId: string): Promise<boolean> {
    try {
      const resp = await axios.get(`${this.apiUrl}/videos`, {
        params: { part: 'snippet', id: videoId, key: this.apiKey },
      });
      return resp.data.items?.[0]?.snippet?.liveBroadcastContent === 'live';
    } catch {
      return false;
    }
  }

  /**
   * Itera canales con programación hoy y llama a getLiveVideoId
   */
  async fetchLiveVideoIds(cronType: 'main' | 'back-to-back-fix' = 'main') {
    const cronLabel = cronType === 'main' ? '🕐 MAIN CRON' : '🔄 BACK-TO-BACK FIX CRON';
    const currentTime = dayjs().tz('America/Argentina/Buenos_Aires').format('HH:mm:ss');
    
    console.log(`${cronLabel} started at ${currentTime}`);
    
    const today = dayjs().tz('America/Argentina/Buenos_Aires')
                        .format('dddd')
                        .toLowerCase();
  
    // 1) Primero traés y enriquecés los schedules
    const rawSchedules = await this.schedulesService.findByDay(today);
    const schedules    = await this.schedulesService.enrichSchedules(rawSchedules);
  
    // 2) Filtrás sólo los "on-air" right now
    const liveNow = schedules.filter(s => s.program.is_live);
  
    // 3) Deduplicás canales de esos schedules
    const map = new Map<string,string>();
    for (const s of liveNow) {
      const ch = s.program.channel;
      if (ch?.youtube_channel_id && ch.handle) {
        map.set(ch.youtube_channel_id, ch.handle);
      }
    }
  
    console.log(`${cronLabel} - Channels to refresh: ${map.size}`);
    
    let updatedCount = 0;
    for (const [cid, handle] of map.entries()) {
      const beforeCache = cronType === 'back-to-back-fix' ? await this.redisService.get<string>(`liveVideoIdByChannel:${cid}`) : null;
      
      const ttl = await getCurrentBlockTTL(cid, rawSchedules);
      const result = await this.getLiveVideoId(cid, handle, ttl, 'cron');
      
      // Track if the back-to-back fix cron actually updated a video ID
      if (cronType === 'back-to-back-fix' && result && result !== '__SKIPPED__') {
        const afterCache = await this.redisService.get<string>(`liveVideoIdByChannel:${cid}`);
        if (beforeCache && afterCache && beforeCache !== afterCache) {
          updatedCount++;
          console.log(`🔧 ${cronLabel} - FIXED back-to-back issue for ${handle}: ${beforeCache} → ${afterCache}`);
        }
      }
    }
    
    if (cronType === 'back-to-back-fix') {
      console.log(`${cronLabel} completed - ${updatedCount} channels updated (back-to-back fixes detected)`);
    } else {
      console.log(`${cronLabel} completed`);
    }
  }
}
