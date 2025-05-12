import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    loginLegacy: jest.fn(),
    loginUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'BACKOFFICE_PASSWORD':
                  return 'admin123';
                case 'PUBLIC_PASSWORD':
                  return 'public123';
                default:
                  return null;
              }
            }),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-token'),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('loginLegacy', () => {
    it('should return JWT token for valid credentials', async () => {
      const mockToken = { access_token: 'test-token' };
      mockAuthService.loginLegacy.mockResolvedValue(mockToken);

      const result = await controller.loginLegacy({ password: 'admin123', isBackoffice: true });

      expect(result).toEqual(mockToken);
      expect(authService.loginLegacy).toHaveBeenCalledWith('admin123', true);
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      mockAuthService.loginLegacy.mockRejectedValue(new UnauthorizedException('Invalid legacy password'));

      await expect(controller.loginLegacy({ password: 'wrong-password', isBackoffice: true }))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('loginUser', () => {
    it('should return JWT token for valid credentials', async () => {
      const mockToken = { access_token: 'test-token' };
      mockAuthService.loginUser.mockResolvedValue(mockToken);

      const result = await controller.loginUser({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toEqual(mockToken);
      expect(authService.loginUser).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      mockAuthService.loginUser.mockRejectedValue(new UnauthorizedException('Invalid credentials'));

      await expect(controller.loginUser({
        email: 'test@example.com',
        password: 'wrong-password',
      })).rejects.toThrow(UnauthorizedException);
    });
  });
}); 