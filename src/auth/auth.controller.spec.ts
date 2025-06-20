import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;
  let otpService: OtpService;
  let usersService: UsersService;
  let jwtService: JwtService;

  const mockUser = {
    id: 1,
    email: 'test@example.com',
    password: 'hashed_password',
    role: 'user' as const,
    gender: 'male' as const,
    birthDate: new Date('1990-01-01'),
    firstName: 'Test',
    lastName: 'User',
    phone: '+1234567890',
    createdAt: new Date(),
    updatedAt: new Date(),
    isActive: true,
    lastLogin: new Date(),
    devices: [],
    subscriptions: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            loginUser: jest.fn(),
            signJwtForIdentifier: jest.fn(),
            signRegistrationToken: jest.fn(),
            verifyRegistrationToken: jest.fn(),
            buildPayload: jest.fn(),
            signAccessToken: jest.fn(),
            signRefreshToken: jest.fn(),
            verifyRefreshToken: jest.fn(),
          },
        },
        {
          provide: OtpService,
          useValue: {
            sendCode: jest.fn(),
            verifyCode: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            ensureUserDevice: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
    otpService = module.get<OtpService>(OtpService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('loginUser', () => {
    it('should return access and refresh tokens on successful login', async () => {
      const mockTokens = { 
        access_token: 'test-token',
        refresh_token: 'refresh-token'
      };
      jest.spyOn(authService, 'loginUser').mockResolvedValue(mockTokens);

      const result = await controller.loginUser(
        { headers: { 'user-agent': 'test-agent' } },
        { email: 'test@example.com', password: 'password123' }
      );

      expect(result).toEqual(mockTokens);
      expect(authService.loginUser).toHaveBeenCalledWith(
        'test@example.com',
        'password123',
        'test-agent',
        undefined,
      );
    });

    it('should throw UnauthorizedException on failed login', async () => {
      jest
        .spyOn(authService, 'loginUser')
        .mockRejectedValue(new Error('Invalid credentials'));

      await expect(
        controller.loginUser(
          { headers: { 'user-agent': 'test-agent' } },
          { email: 'test@example.com', password: 'wrong-password' }
        ),
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('sendCode', () => {
    it('should send OTP code', async () => {
      const mockResponse = { message: 'Código enviado correctamente' };
      jest.spyOn(otpService, 'sendCode').mockResolvedValue(undefined);

      const result = await controller.sendCode({ identifier: 'test@example.com' });

      expect(result).toEqual(mockResponse);
      expect(otpService.sendCode).toHaveBeenCalledWith('test@example.com');
    });

    it('should throw BadRequestException if identifier is missing', async () => {
      await expect(controller.sendCode({ identifier: '' })).rejects.toThrow(
        'Falta identificador',
      );
    });
  });

  describe('verifyCode', () => {
    it('should return access and refresh tokens for existing user', async () => {
      const mockTokens = { 
        access_token: 'test-token',
        refresh_token: 'refresh-token'
      };

      jest.spyOn(otpService, 'verifyCode').mockResolvedValue(undefined);
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(authService, 'buildPayload').mockReturnValue({
        sub: 1,
        type: 'public',
        role: 'user',
        gender: 'male',
        birthDate: '1990-01-01',
        name: 'Test User',
        email: 'test@example.com'
      });
      jest.spyOn(authService, 'signAccessToken').mockResolvedValue('test-token');
      jest.spyOn(authService, 'signRefreshToken').mockResolvedValue('refresh-token');

      const result = await controller.verifyCode(
        { headers: { 'user-agent': 'test-agent' } },
        { identifier: 'test@example.com', code: '123456' },
      );

      expect(result).toEqual({ 
        access_token: 'test-token', 
        refresh_token: 'refresh-token',
        isNew: false 
      });
    });

    it('should return registration token for new user', async () => {
      jest.spyOn(otpService, 'verifyCode').mockResolvedValue(undefined);
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(authService, 'signRegistrationToken').mockResolvedValue('test-token');

      const result = await controller.verifyCode(
        { headers: { 'user-agent': 'test-agent' } },
        { identifier: 'new@example.com', code: '123456' },
      );

      expect(result).toEqual({ registration_token: 'test-token', isNew: true });
    });
  });

  describe('register', () => {
    it('should complete registration and return access and refresh tokens', async () => {
      const mockTokens = { 
        access_token: 'test-token',
        refresh_token: 'refresh-token'
      };

      jest.spyOn(authService, 'verifyRegistrationToken').mockResolvedValue({ email: 'test@example.com' });
      jest.spyOn(usersService, 'create').mockResolvedValue(mockUser);
      jest.spyOn(usersService, 'ensureUserDevice').mockResolvedValue('test-device-id');
      jest.spyOn(authService, 'buildPayload').mockReturnValue({
        sub: 1,
        type: 'public',
        role: 'user',
        gender: 'male',
        birthDate: '1990-01-01',
        name: 'Test User',
        email: 'test@example.com'
      });
      jest.spyOn(authService, 'signAccessToken').mockResolvedValue('test-token');
      jest.spyOn(authService, 'signRefreshToken').mockResolvedValue('refresh-token');

      const result = await controller.register(
        { headers: { 'user-agent': 'test-agent' } },
        {
          registration_token: 'valid-token',
          firstName: 'Test',
          lastName: 'User',
          password: 'password123',
          gender: 'male',
          birthDate: '1990-01-01',
          deviceId: 'test-device-id'
        },
      );

      expect(result).toEqual(mockTokens);
      expect(usersService.create).toHaveBeenCalled();
      expect(usersService.ensureUserDevice).toHaveBeenCalled();
    });

    it('should throw BadRequestException if gender or birthDate is missing', async () => {
      await expect(
        controller.register(
          { headers: { 'user-agent': 'test-agent' } },
          {
            registration_token: 'valid-token',
            firstName: 'Test',
            lastName: 'User',
            password: 'password123',
            gender: 'male',
          },
        ),
      ).rejects.toThrow('Género y fecha de nacimiento son obligatorios');
    });
  });

  describe('refreshToken', () => {
    it('should return new access and refresh tokens', async () => {
      const mockTokens = {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token'
      };

      jest.spyOn(authService, 'verifyRefreshToken').mockResolvedValue({
        sub: 1,
        type: 'public',
        role: 'user',
        gender: 'male',
        birthDate: '1990-01-01',
        name: 'Test User',
        email: 'test@example.com'
      });
      jest.spyOn(usersService, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(authService, 'signAccessToken').mockResolvedValue('new-access-token');
      jest.spyOn(authService, 'signRefreshToken').mockResolvedValue('new-refresh-token');

      const result = await controller.refreshToken({
        headers: { authorization: 'Bearer valid-refresh-token' }
      });

      expect(result).toEqual(mockTokens);
    });

    it('should throw UnauthorizedException if no refresh token provided', async () => {
      await expect(
        controller.refreshToken({
          headers: {}
        })
      ).rejects.toThrow('No refresh token provided');
    });

    it('should throw UnauthorizedException if refresh token is invalid', async () => {
      jest.spyOn(authService, 'verifyRefreshToken').mockRejectedValue(new Error('Invalid token'));

      await expect(
        controller.refreshToken({
          headers: { authorization: 'Bearer invalid-token' }
        })
      ).rejects.toThrow('Invalid refresh token');
    });
  });
}); 