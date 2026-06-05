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

    // ⚡ Bolt: Optimize sequential API calls to concurrent batches of 5 to improve throughput
    // while remaining aware of API search quotas
    const batchSize = 5;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batchUrls = urls.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batchUrls.map(async (url) => {
          const match = url.match(/youtube\.com\/@([^/]+)\/live/);
          if (!match) return null;

          const handle = `@${match[1]}`;
          // We intentionally do not catch errors here to preserve the original behavior
          // where an API failure bubbled up to the caller.
          const channel = await this.getChannelIdFromHandle(handle);
          if (channel) {
            return { handle, ...channel };
          }
          return null;
        }),
      );

      for (const result of batchResults) {
        if (result) {
          results.push(result);
        }
      }
    }

    return results;
  }
}
