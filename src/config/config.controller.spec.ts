import { Test, TestingModule } from '@nestjs/testing';
import { ConfigController } from './config.controller';
import { ConfigService } from './config.service';

describe('ConfigController', () => {
  let controller: ConfigController;
  let service: ConfigService;

  const mockConfigService = {
    findAll: jest.fn().mockResolvedValue([
      { key: 'HOTJAR_ENABLED', value: 'true' },
      { key: 'FEATURE_X_PERCENTAGE', value: '50' },
    ]),
    get: jest.fn().mockResolvedValue('true'),
    set: jest.fn().mockImplementation((key, value) => Promise.resolve({ key, value })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfigController],
      providers: [
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    controller = module.get<ConfigController>(ConfigController);
    service = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return all config entries', async () => {
    const result = await controller.findAll();
    expect(result).toEqual([
      { key: 'HOTJAR_ENABLED', value: 'true' },
      { key: 'FEATURE_X_PERCENTAGE', value: '50' },
    ]);
    expect(service.findAll).toHaveBeenCalled();
  });

  it('should get a config value by key', async () => {
    const result = await controller.get('HOTJAR_ENABLED');
    expect(result).toBe('true');
    expect(service.get).toHaveBeenCalledWith('HOTJAR_ENABLED');
  });

  it('should set a config value', async () => {
    const result = await controller.set({ key: 'HOTJAR_ENABLED', value: 'false' });
    expect(result).toEqual({ key: 'HOTJAR_ENABLED', value: 'false' });
    expect(service.set).toHaveBeenCalledWith('HOTJAR_ENABLED', 'false');
  });
});
