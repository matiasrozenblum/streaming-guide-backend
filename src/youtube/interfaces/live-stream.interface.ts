export interface LiveStream {
  videoId: string;
  title: string;
  publishedAt: string;
  description: string;
  thumbnailUrl?: string;
  channelTitle?: string;
}

export interface LiveStreamsResult {
  streams: LiveStream[];
  primaryVideoId: string | null;
  streamCount: number;
}
