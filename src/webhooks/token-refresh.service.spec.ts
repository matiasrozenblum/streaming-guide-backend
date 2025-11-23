import { Test, TestingModule } from '@nestjs/testing';
import { TokenRefreshService } from './token-refresh.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TokenRefreshService', () => {
  let service: TokenRefreshService;
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
        TokenRefreshService,
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

    service = module.get<TokenRefreshService>(TokenRefreshService);
    configService = module.get<ConfigService>(ConfigService);
    redisService = module.get<RedisService>(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockedAxios.post.mockClear();
  });

  describe('getTwitchAccessToken', () => {
    it('should return token from Redis cache if available and not expired', async () => {
      const cachedToken = {
        accessToken: 'cached-twitch-token',
        expiresAt: Date.now() + 86400000, // 1 day from now
        refreshedAt: Date.now(),
      };

      mockRedisService.get.mockResolvedValue(cachedToken);

      const token = await service.getTwitchAccessToken();

      expect(token).toBe('cached-twitch-token');
      expect(mockRedisService.get).toHaveBeenCalledWith('token:twitch:app_access');
      expect(mockConfigService.get).not.toHaveBeenCalled();
    });

    it('should return token from env var if Redis cache is empty', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue('env-twitch-token');
      mockRedisService.set.mockResolvedValue(undefined);

      const token = await service.getTwitchAccessToken();

      expect(token).toBe('env-twitch-token');
      expect(mockConfigService.get).toHaveBeenCalledWith('TWITCH_APP_ACCESS_TOKEN');
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should return null if no token is available', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue(null);

      const token = await service.getTwitchAccessToken();

      expect(token).toBeNull();
    });
  });

  describe('getKickAccessToken', () => {
    it('should return token from Redis cache if available and not expired', async () => {
      const cachedToken = {
        accessToken: 'cached-kick-token',
        expiresAt: Date.now() + 86400000,
        refreshedAt: Date.now(),
      };

      mockRedisService.get.mockResolvedValue(cachedToken);

      const token = await service.getKickAccessToken();

      expect(token).toBe('cached-kick-token');
      expect(mockRedisService.get).toHaveBeenCalledWith('token:kick:app_access');
    });

    it('should return token from env var if Redis cache is empty', async () => {
      mockRedisService.get.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue('env-kick-token');
      mockRedisService.set.mockResolvedValue(undefined);

      const token = await service.getKickAccessToken();

      expect(token).toBe('env-kick-token');
      expect(mockConfigService.get).toHaveBeenCalledWith('KICK_APP_ACCESS_TOKEN');
    });
  });

  describe('refreshTwitchToken', () => {
    it('should successfully refresh Twitch token', async () => {
      mockConfigService.get
        .mockReturnValueOnce('twitch-client-id')
        .mockReturnValueOnce('twitch-client-secret');

      const mockResponse = {
        data: {
          access_token: 'new-twitch-token',
          expires_in: 5184000, // 60 days in seconds
        },
      };

      mockedAxios.post.mockResolvedValue(mockResponse);
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.refreshTwitchToken();

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://id.twitch.tv/oauth2/token',
        expect.stringContaining('client_id=twitch-client-id'),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should return false if client credentials are missing', async () => {
      mockConfigService.get.mockReturnValue(null);

      const result = await service.refreshTwitchToken();

      expect(result).toBe(false);
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should return false if API request fails', async () => {
      mockConfigService.get
        .mockReturnValueOnce('twitch-client-id')
        .mockReturnValueOnce('twitch-client-secret');

      mockedAxios.post.mockRejectedValue(new Error('API Error'));

      const result = await service.refreshTwitchToken();

      expect(result).toBe(false);
    });

    it('should return false if response does not contain access_token', async () => {
      mockConfigService.get
        .mockReturnValueOnce('twitch-client-id')
        .mockReturnValueOnce('twitch-client-secret');

      mockedAxios.post.mockResolvedValue({ data: {} });

      const result = await service.refreshTwitchToken();

      expect(result).toBe(false);
    });
  });

  describe('refreshKickToken', () => {
    it('should successfully refresh Kick token', async () => {
      mockConfigService.get
        .mockReturnValueOnce('kick-client-id')
        .mockReturnValueOnce('kick-client-secret');

      const mockResponse = {
        data: {
          access_token: 'new-kick-token',
          expires_in: 5184000, // 60 days in seconds
        },
      };

      mockedAxios.post.mockResolvedValue(mockResponse);
      mockRedisService.set.mockResolvedValue(undefined);

      const result = await service.refreshKickToken();

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://id.kick.com/oauth/token',
        expect.stringContaining('client_id=kick-client-id'),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );
      expect(mockRedisService.set).toHaveBeenCalled();
    });

    it('should return false if client credentials are missing', async () => {
      mockConfigService.get.mockReturnValue(null);

      const result = await service.refreshKickToken();

      expect(result).toBe(false);
    });

    it('should return false if API request fails', async () => {
      mockConfigService.get
        .mockReturnValueOnce('kick-client-id')
        .mockReturnValueOnce('kick-client-secret');

      mockedAxios.post.mockRejectedValue(new Error('API Error'));

      const result = await service.refreshKickToken();

      expect(result).toBe(false);
    });
  });

  describe('checkAndRefreshTokens', () => {
    it('should refresh Twitch token if it needs refreshing', async () => {
      const oldToken = {
        accessToken: 'old-token',
        expiresAt: Date.now() + 86400000,
        refreshedAt: Date.now() - 51 * 24 * 60 * 60 * 1000, // 51 days ago
      };

      mockRedisService.get
        .mockResolvedValueOnce(oldToken) // Twitch token check
        .mockResolvedValueOnce(null); // Kick token check

      mockConfigService.get
        .mockReturnValueOnce('twitch-client-id')
        .mockReturnValueOnce('twitch-client-secret');

      mockedAxios.post.mockResolvedValue({
        data: {
          access_token: 'new-twitch-token',
          expires_in: 5184000,
        },
      });

      mockRedisService.set.mockResolvedValue(undefined);

      await service.checkAndRefreshTokens();

      expect(mockedAxios.post).toHaveBeenCalled();
    });

    it('should not refresh tokens if they are still valid', async () => {
      const recentToken = {
        accessToken: 'recent-token',
        expiresAt: Date.now() + 86400000,
        refreshedAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
      };

      mockRedisService.get
        .mockResolvedValueOnce(recentToken) // Twitch
        .mockResolvedValueOnce(recentToken); // Kick

      await service.checkAndRefreshTokens();

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('getTwitchTokenStatus', () => {
    it('should return token status with expiration info', async () => {
      const cachedToken = {
        accessToken: 'test-token-1234567890',
        expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
        refreshedAt: Date.now() - 10 * 24 * 60 * 60 * 1000, // 10 days ago
      };

      // First call for getTwitchAccessToken, second for getTwitchTokenStatus
      mockRedisService.get
        .mockResolvedValueOnce(cachedToken) // getTwitchAccessToken
        .mockResolvedValueOnce(cachedToken); // getTwitchTokenStatus

      const status = await service.getTwitchTokenStatus();

      expect(status.hasToken).toBe(true);
      expect(status.tokenPreview).toBe('test-token-123456789...');
      expect(status.daysUntilExpiry).toBeGreaterThan(0);
      expect(status.ageInDays).toBeCloseTo(10, 0);
    });

    it('should return hasToken false if no token available', async () => {
      mockRedisService.get
        .mockResolvedValueOnce(null) // getTwitchAccessToken
        .mockResolvedValueOnce(null); // getTwitchTokenStatus
      mockConfigService.get.mockReturnValue(null);

      const status = await service.getTwitchTokenStatus();

      expect(status.hasToken).toBe(false);
    });
  });

  describe('getKickTokenStatus', () => {
    it('should return token status with expiration info', async () => {
      const cachedToken = {
        accessToken: 'kick-token-abcdefghij',
        expiresAt: Date.now() + 25 * 24 * 60 * 60 * 1000, // 25 days from now
        refreshedAt: Date.now() - 15 * 24 * 60 * 60 * 1000, // 15 days ago
      };

      // First call for getKickAccessToken, second for getKickTokenStatus
      mockRedisService.get
        .mockResolvedValueOnce(cachedToken) // getKickAccessToken
        .mockResolvedValueOnce(cachedToken); // getKickTokenStatus

      const status = await service.getKickTokenStatus();

      expect(status.hasToken).toBe(true);
      expect(status.tokenPreview).toBe('kick-token-abcdefghi...');
      expect(status.daysUntilExpiry).toBeGreaterThan(0);
      expect(status.ageInDays).toBeCloseTo(15, 0);
    });
  });
});

