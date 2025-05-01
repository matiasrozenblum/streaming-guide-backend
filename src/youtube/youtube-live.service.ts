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
   * Devuelve:
   * - videoId si hay que usarlo
   * - null si no se encontró
   * - '__SKIPPED__' si la llamada fue deshabilitada por flag/feriado
   */
  async getLiveVideoId(
    channelId: string,
    slug: string,
    blockTTL: number,
    context: 'cron' | 'onDemand',
  ): Promise<string | null | '__SKIPPED__'> {
    // 0) gating: feature-flag por canal y feriado
    const enabled = await this.configService.isYoutubeFetchEnabledFor(slug);
    if (!enabled) {
      console.log(`[YouTube] fetch disabled by config for ${slug}`);
      return '__SKIPPED__';
    }
    const isHoliday = !!this.hd.isHoliday(new Date());
    if (isHoliday) {
      console.log(`[YouTube] hoy es feriado en Argentina`);
      const override = await this.configService.getBoolean(`youtube.fetch_override_holiday.${slug}`);
      if (!override) {
        console.log(`[YouTube] hoy es feriado en AR, skipping ${slug}`);
        return '__SKIPPED__';
      }
    }

    const liveKey = `liveVideoIdByChannel:${channelId}`;
    const notFoundKey = `videoIdNotFound:${channelId}`;

    // 1) si marcamos no-found, skip rápido
    if (await this.redisService.get<string>(notFoundKey)) {
      console.log(`🚫 Skipping ${slug}, marked as not-found`);
      return '__SKIPPED__';
    }

    // 2) cache-hit: reuse si sigue vivo
    const cachedId = await this.redisService.get<string>(liveKey);
    if (cachedId) {
      const stillLive = await this.isVideoLive(cachedId);
      if (stillLive) {
        console.log(`🔁 Reusing cached videoId for ${slug}`);
        return cachedId;
      }
      await this.redisService.del(liveKey);
      console.log(`🗑️ Deleted cached videoId for ${slug} (no longer live)`);
    }

    // 3) fetch a YouTube
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
      const videoId = data.items?.[0]?.id?.videoId || null;

      if (!videoId) {
        console.log(`🚫 No live video for ${slug} (${context})`);
        await this.redisService.set(notFoundKey, '1', 900);
        return null;
      }

      await this.redisService.set(liveKey, videoId, blockTTL);
      console.log(`📌 Cached ${slug} → ${videoId} (TTL ${blockTTL}s)`);

      await this.incrementCounter(channelId, context);
      return videoId;
    } catch (err) {
      console.error(`❌ Error fetching live video for ${slug}:`, err.message || err);
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

  /** Solo agrupa canales y delega a getLiveVideoId */
  async fetchLiveVideoIds() {
    const today = dayjs().tz('America/Argentina/Buenos_Aires').format('dddd').toLowerCase();
    const schedules = await this.schedulesService.findByDay(today);
    if (!schedules.length) {
      console.warn('⚠️ No schedules for today');
      return;
    }

    // map<channelId,slug>
    const map = new Map<string,string>();
    for (const s of schedules) {
      const ch = s.program.channel;
      if (ch?.youtube_channel_id && ch.slug) {
        map.set(ch.youtube_channel_id, ch.slug);
      }
    }

    console.log(`🎯 Channels to refresh: ${map.size}`);
    for (const [cid, slug] of map.entries()) {
      const ttl = await getCurrentBlockTTL(cid, schedules);
      await this.getLiveVideoId(cid, slug, ttl, 'cron');
    }
  }
}