import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class YoutubeDiscoveryService {
  private readonly apiKey = process.env.YOUTUBE_API_KEY;
  private readonly apiUrl = 'https://www.googleapis.com/youtube/v3';

  async getChannelIdsFromLiveUrls(urls: string[]): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    
    for (const url of urls) {
      const handle = url.split('@')[1].split('/')[0];
      try {
        const response = await axios.get(`${this.apiUrl}/search`, {
          params: {
            part: 'snippet',
            q: handle,
            type: 'channel',
            key: this.apiKey,
          },
        });
        
        if (response.data.items?.[0]?.id?.channelId) {
          results[url] = response.data.items[0].id.channelId;
        }
      } catch (error) {
        console.error(`Error fetching channel ID for ${handle}:`, error);
      }
    }
    
    return results;
  }
} 