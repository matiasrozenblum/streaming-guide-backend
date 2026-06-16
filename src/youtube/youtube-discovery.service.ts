import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class YoutubeDiscoveryService {
  private readonly apiKey = process.env.YOUTUBE_API_KEY;

  async getChannelIdFromHandle(handle: string): Promise<{
    channelId: string;
    title: string;
  } | null> {
    // Ensure handle has @ prefix for better search results
    const query = handle.startsWith('@') ? handle : `@${handle}`;

    const response = await axios.get(
      'https://www.googleapis.com/youtube/v3/search',
      {
        params: {
          part: 'snippet',
          q: query,
          type: 'channel',
          key: this.apiKey,
          maxResults: 1,
          regionCode: 'AR',
        },
      },
    );

    const item = response.data.items?.[0];
    if (!item) return null;

    return {
      channelId: item.snippet.channelId,
      title: item.snippet.title,
    };
  }

  async getChannelIdsFromLiveUrls(
    urls: string[],
  ): Promise<{ handle: string; channelId: string; title: string }[]> {
    const results: { handle: string; channelId: string; title: string }[] = [];

    // Process in batches of 5 to stay within API quota while gaining concurrency
    const BATCH_SIZE = 5;
    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const batch = urls.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (url) => {
          const match = url.match(/youtube\.com\/@([^/]+)\/live/);
          if (!match) return null;
          const handle = `@${match[1]}`;
          const channel = await this.getChannelIdFromHandle(handle);
          return channel ? { handle, ...channel } : null;
        }),
      );
      for (const result of batchResults) {
        if (result) results.push(result);
      }
    }

    return results;
  }
}
