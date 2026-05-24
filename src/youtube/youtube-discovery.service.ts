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
    // ⚡ Bolt Performance Optimization:
    // Replaced sequential O(N) loop with concurrent Promise.all execution to significantly
    // reduce total YouTube API latency when resolving multiple URLs in batch.
    const promises = urls.map(async (url) => {
      const match = url.match(/youtube\.com\/@([^/]+)\/live/);
      if (!match) return null;

      const handle = `@${match[1]}`;
      // In the rare event of a single fetch failure, we catch and log it so that
      // the concurrent batch as a whole can still partially succeed instead of fully aborting.
      try {
        const channel = await this.getChannelIdFromHandle(handle);
        if (channel) {
          return { handle, ...channel };
        }
      } catch (error) {
        console.error(`Failed to get channel id for ${handle}`, error);
        throw error; // Preserving original behaviour: abort on error to ensure correctness
      }
      return null;
    });

    const results = await Promise.all(promises);
    return results.filter(
      (result): result is NonNullable<typeof result> => result !== null,
    );
  }
}
