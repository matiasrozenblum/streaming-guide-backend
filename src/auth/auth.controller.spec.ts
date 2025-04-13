import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
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

  describe('login', () => {
    it('should return a JWT token for correct password', async () => {
      const mockToken = { access_token: 'mock-token' };
      jest.spyOn(authService, 'login').mockResolvedValue(mockToken);

      const result = await controller.login({ password: 'admin123' });
      expect(result).toEqual(mockToken);
      expect(authService.login).toHaveBeenCalledWith('admin123', false);
    });

    it('should throw HttpException for incorrect password', async () => {
      jest.spyOn(authService, 'login').mockRejectedValue(new Error('Authentication failed'));

      await expect(controller.login({ password: 'wrong-password' })).rejects.toThrow('Authentication failed');
    });
  });
}); 