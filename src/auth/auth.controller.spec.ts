import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn(),
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
      const mockToken = { access_token: 'mock-jwt-token' };
      jest.spyOn(authService, 'login').mockResolvedValue(mockToken);

      const result = await controller.login('admin123');
      expect(result).toEqual(mockToken);
      expect(authService.login).toHaveBeenCalledWith('admin123');
    });

    it('should throw HttpException for incorrect password', async () => {
      jest.spyOn(authService, 'login').mockRejectedValue(new Error('Invalid password'));

      await expect(controller.login('wrong-password')).rejects.toThrow('Invalid credentials');
    });
  });
}); 