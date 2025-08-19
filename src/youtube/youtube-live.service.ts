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
import { SentryService } from '../sentry/sentry.service';
import { getCurrentBlockTTL } from '@/utils/getBlockTTL.util';

const HolidaysClass = (DateHolidays as any).default ?? DateHolidays;

// New interface for live streams with metadata
interface LiveStream {
  videoId: string;
  title: string;
  description: string;
  publishedAt: string;
  isLive: boolean;
  channelId: string;
}

// Interface for stream matching results
interface StreamMatch {
  videoId: string;
  confidence: number; // 0-100
  matchType: 'time' | 'title' | 'hybrid';
  stream: LiveStream;
}

@Injectable()
export class YoutubeLiveService {
  private readonly apiKey = process.env.YOUTUBE_API_KEY;
  private readonly apiUrl = 'https://www.googleapis.com/youtube/v3';
  


  constructor(
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => SchedulesService))
    private readonly schedulesService: SchedulesService,
    private readonly redisService: RedisService,
    private readonly sentryService: SentryService,
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
   * Migrate existing single video ID cache to new multiple streams structure
   * This ensures backward compatibility during deployment
   */
  private async migrateLegacyCache(channelId: string, handle: string): Promise<void> {
    try {
      const legacyKey = `liveVideoIdByChannel:${channelId}`;
      const newKey = `liveStreamsByChannel:${channelId}`;
      
      // Check if legacy cache exists and new cache doesn't
      const legacyVideoId = await this.redisService.get<string>(legacyKey);
      const newStreams = await this.redisService.get<LiveStream[]>(newKey);
      
      if (legacyVideoId && !newStreams) {
        console.log(`🔄 Migrating legacy cache for ${handle}: ${legacyVideoId}`);
        
        // Create a basic LiveStream object from legacy data
        const legacyStream: LiveStream = {
          videoId: legacyVideoId,
          title: 'Legacy Stream', // We don't have this info
          description: 'Migrated from legacy cache',
          publishedAt: new Date().toISOString(),
          isLive: true,
          channelId,
        };
        
        // Store in new format
        await this.redisService.set(newKey, [legacyStream], 3600); // 1 hour TTL
        
        console.log(`✅ Migration completed for ${handle}`);
      }
    } catch (error) {
      console.error(`❌ Migration failed for ${handle}:`, error);
    }
  }

  /**
   * Get the best matching live stream for a program
   */
  async getBestLiveStreamMatch(
    channelId: string,
    handle: string,
    programName: string,
    programStartTime: string,
    blockTTL: number,
    context: 'cron' | 'onDemand',
  ): Promise<string | null | '__SKIPPED__'> {
    // First, try to migrate legacy cache if needed
    await this.migrateLegacyCache(channelId, handle);
    
    // gating centralizado
    if (!(await this.configService.canFetchLive(handle))) {
      console.log(`[YouTube] fetch skipped for ${handle}`);
      return '__SKIPPED__';
    }

    const newKey = `liveStreamsByChannel:${channelId}`;
    const legacyKey = `liveVideoIdByChannel:${channelId}`; // Keep for backward compatibility
    const notFoundKey = `videoIdNotFound:${channelId}`;

    // skip rápido si ya está marcado como no-found
    if (await this.redisService.get<string>(notFoundKey)) {
      console.log(`🚫 Skipping ${handle}, marked as not-found`);
      return '__SKIPPED__';
    }

    // Try new cache first
    let cachedStreams = await this.redisService.get<LiveStream[]>(newKey);
    
    // Fallback to legacy cache if new cache is empty
    if (!cachedStreams || cachedStreams.length === 0) {
      const legacyVideoId = await this.redisService.get<string>(legacyKey);
      if (legacyVideoId && (await this.isVideoLive(legacyVideoId))) {
        console.log(`🔁 Using legacy cache for ${handle}: ${legacyVideoId}`);
        return legacyVideoId;
      }
    }

    // Filter out non-live streams from cache
    if (cachedStreams) {
      cachedStreams = cachedStreams.filter(stream => stream.isLive);
      if (cachedStreams.length > 0) {
        console.log(`🔁 Found ${cachedStreams.length} live streams in cache for ${handle}`);
        const bestMatch = this.findBestStreamMatch(cachedStreams, programName, programStartTime);
        if (bestMatch) {
          console.log(`🎯 Best match found for ${handle}: ${bestMatch.videoId} (confidence: ${bestMatch.confidence}%)`);
          return bestMatch.videoId;
        }
      }
    }



    // Fetch from YouTube if no valid cache and no mock data
    try {
      const { data } = await axios.get(`${this.apiUrl}/search`, {
        params: {
          part: 'snippet',
          channelId,
          eventType: 'live',
          type: 'video',
          key: this.apiKey,
          maxResults: 10, // Increased to capture multiple streams
        },
      });

      if (!data.items || data.items.length === 0) {
        console.log(`🚫 No live videos for ${handle} (${context})`);
        await this.redisService.set(notFoundKey, '1', 900);
        return null;
      }

      // Convert to LiveStream objects
      const liveStreams: LiveStream[] = data.items.map(item => ({
        videoId: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        isLive: true,
        channelId,
      }));

      // Store all streams in new cache
      await this.redisService.set(newKey, liveStreams, blockTTL);
      
      // Also update legacy cache for backward compatibility (first stream)
      if (liveStreams.length > 0) {
        await this.redisService.set(legacyKey, liveStreams[0].videoId, blockTTL);
      }

      console.log(`📌 Cached ${liveStreams.length} live streams for ${handle} (TTL ${blockTTL}s)`);

      // Find best match
      const bestMatch = this.findBestStreamMatch(liveStreams, programName, programStartTime);
      if (bestMatch) {
        console.log(`🎯 Best match found for ${handle}: ${bestMatch.videoId} (confidence: ${bestMatch.confidence}%)`);
        
        // Notify clients about the new video ID
        if (context === 'cron') {
          await this.notifyLiveStatusChange(channelId, bestMatch.videoId, handle);
        }
        
        return bestMatch.videoId;
      }

      // Return first stream if no good match found
      const firstStream = liveStreams[0];
      console.log(`📺 No good match found, using first stream for ${handle}: ${firstStream.videoId}`);
      return firstStream.videoId;

    } catch (err) {
      const errorMessage = err.message || err;
      console.error(`❌ Error fetching live video for ${handle}:`, errorMessage);
      
      // Enhanced error reporting with Sentry
      const is403Error = errorMessage.includes('403') || errorMessage.includes('forbidden');
      const isQuotaError = errorMessage.includes('quota') || errorMessage.includes('exceeded');
      
      if (is403Error) {
        this.sentryService.captureMessage(
          `YouTube API 403 Forbidden for channel ${handle}`,
          'error',
          {
            channelId,
            handle,
            context,
            errorMessage,
            apiUrl: `${this.apiUrl}/search`,
            timestamp: new Date().toISOString(),
          }
        );
        
        // Set tags for better alerting
        this.sentryService.setTag('service', 'youtube-api');
        this.sentryService.setTag('error_type', '403_forbidden');
        this.sentryService.setTag('channel', handle);
      } else if (isQuotaError) {
        this.sentryService.captureMessage(
          `YouTube API quota exceeded for channel ${handle}`,
          'warning',
          {
            channelId,
            handle,
            context,
            errorMessage,
            timestamp: new Date().toISOString(),
          }
        );
        
        this.sentryService.setTag('service', 'youtube-api');
        this.sentryService.setTag('error_type', 'quota_exceeded');
        this.sentryService.setTag('channel', handle);
      } else {
        // Capture other errors
        this.sentryService.captureException(err as Error, {
          channelId,
          handle,
          context,
          apiUrl: `${this.apiUrl}/search`,
        });
      }
      
      return null;
    }
  }

  /**
   * Find the best matching stream for a program
   */
  private findBestStreamMatch(
    streams: LiveStream[],
    programName: string,
    programStartTime: string
  ): StreamMatch | null {
    if (streams.length === 0) return null;
    if (streams.length === 1) {
      return {
        videoId: streams[0].videoId,
        confidence: 100,
        matchType: 'time',
        stream: streams[0],
      };
    }

    const matches: StreamMatch[] = [];

    for (const stream of streams) {
      let confidence = 0;
      let matchType: 'time' | 'title' | 'hybrid' = 'time';

      // Time-based matching (primary)
      const timeConfidence = this.calculateTimeConfidence(stream.publishedAt, programStartTime);
      confidence = timeConfidence;
      matchType = 'time';

      // Title-based matching (secondary)
      const titleConfidence = this.calculateTitleConfidence(stream.title, programName);
      
      // Hybrid scoring: combine time and title
      const hybridConfidence = Math.round((timeConfidence * 0.7) + (titleConfidence * 0.3));
      
      if (hybridConfidence > confidence) {
        confidence = hybridConfidence;
        matchType = 'hybrid';
      }

      matches.push({
        videoId: stream.videoId,
        confidence,
        matchType,
        stream,
      });
    }

    // Sort by confidence and return best match
    matches.sort((a, b) => b.confidence - a.confidence);
    const bestMatch = matches[0];

    // Only return if confidence is above threshold
    return bestMatch.confidence >= 50 ? bestMatch : null;
  }

  /**
   * Calculate confidence based on time proximity
   */
  private calculateTimeConfidence(publishedAt: string, programStartTime: string): number {
    try {
      const published = dayjs(publishedAt);
      const programStart = dayjs(`2000-01-01 ${programStartTime}`);
      
      // Calculate minutes difference
      const diffMinutes = Math.abs(published.diff(programStart, 'minute'));
      
      // Higher confidence for closer times
      if (diffMinutes <= 5) return 100;
      if (diffMinutes <= 15) return 90;
      if (diffMinutes <= 30) return 75;
      if (diffMinutes <= 60) return 50;
      return 25;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Calculate confidence based on title similarity
   */
  private calculateTitleConfidence(streamTitle: string, programName: string): number {
    const streamLower = streamTitle.toLowerCase();
    const programLower = programName.toLowerCase();
    
    // Extract key terms (teams, competitions)
    const streamTerms = streamLower.split(/\s+/).filter(term => term.length > 2);
    const programTerms = programLower.split(/\s+/).filter(term => term.length > 2);
    
    let matches = 0;
    let totalTerms = Math.max(streamTerms.length, programTerms.length);
    
    for (const programTerm of programTerms) {
      if (streamTerms.some(streamTerm => 
        streamTerm.includes(programTerm) || programTerm.includes(streamTerm)
      )) {
        matches++;
      }
    }
    
    if (totalTerms === 0) return 0;
    return Math.round((matches / totalTerms) * 100);
  }

  /**
   * Legacy method for backward compatibility
   * @deprecated Use getBestLiveStreamMatch instead
   */
  async getLiveVideoId(
    channelId: string,
    handle: string,
    blockTTL: number,
    context: 'cron' | 'onDemand',
  ): Promise<string | null | '__SKIPPED__'> {
    console.warn(`⚠️ getLiveVideoId is deprecated, use getBestLiveStreamMatch instead`);
    
    // For backward compatibility, we'll use a generic program name
    return this.getBestLiveStreamMatch(
      channelId,
      handle,
      'Generic Program',
      '00:00',
      blockTTL,
      context
    );
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
   * Itera canales con programación hoy y llama a getBestLiveStreamMatch
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
      const result = await this.getBestLiveStreamMatch(
        cid, 
        handle, 
        'Generic Program', // We don't have specific program info in cron
        '00:00',
        ttl, 
        'cron'
      );
      
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
