// 1. Mock ioredis at the top
const mockClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  scanStream: jest.fn(),
  pipeline: jest.fn(),
};
jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockClient),
}));

import { RedisService } from './redis.service';
import Redis from 'ioredis';

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(() => {
    Object.values(mockClient).forEach(fn => fn.mockReset && fn.mockReset());
    service = new RedisService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('returns parsed value if key exists', async () => {
      mockClient.get.mockResolvedValue(JSON.stringify({ foo: 'bar' }));
      const result = await service.get('key');
      expect(result).toEqual({ foo: 'bar' });
    });
    it('returns null if key does not exist', async () => {
      mockClient.get.mockResolvedValue(null);
      const result = await service.get('key');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('sets value without ttl', async () => {
      await service.set('key', { foo: 'bar' });
      expect(mockClient.set).toHaveBeenCalledWith('key', JSON.stringify({ foo: 'bar' }));
    });
    it('sets value with ttl', async () => {
      await service.set('key', { foo: 'bar' }, 60);
      expect(mockClient.set).toHaveBeenCalledWith('key', JSON.stringify({ foo: 'bar' }), 'EX', 60);
    });
  });

  describe('del', () => {
    it('deletes key', async () => {
      await service.del('key');
      expect(mockClient.del).toHaveBeenCalledWith('key');
    });
  });

  describe('incr', () => {
    it('increments key', async () => {
      mockClient.incr.mockResolvedValue(42);
      const result = await service.incr('key');
      expect(result).toBe(42);
      expect(mockClient.incr).toHaveBeenCalledWith('key');
    });
  });

  describe('delByPattern', () => {
    it('deletes keys matching pattern', async () => {
      const onHandlers: Record<string, Function> = {};
      const fakeStream = {
        on: (event: string, handler: Function) => {
          onHandlers[event] = handler;
        },
      };
      mockClient.scanStream.mockReturnValue(fakeStream);
      const fakePipeline = {
        del: jest.fn(),
        exec: jest.fn().mockResolvedValue(undefined),
      };
      mockClient.pipeline.mockReturnValue(fakePipeline);

      // Call delByPattern (will set up handlers)
      const promise = service.delByPattern('foo*');

      // Simulate stream events
      onHandlers['data'](['foo1', 'foo2']);
      onHandlers['end']();
      await promise;

      expect(fakePipeline.del).toHaveBeenCalledWith('foo1');
      expect(fakePipeline.del).toHaveBeenCalledWith('foo2');
      expect(fakePipeline.exec).toHaveBeenCalled();
    });
  });
}); 