/**
 * Streamer Live Status Cache Interface
 * Stores live status for streamers across multiple services (Twitch, Kick)
 */
export interface StreamerServiceStatus {
  service: 'twitch' | 'kick' | 'youtube';
  isLive: boolean;
  lastUpdated: number;
  username?: string; // Channel username for the service
}

export interface StreamerLiveStatusCache {
  streamerId: number;
  isLive: boolean; // True if ANY service is live
  services: StreamerServiceStatus[]; // Status for each service
  lastUpdated: number;
  ttl: number;
}

