import { Test, TestingModule } from '@nestjs/testing';
import { TokenRefreshScheduler } from './token-refresh.scheduler';
import { TokenRefreshService } from './token-refresh.service';

describe('TokenRefreshScheduler', () => {
  let scheduler: TokenRefreshScheduler;
  let tokenRefreshService: TokenRefreshService;

  const mockTokenRefreshService = {
    checkAndRefreshTokens: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenRefreshScheduler,
        {
          provide: TokenRefreshService,
          useValue: mockTokenRefreshService,
        },
      ],
    }).compile();

    scheduler = module.get<TokenRefreshScheduler>(TokenRefreshScheduler);
    tokenRefreshService = module.get<TokenRefreshService>(TokenRefreshService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(scheduler).toBeDefined();
  });

  describe('handleTokenRefresh', () => {
    it('should call checkAndRefreshTokens', async () => {
      mockTokenRefreshService.checkAndRefreshTokens.mockResolvedValue(undefined);

      await scheduler.handleTokenRefresh();

      expect(mockTokenRefreshService.checkAndRefreshTokens).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Test error');
      mockTokenRefreshService.checkAndRefreshTokens.mockRejectedValue(error);

      // Should not throw
      await expect(scheduler.handleTokenRefresh()).resolves.not.toThrow();
      expect(mockTokenRefreshService.checkAndRefreshTokens).toHaveBeenCalled();
    });
  });
});




