import { Test, TestingModule } from '@nestjs/testing';
import { WebhookSubscriptionService } from './webhook-subscription.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebhookSubscriptionService', () => {
  let service: WebhookSubscriptionService;
  let configService: ConfigService;
  let redisService: RedisService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookSubscriptionService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<WebhookSubscriptionService>(WebhookSubscriptionService);
    configService = module.get<ConfigService>(ConfigService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockedAxios.get.mockClear();
    mockedAxios.post.mockClear();
    mockedAxios.delete.mockClear();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('subscribeToTwitchEventSub', () => {
    it('should subscribe to Twitch EventSub and store subscription ID', async () => {
      mockConfigService.get
        .mockReturnValueOnce('client-id')
        .mockReturnValueOnce('client-secret')
        .mockReturnValueOnce('https://example.com')
        .mockReturnValueOnce('access-token');

      mockedAxios.get.mockResolvedValue({
        data: {
          data: [{ id: 'user-123', login: 'testuser' }],
        },
      });

      mockedAxios.post.mockResolvedValue({
        data: {
          data: [{ id: 'sub-123' }],
        },
      });

      const result = await service.subscribeToTwitchEventSub('testuser', 'stream.online');

      expect(result).toBe('sub-123');
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'webhook:subscription:twitch:testuser:stream.online',
        expect.objectContaining({
          subscriptionId: 'sub-123',
          username: 'testuser',
          eventType: 'stream.online',
        }),
        86400 * 365
      );
    });

    it('should return null when credentials are missing', async () => {
      mockConfigService.get.mockReturnValue(null);

      const result = await service.subscribeToTwitchEventSub('testuser', 'stream.online');

      expect(result).toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should return null when user not found', async () => {
      mockConfigService.get
        .mockReturnValueOnce('client-id')
        .mockReturnValueOnce('client-secret')
        .mockReturnValueOnce('https://example.com')
        .mockReturnValueOnce('access-token');

      mockedAxios.get.mockResolvedValue({
        data: { data: [] },
      });

      const result = await service.subscribeToTwitchEventSub('testuser', 'stream.online');

      expect(result).toBeNull();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribeFromTwitchEventSub', () => {
    it('should unsubscribe from Twitch EventSub', async () => {
      mockConfigService.get
        .mockReturnValueOnce('client-id')
        .mockReturnValueOnce('access-token');

      mockedAxios.delete.mockResolvedValue({ status: 204 });

      const result = await service.unsubscribeFromTwitchEventSub('sub-123');

      expect(result).toBe(true);
      expect(mockedAxios.delete).toHaveBeenCalledWith(
        'https://api.twitch.tv/helix/eventsub/subscriptions?id=sub-123',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Client-ID': 'client-id',
            'Authorization': 'Bearer access-token',
          }),
        })
      );
    });

    it('should return false when credentials are missing', async () => {
      mockConfigService.get.mockReturnValue(null);

      const result = await service.unsubscribeFromTwitchEventSub('sub-123');

      expect(result).toBe(false);
      expect(mockedAxios.delete).not.toHaveBeenCalled();
    });
  });

  describe('subscribeToKickWebhook', () => {
    it('should store subscription info in Redis', async () => {
      mockConfigService.get
        .mockReturnValueOnce('api-key')
        .mockReturnValueOnce('https://example.com');

      const result = await service.subscribeToKickWebhook('testuser');

      expect(result).toBe('pending');
      expect(mockRedisService.set).toHaveBeenCalledWith(
        'webhook:subscription:kick:testuser',
        expect.objectContaining({
          username: 'testuser',
        }),
        86400 * 365
      );
    });
  });

  describe('getSubscriptionsForStreamer', () => {
    it('should return subscriptions for streamer services', async () => {
      const services = [
        { service: 'twitch', url: 'https://twitch.tv/testuser', username: 'testuser' },
        { service: 'kick', url: 'https://kick.com/kickuser', username: 'kickuser' },
      ];

      mockRedisService.get
        .mockResolvedValueOnce({ subscriptionId: 'sub-online-123' })
        .mockResolvedValueOnce({ subscriptionId: 'sub-offline-456' })
        .mockResolvedValueOnce({ subscriptionId: 'kick-sub-789' });

      const result = await service.getSubscriptionsForStreamer(1, services);

      expect(result.twitch).toContain('sub-online-123');
      expect(result.twitch).toContain('sub-offline-456');
      expect(result.kick).toContain('kick-sub-789');
    });
  });
});

