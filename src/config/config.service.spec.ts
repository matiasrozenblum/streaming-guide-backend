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

  const redisMock = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    mget: jest.fn(),
    client: { set: jest.fn() },
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
          useValue: redisMock,
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
      mockRepository.findOne.mockResolvedValue({
        key: 'HOTJAR_ENABLED',
        value: 'true',
      });

      const result = await service.get('HOTJAR_ENABLED');
      expect(result).toBe('true');
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { key: 'HOTJAR_ENABLED' },
      });
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
      mockRepository.save.mockResolvedValue({
        key: 'HOTJAR_ENABLED',
        value: 'true',
      });

      const result = await service.set('HOTJAR_ENABLED', 'true');
      expect(result).toEqual({ key: 'HOTJAR_ENABLED', value: 'true' });
      expect(repo.save).toHaveBeenCalledWith({
        key: 'HOTJAR_ENABLED',
        value: 'true',
      });
    });

    it('should create new config if not exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({ key: 'NEW_KEY', value: '123' });
      mockRepository.save.mockResolvedValue({ key: 'NEW_KEY', value: '123' });

      const result = await service.set('NEW_KEY', '123');
      expect(result).toEqual({ key: 'NEW_KEY', value: '123' });
      expect(repo.create).toHaveBeenCalledWith({
        key: 'NEW_KEY',
        value: '123',
      });
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

  describe('canFetchLiveBulk', () => {
    const FE = 'config:fetch_enabled:';
    const HO = 'config:holiday_override:';

    beforeEach(() => {
      // ensureCacheSeeded: no tomamos el lock, salimos por la rama corta
      redisMock.client.set.mockResolvedValue(null);
      mockRepository.find.mockResolvedValue([]);
    });

    it('returns an empty map for an empty input', async () => {
      const result = await service.canFetchLiveBulk([]);
      expect(result.size).toBe(0);
      expect(redisMock.mget).not.toHaveBeenCalled();
    });

    it('batches fetch_enabled lookups into a single mget (no N+1)', async () => {
      // [luzu, olga, global]
      redisMock.mget.mockResolvedValueOnce([true, true, true]);
      // no es feriado
      redisMock.get.mockResolvedValue({ date: 'x', isHoliday: false });
      jest
        .spyOn(service as any, 'isHolidayToday')
        .mockResolvedValue(false as never);

      const result = await service.canFetchLiveBulk(['luzu', 'olga']);

      expect(redisMock.mget).toHaveBeenCalledTimes(1);
      expect(redisMock.mget).toHaveBeenCalledWith([
        `${FE}youtube.fetch_enabled.luzu`,
        `${FE}youtube.fetch_enabled.olga`,
        `${FE}youtube.fetch_enabled`,
      ]);
      expect(result.get('luzu')).toBe(true);
      expect(result.get('olga')).toBe(true);
    });

    it('falls back to the global value when a channel has no per-channel config', async () => {
      redisMock.mget.mockResolvedValueOnce([null, false, true]);
      jest
        .spyOn(service as any, 'isHolidayToday')
        .mockResolvedValue(false as never);

      const result = await service.canFetchLiveBulk(['luzu', 'olga']);

      expect(result.get('luzu')).toBe(true); // hereda el global
      expect(result.get('olga')).toBe(false); // override por canal
    });

    it('batches holiday overrides only for enabled channels', async () => {
      redisMock.mget
        .mockResolvedValueOnce([true, false, true]) // fetch_enabled
        .mockResolvedValueOnce([false]); // holiday override, sólo para luzu
      jest
        .spyOn(service as any, 'isHolidayToday')
        .mockResolvedValue(true as never);

      const result = await service.canFetchLiveBulk(['luzu', 'olga']);

      expect(redisMock.mget).toHaveBeenNthCalledWith(2, [
        `${HO}youtube.fetch_override_holiday.luzu`,
      ]);
      expect(result.get('luzu')).toBe(false); // deshabilitado en feriado
      expect(result.get('olga')).toBe(false); // fetch_enabled false
    });

    it('delegates to canFetchLive on a cache miss to preserve semantics', async () => {
      redisMock.mget.mockResolvedValueOnce([null, null]); // luzu + global sin cachear
      const single = jest
        .spyOn(service, 'canFetchLive')
        .mockResolvedValue(true);

      const result = await service.canFetchLiveBulk(['luzu']);

      expect(single).toHaveBeenCalledWith('luzu');
      expect(result.get('luzu')).toBe(true);
    });

    it('deduplicates repeated handles', async () => {
      redisMock.mget.mockResolvedValueOnce([true, true]);
      jest
        .spyOn(service as any, 'isHolidayToday')
        .mockResolvedValue(false as never);

      const result = await service.canFetchLiveBulk(['luzu', 'luzu', 'luzu']);

      expect(redisMock.mget).toHaveBeenCalledWith([
        `${FE}youtube.fetch_enabled.luzu`,
        `${FE}youtube.fetch_enabled`,
      ]);
      expect(result.size).toBe(1);
      expect(result.get('luzu')).toBe(true);
    });
  });
});
