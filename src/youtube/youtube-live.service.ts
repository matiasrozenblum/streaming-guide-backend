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
  private readonly hd = new HolidaysClass('AR');

  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => SchedulesService))
    private readonly schedulesService: SchedulesService,
    private readonly redisService: RedisService,
  ) {
    dayjs.extend(utc);
    dayjs.extend(timezone);

    console.log('🚀 YoutubeLiveService initialized');
    cron.schedule('0 * * * *', () => this.fetchLiveVideoIds(), {
      timezone: 'America/Argentina/Buenos_Aires',
    });
  }

  private async incrementCounter(channelId: string, type: 'cron' | 'onDemand') {
    const date = dayjs().format('YYYY-MM-DD');
    await this.redisService.incr(`${type}:count:${date}`);
    await this.redisService.incr(`${type}:${channelId}:count:${date}`);
  }

  /**
   * Comprueba si el canal puede hacer fetch hoy (flags + feriado)
   */
  async canFetchLive(handle: string): Promise<boolean> {
    const enabled = await this.configService.isYoutubeFetchEnabledFor(handle);
    if (!enabled) return false;

    const isHoliday = !!this.hd.isHoliday(new Date());
    if (isHoliday) {
      return this.configService.getBoolean(`youtube.fetch_override_holiday.${handle}`);
    }

    return true;
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
    if (!(await this.canFetchLive(handle))) {
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

      await this.incrementCounter(channelId, context);
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
  async fetchLiveVideoIds() {
    const today = dayjs()
      .tz('America/Argentina/Buenos_Aires')
      .format('dddd')
      .toLowerCase();
    const schedules = await this.schedulesService.findByDay(today);
    if (schedules.length === 0) {
      console.warn('⚠️ No schedules for today');
      return;
    }

    const map = new Map<string, string>();
    for (const s of schedules) {
      const ch = s.program.channel;
      if (ch?.youtube_channel_id && ch.handle) {
        map.set(ch.youtube_channel_id, ch.handle);
      }
    }

    console.log(`🎯 Channels to refresh: ${map.size}`);
    for (const [cid, handle] of map.entries()) {
      const ttl = await getCurrentBlockTTL(cid, schedules);
      await this.getLiveVideoId(cid, handle, ttl, 'cron');
    }
  }
}
