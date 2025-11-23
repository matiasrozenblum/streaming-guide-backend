import { Test, TestingModule } from '@nestjs/testing';
import { TokenRefreshController } from './token-refresh.controller';
import { TokenRefreshService } from './token-refresh.service';

describe('TokenRefreshController', () => {
  let controller: TokenRefreshController;
  let tokenRefreshService: TokenRefreshService;

  const mockTokenRefreshService = {
    refreshTwitchToken: jest.fn(),
    refreshKickToken: jest.fn(),
    getTwitchAccessToken: jest.fn(),
    getKickAccessToken: jest.fn(),
    checkAndRefreshTokens: jest.fn(),
    getTwitchTokenStatus: jest.fn(),
    getKickTokenStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TokenRefreshController],
      providers: [
        {
          provide: TokenRefreshService,
          useValue: mockTokenRefreshService,
        },
      ],
    }).compile();

    controller = module.get<TokenRefreshController>(TokenRefreshController);
    tokenRefreshService = module.get<TokenRefreshService>(TokenRefreshService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('refreshTwitchToken', () => {
    it('should successfully refresh Twitch token', async () => {
      mockTokenRefreshService.refreshTwitchToken.mockResolvedValue(true);
      mockTokenRefreshService.getTwitchAccessToken.mockResolvedValue('new-twitch-token-1234567890');

      const result = await controller.refreshTwitchToken();

      expect(result).toEqual({
        success: true,
        message: 'Twitch token refreshed successfully',
        tokenPreview: 'new-twitch-token-123...',
      });
      expect(mockTokenRefreshService.refreshTwitchToken).toHaveBeenCalled();
    });

    it('should return failure message when refresh fails', async () => {
      mockTokenRefreshService.refreshTwitchToken.mockResolvedValue(false);

      const result = await controller.refreshTwitchToken();

      expect(result).toEqual({
        success: false,
        message: 'Failed to refresh Twitch token. Check logs for details.',
      });
    });
  });

  describe('refreshKickToken', () => {
    it('should successfully refresh Kick token', async () => {
      mockTokenRefreshService.refreshKickToken.mockResolvedValue(true);
      mockTokenRefreshService.getKickAccessToken.mockResolvedValue('new-kick-token-abcdefghij');

      const result = await controller.refreshKickToken();

      expect(result).toEqual({
        success: true,
        message: 'Kick token refreshed successfully',
        tokenPreview: 'new-kick-token-abcde...',
      });
      expect(mockTokenRefreshService.refreshKickToken).toHaveBeenCalled();
    });

    it('should return failure message when refresh fails', async () => {
      mockTokenRefreshService.refreshKickToken.mockResolvedValue(false);

      const result = await controller.refreshKickToken();

      expect(result).toEqual({
        success: false,
        message: 'Failed to refresh Kick token. Check logs for details.',
      });
    });
  });

  describe('refreshAllTokens', () => {
    it('should refresh both Twitch and Kick tokens', async () => {
      mockTokenRefreshService.refreshTwitchToken.mockResolvedValue(true);
      mockTokenRefreshService.refreshKickToken.mockResolvedValue(true);

      const result = await controller.refreshAllTokens();

      expect(result).toEqual({
        twitch: {
          success: true,
          message: 'Twitch token refreshed successfully',
        },
        kick: {
          success: true,
          message: 'Kick token refreshed successfully',
        },
      });
      expect(mockTokenRefreshService.refreshTwitchToken).toHaveBeenCalled();
      expect(mockTokenRefreshService.refreshKickToken).toHaveBeenCalled();
    });

    it('should handle partial failures', async () => {
      mockTokenRefreshService.refreshTwitchToken.mockResolvedValue(true);
      mockTokenRefreshService.refreshKickToken.mockResolvedValue(false);

      const result = await controller.refreshAllTokens();

      expect(result).toEqual({
        twitch: {
          success: true,
          message: 'Twitch token refreshed successfully',
        },
        kick: {
          success: false,
          message: 'Failed to refresh Kick token. Check logs for details.',
        },
      });
    });
  });

  describe('checkAndRefreshTokens', () => {
    it('should force refresh when force=true', async () => {
      mockTokenRefreshService.refreshTwitchToken.mockResolvedValue(true);
      mockTokenRefreshService.refreshKickToken.mockResolvedValue(true);

      const result = await controller.checkAndRefreshTokens('true');

      expect(result).toEqual({
        twitch: {
          refreshed: true,
          message: 'Twitch token refreshed',
        },
        kick: {
          refreshed: true,
          message: 'Kick token refreshed',
        },
      });
      expect(mockTokenRefreshService.refreshTwitchToken).toHaveBeenCalled();
      expect(mockTokenRefreshService.refreshKickToken).toHaveBeenCalled();
    });

    it('should use smart refresh when force is not true', async () => {
      mockTokenRefreshService.checkAndRefreshTokens.mockResolvedValue(undefined);
      mockTokenRefreshService.getTwitchAccessToken.mockResolvedValue('twitch-token');
      mockTokenRefreshService.getKickAccessToken.mockResolvedValue('kick-token');

      const result = await controller.checkAndRefreshTokens('false');

      expect(result).toEqual({
        twitch: {
          refreshed: true,
          message: 'Twitch token is valid',
        },
        kick: {
          refreshed: true,
          message: 'Kick token is valid',
        },
      });
      expect(mockTokenRefreshService.checkAndRefreshTokens).toHaveBeenCalled();
    });

    it('should handle missing tokens', async () => {
      mockTokenRefreshService.checkAndRefreshTokens.mockResolvedValue(undefined);
      mockTokenRefreshService.getTwitchAccessToken.mockResolvedValue(null);
      mockTokenRefreshService.getKickAccessToken.mockResolvedValue(null);

      const result = await controller.checkAndRefreshTokens();

      expect(result).toEqual({
        twitch: {
          refreshed: false,
          message: 'No Twitch token available',
        },
        kick: {
          refreshed: false,
          message: 'No Kick token available',
        },
      });
    });
  });

  describe('getTokenStatus', () => {
    it('should return token status for both services', async () => {
      const twitchStatus = {
        hasToken: true,
        tokenPreview: 'twitch-token-123...',
        expiresAt: '2025-03-20T10:30:00.000Z',
        daysUntilExpiry: 45,
        ageInDays: 15,
      };

      const kickStatus = {
        hasToken: true,
        tokenPreview: 'kick-token-abc...',
        expiresAt: '2025-03-18T14:20:00.000Z',
        daysUntilExpiry: 43,
        ageInDays: 17,
      };

      mockTokenRefreshService.getTwitchTokenStatus.mockResolvedValue(twitchStatus);
      mockTokenRefreshService.getKickTokenStatus.mockResolvedValue(kickStatus);

      const result = await controller.getTokenStatus();

      expect(result).toEqual({
        twitch: twitchStatus,
        kick: kickStatus,
      });
      expect(mockTokenRefreshService.getTwitchTokenStatus).toHaveBeenCalled();
      expect(mockTokenRefreshService.getKickTokenStatus).toHaveBeenCalled();
    });

    it('should handle missing tokens', async () => {
      mockTokenRefreshService.getTwitchTokenStatus.mockResolvedValue({ hasToken: false });
      mockTokenRefreshService.getKickTokenStatus.mockResolvedValue({ hasToken: false });

      const result = await controller.getTokenStatus();

      expect(result).toEqual({
        twitch: { hasToken: false },
        kick: { hasToken: false },
      });
    });
  });
});

