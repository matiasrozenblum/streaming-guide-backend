import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class YoutubeDiscoveryService {
  private readonly apiKey = process.env.YOUTUBE_API_KEY;

  async getChannelIdFromHandle(handle: string): Promise<{
    channelId: string;
    title: string;
  } | null> {
    const query = handle.startsWith('@') ? handle : `@${handle}`;

    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: query,
        type: 'channel',
        key: this.apiKey,
        maxResults: 1,
      },
    });

    const item = response.data.items?.[0];
    if (!item) return null;

    return {
      channelId: item.snippet.channelId,
      title: item.snippet.title,
    };
  }

  async getChannelIdsFromLiveUrls(urls: string[]): Promise<
    { handle: string; channelId: string; title: string }[]
  > {
    const results: { handle: string; channelId: string; title: string }[] = [];

    for (const url of urls) {
      const match = url.match(/youtube\.com\/@([^/]+)\/live/);
      if (!match) continue;

      const handle = `@${match[1]}`;
      const channel = await this.getChannelIdFromHandle(handle);
      if (channel) {
        results.push({ handle, ...channel });
      }
    }

    return results;
  }
}
