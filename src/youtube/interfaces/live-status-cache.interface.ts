/**
 * Unified Live Status Cache Interface
 * This replaces both liveStreamsByChannel and liveStatusByHandle cache entries
 */
export interface LiveStream {
  videoId: string;
  title: string;
  publishedAt: string;
  description: string;
  thumbnailUrl?: string;
  channelTitle?: string;
  liveBroadcastContent?: string; // 'live', 'upcoming', or 'none'
}

export interface LiveStatusCache {
  channelId: string;
  handle: string;
  isLive: boolean;
  streamUrl: string | null;
  videoId: string | null;
  lastUpdated: number;
  ttl: number;
  // Block-aware fields for accurate timing
  blockEndTime: number; // When the current block ends (in minutes)
  validationCooldown: number; // When we can validate again (timestamp)
  lastValidation: number; // Last time we validated the video ID
  // Stream details (unified with liveStreamsByChannel)
  streams: LiveStream[];
  streamCount: number;
}

/**
 * Helper to create minimal LiveStatusCache from LiveStreamsResult
 * Used when schedules/blockEndTime are not available
 */
export function createLiveStatusCacheFromStreams(
  channelId: string,
  handle: string,
  streamsResult: { streams: LiveStream[]; primaryVideoId: string | null; streamCount: number },
  ttl: number
): LiveStatusCache {
  const hasStreams = streamsResult.streams && streamsResult.streams.length > 0;
  return {
    channelId,
    handle,
    isLive: hasStreams,
    streamUrl: hasStreams && streamsResult.primaryVideoId
      ? `https://www.youtube.com/embed/${streamsResult.primaryVideoId}?autoplay=1`
      : null,
    videoId: streamsResult.primaryVideoId || null,
    lastUpdated: Date.now(),
    ttl,
    blockEndTime: 24 * 60, // End of day (will be enriched by background service if needed)
    validationCooldown: Date.now() + (30 * 60 * 1000), // 30 min default cooldown
    lastValidation: Date.now(),
    streams: streamsResult.streams || [],
    streamCount: streamsResult.streamCount || 0,
  };
}

/**
 * Helper to extract LiveStreamsResult from LiveStatusCache
 * For backward compatibility during migration
 */
export function extractLiveStreamsResult(cache: LiveStatusCache): {
  streams: LiveStream[];
  primaryVideoId: string | null;
  streamCount: number;
} {
  return {
    streams: cache.streams || [],
    primaryVideoId: cache.videoId || null,
    streamCount: cache.streamCount || 0,
  };
}

