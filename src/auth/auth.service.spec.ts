import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let usersService: UsersService;

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockUsersService = {
    findByEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: UsersService, useValue: mockUsersService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
    usersService = module.get<UsersService>(UsersService);
  });

  describe('loginLegacy', () => {
    it('should return JWT token for valid backoffice password', async () => {
      const mockToken = { access_token: 'test-token' };
      mockConfigService.get.mockReturnValue('admin123');
      mockJwtService.sign.mockReturnValue('test-token');

      const result = await service.loginLegacy('admin123', true);

      expect(result).toEqual(mockToken);
      expect(mockConfigService.get).toHaveBeenCalledWith('BACKOFFICE_PASSWORD');
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'backoffice',
        type: 'backoffice',
      });
    });

    it('should return JWT token for valid public password', async () => {
      const mockToken = { access_token: 'test-token' };
      mockConfigService.get.mockReturnValue('public123');
      mockJwtService.sign.mockReturnValue('test-token');

      const result = await service.loginLegacy('public123', false);

      expect(result).toEqual(mockToken);
      expect(mockConfigService.get).toHaveBeenCalledWith('PUBLIC_PASSWORD');
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: 'public',
        type: 'public',
      });
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      mockConfigService.get.mockReturnValue('correct-password');

      await expect(service.loginLegacy('wrong-password', true))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('loginUser', () => {
    it('should return JWT token for valid credentials', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: 'hashedPassword',
        role: 'user',
      };
      const mockToken = { access_token: 'test-token' };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('test-token');

      const result = await service.loginUser('test@example.com', 'password123');

      expect(result).toEqual(mockToken);
      expect(mockUsersService.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(mockJwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        role: mockUser.role,
      });
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(service.loginUser('nonexistent@example.com', 'password123'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        password: 'hashedPassword',
        role: 'user',
      };

      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      jest.spyOn(require('bcrypt'), 'compare').mockResolvedValue(false);

      await expect(service.loginUser('test@example.com', 'wrong-password'))
        .rejects.toThrow(UnauthorizedException);
    });
  });
}); 