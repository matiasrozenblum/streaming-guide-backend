import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;

  const mockAuthService = {
    loginLegacy: jest.fn(),
    loginUser: jest.fn(),
    signJwtForIdentifier: jest.fn(),
    signRegistrationToken: jest.fn(),
    verifyRegistrationToken: jest.fn(),
  };

  const mockOtpService = {
    sendCode: jest.fn(),
    verifyCode: jest.fn(),
  };

  const mockUsersService = {
    findByEmail: jest.fn(),
    create: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
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
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
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

      const mockRequest = {
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/91.0' }
      };

      const result = await controller.loginUser(mockRequest, {
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toEqual(mockToken);
      expect(authService.loginUser).toHaveBeenCalledWith('test@example.com', 'password123', 'Mozilla/5.0 Chrome/91.0', undefined);
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      mockAuthService.loginUser.mockRejectedValue(new UnauthorizedException('Invalid credentials'));

      const mockRequest = {
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/91.0' }
      };

      await expect(controller.loginUser(mockRequest, {
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
    it('should return JWT token for existing user', async () => {
      const identifier = 'test@example.com';
      const code = '123456';
      const mockToken = 'test-token';
      const mockUser = { id: 1, role: 'user' };
      
      mockOtpService.verifyCode.mockResolvedValue(undefined);
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockAuthService.signJwtForIdentifier.mockResolvedValue(mockToken);

      const mockRequest = {
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/91.0' }
      };

      const result = await controller.verifyCode(mockRequest, { identifier, code });

      expect(result).toEqual({ access_token: mockToken, isNew: false });
      expect(mockOtpService.verifyCode).toHaveBeenCalledWith(identifier, code);
      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(identifier);
      expect(mockAuthService.signJwtForIdentifier).toHaveBeenCalledWith(identifier);
    });

    it('should return registration token for new user', async () => {
      const identifier = 'new@example.com';
      const code = '123456';
      const mockRegToken = 'reg-token';
      
      mockOtpService.verifyCode.mockResolvedValue(undefined);
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockAuthService.signRegistrationToken.mockReturnValue(mockRegToken);

      const mockRequest = {
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/91.0' }
      };

      const result = await controller.verifyCode(mockRequest, { identifier, code });

      expect(result).toEqual({ registration_token: mockRegToken, isNew: true });
      expect(mockOtpService.verifyCode).toHaveBeenCalledWith(identifier, code);
      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(identifier);
      expect(mockAuthService.signRegistrationToken).toHaveBeenCalledWith(identifier);
    });

    it('should throw BadRequestException when identifier or code is missing', async () => {
      const mockRequest = {
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/91.0' }
      };

      await expect(controller.verifyCode(mockRequest, { identifier: '', code: '' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('register', () => {
    it('should complete registration and return JWT token', async () => {
      const dto = {
        registration_token: 'valid-token',
        firstName: 'John',
        lastName: 'Doe',
        password: 'password123',
        gender: 'male' as const
      };
      const mockUser = { id: 1, role: 'user' };
      const mockToken = 'test-token';

      mockAuthService.verifyRegistrationToken.mockReturnValue({ email: 'test@example.com' });
      mockUsersService.create.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue(mockToken);

      const mockRequest = {
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/91.0' }
      };

      const result = await controller.register(mockRequest, dto);

      expect(result).toEqual({ access_token: mockToken });
      expect(mockAuthService.verifyRegistrationToken).toHaveBeenCalledWith(dto.registration_token);
      expect(mockUsersService.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        firstName: dto.firstName,
        lastName: dto.lastName,
        password: dto.password,
        gender: dto.gender,
      });
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        type: 'public',
        role: mockUser.role,
      });
    });

    it('should throw UnauthorizedException for invalid registration token', async () => {
      const dto = {
        registration_token: 'invalid-token',
        firstName: 'John',
        lastName: 'Doe',
        password: 'password123',
        gender: 'male' as const
      };

      mockAuthService.verifyRegistrationToken.mockImplementation(() => {
        throw new UnauthorizedException('Invalid registration token');
      });

      const mockRequest = {
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/91.0' }
      };

      await expect(controller.register(mockRequest, dto))
        .rejects.toThrow(UnauthorizedException);
    });
  });
}); 