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
    it('should return access token on successful login', async () => {
      const mockToken = { access_token: 'test-token' };
      jest.spyOn(authService, 'loginUser').mockResolvedValue(mockToken);

      const result = await controller.loginUser(
        { headers: { 'user-agent': 'test-agent' } },
        { email: 'test@example.com', password: 'password123' },
      );

      expect(result).toEqual(mockToken);
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
          { email: 'test@example.com', password: 'wrong-password' },
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
    it('should return access token for existing user', async () => {
      const mockToken = { access_token: 'test-token' };

      jest.spyOn(otpService, 'verifyCode').mockResolvedValue(undefined);
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(authService, 'signJwtForIdentifier').mockResolvedValue('test-token');

      const result = await controller.verifyCode(
        { headers: { 'user-agent': 'test-agent' } },
        { identifier: 'test@example.com', code: '123456' },
      );

      expect(result).toEqual({ access_token: 'test-token', isNew: false });
    });

    it('should return registration token for new user', async () => {
      const mockToken = { registration_token: 'test-token' };

      jest.spyOn(otpService, 'verifyCode').mockResolvedValue(undefined);
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(authService, 'signRegistrationToken').mockReturnValue('test-token');

      const result = await controller.verifyCode(
        { headers: { 'user-agent': 'test-agent' } },
        { identifier: 'new@example.com', code: '123456' },
      );

      expect(result).toEqual({ registration_token: 'test-token', isNew: true });
    });
  });

  describe('register', () => {
    it('should complete registration and return access token', async () => {
      const mockToken = { access_token: 'test-token' };

      jest.spyOn(authService, 'verifyRegistrationToken').mockReturnValue({ email: 'test@example.com' });
      jest.spyOn(usersService, 'create').mockResolvedValue(mockUser);
      jest.spyOn(usersService, 'ensureUserDevice').mockResolvedValue('test-device-id');
      jest.spyOn(jwtService, 'sign').mockReturnValue('test-token');

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

      expect(result).toEqual(mockToken);
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
}); 