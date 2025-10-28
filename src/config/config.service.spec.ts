import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from './config.service';
import { Config } from './config.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RedisService } from '../redis/redis.service';

describe('ConfigService', () => {
  let service: ConfigService;
  let repo: Repository<Config>;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigService,
        {
          provide: getRepositoryToken(Config),
          useValue: mockRepository,
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ConfigService>(ConfigService);
    repo = module.get<Repository<Config>>(getRepositoryToken(Config));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('get', () => {
    it('should return the value for a given key', async () => {
      mockRepository.findOne.mockResolvedValue({ key: 'HOTJAR_ENABLED', value: 'true' });

      const result = await service.get('HOTJAR_ENABLED');
      expect(result).toBe('true');
      expect(repo.findOne).toHaveBeenCalledWith({ where: { key: 'HOTJAR_ENABLED' } });
    });

    it('should return null if key does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.get('NON_EXISTENT');
      expect(result).toBeNull();
    });
  });

  describe('getNumber', () => {
    it('should return number if value exists', async () => {
      jest.spyOn(service, 'get').mockResolvedValue('42');
      const result = await service.getNumber('FEATURE_PERCENTAGE');
      expect(result).toBe(42);
    });

    it('should return null if value is null', async () => {
      jest.spyOn(service, 'get').mockResolvedValue(null);
      const result = await service.getNumber('FEATURE_PERCENTAGE');
      expect(result).toBeNull();
    });
  });

  describe('getBoolean', () => {
    it('should return true if value is "true"', async () => {
      jest.spyOn(service, 'get').mockResolvedValue('true');
      const result = await service.getBoolean('HOTJAR_ENABLED');
      expect(result).toBe(true);
    });

    it('should return false for any other value', async () => {
      jest.spyOn(service, 'get').mockResolvedValue('false');
      const result = await service.getBoolean('HOTJAR_ENABLED');
      expect(result).toBe(false);
    });
  });

  describe('set', () => {
    it('should update value if config exists', async () => {
      const existing = { key: 'HOTJAR_ENABLED', value: 'false' };
      mockRepository.findOne.mockResolvedValue(existing);
      mockRepository.save.mockResolvedValue({ key: 'HOTJAR_ENABLED', value: 'true' });

      const result = await service.set('HOTJAR_ENABLED', 'true');
      expect(result).toEqual({ key: 'HOTJAR_ENABLED', value: 'true' });
      expect(repo.save).toHaveBeenCalledWith({ key: 'HOTJAR_ENABLED', value: 'true' });
    });

    it('should create new config if not exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({ key: 'NEW_KEY', value: '123' });
      mockRepository.save.mockResolvedValue({ key: 'NEW_KEY', value: '123' });

      const result = await service.set('NEW_KEY', '123');
      expect(result).toEqual({ key: 'NEW_KEY', value: '123' });
      expect(repo.create).toHaveBeenCalledWith({ key: 'NEW_KEY', value: '123' });
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all config entries ordered by updated_at DESC', async () => {
      const configs = [
        { key: 'B', value: '2', updated_at: new Date('2024-01-01') },
        { key: 'A', value: '1', updated_at: new Date('2024-01-02') },
      ];
      mockRepository.find.mockResolvedValue(configs);

      const result = await service.findAll();
      expect(result).toEqual(configs);
      expect(repo.find).toHaveBeenCalledWith({ order: { updated_at: 'DESC' } });
    });
  });
});
