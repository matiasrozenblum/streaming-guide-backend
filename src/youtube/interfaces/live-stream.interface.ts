export interface LiveStream {
  videoId: string;
  title: string;
  publishedAt: string;
  description: string;
  thumbnailUrl?: string;
  channelTitle?: string;
  liveBroadcastContent?: string; // 'live', 'upcoming', or 'none'
}

export interface LiveStreamsResult {
  streams: LiveStream[];
  primaryVideoId: string | null;
  streamCount: number;
}
