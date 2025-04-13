import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

describe('AuthService', () => {
  let service: AuthService;
  let configService: ConfigService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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

    service = module.get<AuthService>(AuthService);
    configService = module.get<ConfigService>(ConfigService);
    jwtService = module.get<JwtService>(JwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return a token for correct backoffice password', async () => {
    const result = await service.login('admin123', true);
    expect(result).toEqual({ access_token: 'mock-token' });
    expect(jwtService.sign).toHaveBeenCalled();
  });

  it('should return a token for correct public password', async () => {
    const result = await service.login('public123', false);
    expect(result).toEqual({ access_token: 'mock-token' });
    expect(jwtService.sign).toHaveBeenCalled();
  });

  it('should throw error for incorrect password', async () => {
    await expect(service.login('wrong-password', true)).rejects.toThrow('Invalid password');
  });
}); 