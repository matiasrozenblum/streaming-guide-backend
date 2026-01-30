import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StreamerLiveStatusService } from './streamer-live-status.service';
import { RedisService } from '../redis/redis.service';
import { StreamerLiveStatusCache } from './interfaces/streamer-live-status-cache.interface';

describe('StreamerLiveStatusService', () => {
  let service: StreamerLiveStatusService;
  let redisService: RedisService;

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('mock-kick-token'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StreamerLiveStatusService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<StreamerLiveStatusService>(StreamerLiveStatusService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateLiveStatus', () => {
    it('should create new cache entry when none exists', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await service.updateLiveStatus(1, 'twitch', true, 'testuser');

      expect(mockRedisService.set).toHaveBeenCalledWith(
        'streamer:live-status:1',
        expect.objectContaining({
          streamerId: 1,
          isLive: true,
          services: expect.arrayContaining([
            expect.objectContaining({
              service: 'twitch',
              isLive: true,
              username: 'testuser',
            }),
          ]),
        }),
        604800
      );
    });

    it('should update existing cache entry', async () => {
      const existingCache: StreamerLiveStatusCache = {
        streamerId: 1,
        isLive: false,
        services: [
          {
            service: 'twitch',
            isLive: false,
            lastUpdated: Date.now() - 1000,
            username: 'testuser',
          },
        ],
        lastUpdated: Date.now() - 1000,
        ttl: 604800,
      };

      mockRedisService.get.mockResolvedValue(existingCache);

      await service.updateLiveStatus(1, 'twitch', true, 'testuser');

      expect(mockRedisService.set).toHaveBeenCalledWith(
        'streamer:live-status:1',
        expect.objectContaining({
          streamerId: 1,
          isLive: true, // Should be true now
          services: expect.arrayContaining([
            expect.objectContaining({
              service: 'twitch',
              isLive: true,
            }),
          ]),
        }),
        604800
      );
    });

    it('should add new service to existing cache', async () => {
      const existingCache: StreamerLiveStatusCache = {
        streamerId: 1,
        isLive: false,
        services: [
          {
            service: 'twitch',
            isLive: false,
            lastUpdated: Date.now() - 1000,
            username: 'testuser',
          },
        ],
        lastUpdated: Date.now() - 1000,
        ttl: 604800,
      };

      mockRedisService.get.mockResolvedValue(existingCache);

      await service.updateLiveStatus(1, 'kick', true, 'kickuser');

      expect(mockRedisService.set).toHaveBeenCalledWith(
        'streamer:live-status:1',
        expect.objectContaining({
          services: expect.arrayContaining([
            expect.objectContaining({ service: 'twitch' }),
            expect.objectContaining({ service: 'kick', isLive: true }),
          ]),
          isLive: true, // Should be true if any service is live
        }),
        604800
      );
    });
  });

  describe('getLiveStatus', () => {
    it('should return cached status', async () => {
      const cache: StreamerLiveStatusCache = {
        streamerId: 1,
        isLive: true,
        services: [
          {
            service: 'twitch',
            isLive: true,
            lastUpdated: Date.now(),
            username: 'testuser',
          },
        ],
        lastUpdated: Date.now(),
        ttl: 604800,
      };

      mockRedisService.get.mockResolvedValue(cache);

      const result = await service.getLiveStatus(1);

      expect(result).toEqual(cache);
      expect(mockRedisService.get).toHaveBeenCalledWith('streamer:live-status:1');
    });

    it('should return null when no cache exists', async () => {
      mockRedisService.get.mockResolvedValue(null);

      const result = await service.getLiveStatus(1);

      expect(result).toBeNull();
    });
  });

  describe('getLiveStatuses', () => {
    it('should return map of live statuses for multiple streamers', async () => {
      const cache1: StreamerLiveStatusCache = {
        streamerId: 1,
        isLive: true,
        services: [],
        lastUpdated: Date.now(),
        ttl: 604800,
      };

      const cache2: StreamerLiveStatusCache = {
        streamerId: 2,
        isLive: false,
        services: [],
        lastUpdated: Date.now(),
        ttl: 604800,
      };

      mockRedisService.get
        .mockResolvedValueOnce(cache1)
        .mockResolvedValueOnce(cache2);

      const result = await service.getLiveStatuses([1, 2]);

      expect(result.size).toBe(2);
      expect(result.get(1)).toEqual(cache1);
      expect(result.get(2)).toEqual(cache2);
    });
  });

  describe('clearLiveStatus', () => {
    it('should delete cache entry', async () => {
      await service.clearLiveStatus(1);

      expect(mockRedisService.del).toHaveBeenCalledWith('streamer:live-status:1');
    });
  });

  describe('initializeCache', () => {
    it('should create initial cache entry with all services', async () => {
      const services = [
        { service: 'twitch' as const, url: 'https://twitch.tv/test', username: 'test' },
        { service: 'kick' as const, url: 'https://kick.com/test', username: 'kickuser' },
      ];

      await service.initializeCache(1, services);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        'streamer:live-status:1',
        expect.objectContaining({
          streamerId: 1,
          isLive: false,
          services: expect.arrayContaining([
            expect.objectContaining({ service: 'twitch', isLive: false }),
            expect.objectContaining({ service: 'kick', isLive: false }),
          ]),
        }),
        604800
      );
    });
  });
});

