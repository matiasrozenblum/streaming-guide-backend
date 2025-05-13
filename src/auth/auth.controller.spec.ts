import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    loginLegacy: jest.fn(),
    loginUser: jest.fn(),
    signJwtForIdentifier: jest.fn(),
  };

  const mockOtpService = {
    sendCode: jest.fn(),
    verifyCode: jest.fn(),
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
          provide: OtpService,
          useValue: mockOtpService,
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

  describe('sendCode', () => {
    it('should send OTP code successfully', async () => {
      const identifier = 'test@example.com';
      mockOtpService.sendCode.mockResolvedValue(undefined);

      const result = await controller.sendCode({ identifier });

      expect(result).toEqual({ message: 'Código enviado correctamente' });
      expect(mockOtpService.sendCode).toHaveBeenCalledWith(identifier);
    });

    it('should throw BadRequestException when identifier is missing', async () => {
      await expect(controller.sendCode({ identifier: '' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyCode', () => {
    it('should verify code and return JWT token', async () => {
      const identifier = 'test@example.com';
      const code = '123456';
      const mockToken = 'test-token';
      
      mockOtpService.verifyCode.mockResolvedValue(undefined);
      mockAuthService.signJwtForIdentifier.mockResolvedValue(mockToken);

      const result = await controller.verifyCode({ identifier, code });

      expect(result).toEqual({ access_token: mockToken });
      expect(mockOtpService.verifyCode).toHaveBeenCalledWith(identifier, code);
      expect(mockAuthService.signJwtForIdentifier).toHaveBeenCalledWith(identifier);
    });

    it('should throw BadRequestException when identifier or code is missing', async () => {
      await expect(controller.verifyCode({ identifier: '', code: '' }))
        .rejects.toThrow(BadRequestException);
    });
  });
}); 