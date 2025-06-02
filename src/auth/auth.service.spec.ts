import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let usersService: UsersService;

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
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findByEmail: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
    usersService = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('loginUser', () => {
    it('should return JWT token for valid credentials', async () => {
      const mockToken = 'test-token';

      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
      jest.spyOn(jwtService, 'sign').mockReturnValue(mockToken);

      const result = await service.loginUser('test@example.com', 'password123');

      expect(result).toEqual({ access_token: mockToken });
      expect(usersService.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed_password');
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        type: 'public',
        role: mockUser.role,
        gender: mockUser.gender,
        birthDate: mockUser.birthDate.toISOString().split('T')[0],
        name: mockUser.firstName + ' ' + mockUser.lastName,
        email: mockUser.email,
      });
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null);

      await expect(service.loginUser('test@example.com', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for incorrect password', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

      await expect(service.loginUser('test@example.com', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('signJwtForIdentifier', () => {
    it('should return JWT token for valid identifier', async () => {
      const mockToken = 'test-token';

      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(jwtService, 'sign').mockReturnValue(mockToken);

      const result = await service.signJwtForIdentifier('test@example.com');

      expect(result).toBe(mockToken);
      expect(usersService.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        type: 'public',
        role: mockUser.role,
        gender: mockUser.gender,
        birthDate: mockUser.birthDate.toISOString().split('T')[0],
        name: mockUser.firstName + ' ' + mockUser.lastName,
        email: mockUser.email,
      });
    });

    it('should throw UnauthorizedException for invalid identifier', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null);

      await expect(service.signJwtForIdentifier('nonexistent@example.com')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('signRegistrationToken', () => {
    it('should return registration token', () => {
      const mockToken = 'test-token';
      jest.spyOn(jwtService, 'sign').mockReturnValue(mockToken);

      const result = service.signRegistrationToken('test@example.com');

      expect(result).toBe(mockToken);
      expect(jwtService.sign).toHaveBeenCalledWith(
        { email: 'test@example.com', type: 'registration' },
        { expiresIn: '1h' },
      );
    });
  });

  describe('verifyRegistrationToken', () => {
    it('should return email for valid token', () => {
      const mockPayload = { email: 'test@example.com', type: 'registration' };
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);

      const result = service.verifyRegistrationToken('valid-token');

      expect(result).toEqual({ email: 'test@example.com' });
      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
    });

    it('should throw UnauthorizedException for invalid token', () => {
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error();
      });

      expect(() => service.verifyRegistrationToken('invalid-token')).toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for token with wrong type', () => {
      const mockPayload = { email: 'test@example.com', type: 'wrong-type' };
      jest.spyOn(jwtService, 'verify').mockReturnValue(mockPayload);

      expect(() => service.verifyRegistrationToken('wrong-type-token')).toThrow(
        UnauthorizedException,
      );
    });
  });
}); 