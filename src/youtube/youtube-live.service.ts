import { Injectable, Inject, forwardRef } from '@nestjs/common';
import axios from 'axios';
import * as cron from 'node-cron';
import * as dayjs from 'dayjs';
import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';
import { getCurrentBlockTTL } from '@/utils/getBlockTTL.util';

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
    // Se ejecuta cada hora al minuto 0
    cron.schedule('0 * * * *', () => this.fetchLiveVideoIds(), { timezone: 'America/Argentina/Buenos_Aires' });
  }

  private async incrementCounter(channelId: string, type: 'cron' | 'onDemand') {
    const date = dayjs().format('YYYY-MM-DD');
    const generalKey = `${type}:count:${date}`;
    const channelKey = `${type}:${channelId}:count:${date}`;

    await this.redisService.incr(generalKey);
    await this.redisService.incr(channelKey);
  }

  private getEndOfDayTTL(): number {
    // Segundos desde ahora hasta fin de día (23:59:59)
    const now = dayjs();
    const end = now.endOf('day');
    return end.diff(now, 'second');
  }

  async getLiveVideoId(channelId: string, blockTTL: number, context: 'cron' | 'onDemand'): Promise<string | null | '__SKIPPED__'> {
    const liveKey = `liveVideoIdByChannel:${channelId}`;
    const notFoundKey = `videoIdNotFound:${channelId}`;

    // Si ya marcamos como no encontrado recientemente, omitir
    if (await this.redisService.get<string>(notFoundKey)) {
      console.log(`🚫 Skipping fetch for ${channelId}, marked as not-found`);
      return '__SKIPPED__';
    }

   // 1) Intento leer de cache
  let videoId = await this.redisService.get< string >(`liveVideoIdByChannel:${channelId}`);
  
  if (videoId) {
    // 2) Verifico si sigue en vivo
    const isPrivate = await this.isVideoLive(videoId);
    if (!isPrivate) {
      console.log(`🔁 Skipping fetch for ${channelId}, already cached until block end and it's still live`);
      // sigue en vivo, lo devuelvo
      return videoId;
    }
    // si ya no está en vivo, lo borro de cache
    console.log(`🔁 Deleting cached videoId for ${channelId} because it's private`);
    await this.redisService.del(`liveVideoIdByChannel:${channelId}`);
  }


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
        console.log(`🚫 No live video ID found for channel ${channelId} by ${context}`);
        await this.redisService.set(notFoundKey, '1', 900);
        return null;
      }

      // Calcular TTL según duración del bloque ininterrumpido
      await this.redisService.set(liveKey, videoId, blockTTL);
      console.log(`📌 Stored liveVideoIdByChannel:${channelId} = ${videoId} (TTL ${blockTTL}s)`);

      await this.incrementCounter(channelId, context);
      return videoId;
    } catch (err) {
      console.error(`❌ Error fetching live video ID for ${channelId}:`, err.message || err);
      return null;
    }
  }

  async fetchLiveVideoIds() {
    const today = dayjs().tz('America/Argentina/Buenos_Aires').format('dddd').toLowerCase();
    const schedules = await this.schedulesService.findByDay(today);
    if (!schedules.length) {
      console.warn('⚠️ No schedules today');
      return;
    }

    // Agrupar por canal y verificar en vivo o próximo
    const groups = new Map<string, boolean>();
    for (const sched of schedules) {
      const cid = sched.program.channel?.youtube_channel_id;
      if (!cid) continue;
      const live = sched.program.is_live;
      if (live) {
        groups.set(cid, true);
      }
    }

    console.log(`🎯 Channels to refresh: ${groups.size}`);
    for (const cid of groups.keys()) {
      const blockTTL = await getCurrentBlockTTL(cid, schedules);
      await this.getLiveVideoId(cid, blockTTL, 'cron');
    }
  }

  private async isVideoLive(videoId: string): Promise<boolean> {
    try {
      const resp = await axios.get(`${this.apiUrl}/videos`, {
        params: {
          part: 'snippet',
          id: videoId,
          key: this.apiKey,
        },
      });
      const items = resp.data.items as Array<{ snippet?: { liveBroadcastContent?: string } }>;
      if (!items?.length) return false;
      return items[0].snippet?.liveBroadcastContent === 'live';
    } catch (err) {
      // En caso de error (red, parsing, etc.) devolvemos false para forzar re-fetch
      return false;
    }
  }
}