import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validatePassword', () => {
    it('should return true for correct password', async () => {
      const result = await service.validatePassword('admin123');
      expect(result).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const result = await service.validatePassword('wrong-password');
      expect(result).toBe(false);
    });
  });

  describe('login', () => {
    it('should return a JWT token for correct password', async () => {
      const result = await service.login('admin123');
      expect(result).toEqual({ access_token: 'mock-jwt-token' });
      expect(jwtService.sign).toHaveBeenCalledWith({ sub: 'admin' });
    });

    it('should throw an error for incorrect password', async () => {
      await expect(service.login('wrong-password')).rejects.toThrow('Invalid password');
    });
  });
}); 