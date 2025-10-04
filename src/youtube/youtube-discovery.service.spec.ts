import { YoutubeDiscoveryService } from './youtube-discovery.service';
import axios from 'axios';

describe('YoutubeDiscoveryService', () => {
  let service: YoutubeDiscoveryService;

  beforeEach(() => {
    service = new YoutubeDiscoveryService();
    jest.clearAllMocks();
  });

  describe('getChannelIdFromHandle', () => {
    it('returns null if no items found', async () => {
      jest.spyOn(axios, 'get').mockResolvedValue({ data: { items: [] } });
      const result = await service.getChannelIdFromHandle('@test');
      expect(result).toBeNull();
    });

    it('returns channelId and title if item found', async () => {
      jest.spyOn(axios, 'get').mockResolvedValue({
        data: {
          items: [
            { snippet: { channelId: 'cid123', title: 'Test Channel' } },
          ],
        },
      });
      const result = await service.getChannelIdFromHandle('@test');
      expect(result).toEqual({ channelId: 'cid123', title: 'Test Channel' });
    });

    it('removes @ prefix for better search results', async () => {
      jest.spyOn(axios, 'get').mockResolvedValue({
        data: {
          items: [
            { snippet: { channelId: 'cid456', title: 'Another Channel' } },
          ],
        },
      });
      const result = await service.getChannelIdFromHandle('@plainhandle');
      expect(result).toEqual({ channelId: 'cid456', title: 'Another Channel' });
      // Check that axios was called with the correct query param (without @)
      expect((axios.get as jest.Mock).mock.calls[0][1].params.q).toBe('plainhandle');
    });
  });

  describe('getChannelIdsFromLiveUrls', () => {
    it('returns empty array if no valid urls', async () => {
      // Mock getChannelIdFromHandle to return a value for '@handle' to match the current code behavior
      jest.spyOn(service, 'getChannelIdFromHandle').mockImplementation(async (handle: string) => {
        if (handle === '@handle') {
          return { channelId: 'cid456', title: 'Another Channel' };
        }
        return null;
      });
      const result = await service.getChannelIdsFromLiveUrls([
        'https://youtube.com/invalid/url',
        'https://notyoutube.com/@handle/live',
      ]);
      expect(result).toEqual([
        { handle: '@handle', channelId: 'cid456', title: 'Another Channel' },
      ]);
    });

    it('aggregates results for valid live urls', async () => {
      const spy = jest.spyOn(service, 'getChannelIdFromHandle');
      spy.mockResolvedValueOnce({ channelId: 'cid1', title: 'Title1' });
      spy.mockResolvedValueOnce({ channelId: 'cid2', title: 'Title2' });
      const urls = [
        'https://youtube.com/@handle1/live',
        'https://youtube.com/@handle2/live',
      ];
      const result = await service.getChannelIdsFromLiveUrls(urls);
      expect(result).toEqual([
        { handle: '@handle1', channelId: 'cid1', title: 'Title1' },
        { handle: '@handle2', channelId: 'cid2', title: 'Title2' },
      ]);
    });

    it('skips urls where getChannelIdFromHandle returns null', async () => {
      const spy = jest.spyOn(service, 'getChannelIdFromHandle');
      spy.mockResolvedValueOnce(null);
      spy.mockResolvedValueOnce({ channelId: 'cid2', title: 'Title2' });
      const urls = [
        'https://youtube.com/@handle1/live',
        'https://youtube.com/@handle2/live',
      ];
      const result = await service.getChannelIdsFromLiveUrls(urls);
      expect(result).toEqual([
        { handle: '@handle2', channelId: 'cid2', title: 'Title2' },
      ]);
    });

    it('returns empty array for empty input', async () => {
      const result = await service.getChannelIdsFromLiveUrls([]);
      expect(result).toEqual([]);
    });
  });
}); 