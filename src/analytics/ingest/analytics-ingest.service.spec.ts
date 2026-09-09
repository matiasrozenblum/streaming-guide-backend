import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsIngestService } from './analytics-ingest.service';
import { AnalyticsEvent } from '../entities/analytics-event.entity';
import { Program } from '../../programs/programs.entity';
import { Channel } from '../../channels/channels.entity';
import { RedisService } from '../../redis/redis.service';
import { SentryService } from '../../sentry/sentry.service';
import { IngestEventsDto, IngestPlatform } from '../dto/ingest-events.dto';

describe('AnalyticsIngestService', () => {
  let service: AnalyticsIngestService;
  let redisClient: {
    rpush: jest.Mock;
    lpop: jest.Mock;
    expire: jest.Mock;
  };
  let redisService: {
    client: typeof redisClient;
    incr: jest.Mock;
    get: jest.Mock;
    set: jest.Mock;
  };
  let insertBuilder: {
    insert: jest.Mock;
    into: jest.Mock;
    values: jest.Mock;
    updateEntity: jest.Mock;
    execute: jest.Mock;
  };

  const baseDto = (
    overrides: Partial<IngestEventsDto> = {},
  ): IngestEventsDto => ({
    device_id: 'device-1',
    session_id: 'session-1',
    platform: IngestPlatform.WEB,
    events: [{ name: 'click_youtube_live', ts: new Date().toISOString() }],
    ...overrides,
  });

  beforeEach(async () => {
    redisClient = {
      rpush: jest.fn().mockResolvedValue(1),
      lpop: jest.fn().mockResolvedValue(null),
      expire: jest.fn().mockResolvedValue(1),
    };
    redisService = {
      client: redisClient,
      incr: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    insertBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      updateEntity: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsIngestService,
        {
          provide: getRepositoryToken(AnalyticsEvent),
          useValue: {
            createQueryBuilder: jest.fn(() => insertBuilder),
          },
        },
        {
          provide: getRepositoryToken(Program),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(Channel),
          useValue: { find: jest.fn().mockResolvedValue([]) },
        },
        { provide: RedisService, useValue: redisService },
        { provide: SentryService, useValue: { captureMessage: jest.fn() } },
      ],
    }).compile();

    service = module.get<AnalyticsIngestService>(AnalyticsIngestService);
  });

  it('buffers a valid batch', async () => {
    const result = await service.ingest(baseDto(), 42, 'user');

    expect(result).toEqual({ accepted: 1, dropped: 0 });
    expect(redisClient.rpush).toHaveBeenCalledTimes(1);
  });

  it('attributes events to the JWT user, never the payload', async () => {
    await service.ingest(baseDto(), 42, 'user');

    const buffered = JSON.parse(redisClient.rpush.mock.calls[0][1]);
    expect(buffered.user_id).toBe(42);
  });

  it('leaves anonymous events unattributed', async () => {
    await service.ingest(baseDto(), null, null);

    const buffered = JSON.parse(redisClient.rpush.mock.calls[0][1]);
    expect(buffered.user_id).toBeNull();
  });

  describe('admin filtering', () => {
    it('drops events when the JWT says admin', async () => {
      const result = await service.ingest(baseDto(), 1, 'admin');

      expect(result).toEqual({ accepted: 0, dropped: 1 });
      expect(redisClient.rpush).not.toHaveBeenCalled();
    });

    it('drops events when only the client claims admin', async () => {
      const result = await service.ingest(
        baseDto({ user_role: 'admin' }),
        null,
        null,
      );

      expect(result).toEqual({ accepted: 0, dropped: 1 });
      expect(redisClient.rpush).not.toHaveBeenCalled();
    });
  });

  describe('rate limiting', () => {
    it('drops the batch once the device exceeds its budget', async () => {
      redisService.incr.mockResolvedValue(100_000);

      const result = await service.ingest(baseDto(), null, null);

      expect(result).toEqual({ accepted: 0, dropped: 1 });
      expect(redisClient.rpush).not.toHaveBeenCalled();
    });

    it('sets the window TTL only on the first event', async () => {
      redisService.incr.mockResolvedValue(1);
      await service.ingest(baseDto(), null, null);
      expect(redisClient.expire).toHaveBeenCalledTimes(1);

      redisService.incr.mockResolvedValue(2);
      await service.ingest(baseDto(), null, null);
      expect(redisClient.expire).toHaveBeenCalledTimes(1);
    });

    it('lets events through when Redis cannot be reached', async () => {
      redisService.incr.mockRejectedValue(new Error('redis down'));

      const result = await service.ingest(baseDto(), null, null);

      expect(result.accepted).toBe(1);
    });
  });

  describe('timestamp handling', () => {
    it('drops unparseable timestamps', async () => {
      const result = await service.ingest(
        baseDto({ events: [{ name: 'zap_use', ts: 'not-a-date' }] }),
        null,
        null,
      );

      expect(result).toEqual({ accepted: 0, dropped: 1 });
    });

    it('drops timestamps older than the accepted window', async () => {
      const ancient = new Date(
        Date.now() - 400 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const result = await service.ingest(
        baseDto({ events: [{ name: 'zap_use', ts: ancient }] }),
        null,
        null,
      );

      expect(result).toEqual({ accepted: 0, dropped: 1 });
    });

    it('clamps a clock skewed into the future to now', async () => {
      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await service.ingest(
        baseDto({ events: [{ name: 'zap_use', ts: future }] }),
        null,
        null,
      );

      const buffered = JSON.parse(redisClient.rpush.mock.calls[0][1]);
      expect(Date.parse(buffered.occurred_at)).toBeLessThanOrEqual(
        Date.now() + 1000,
      );
    });
  });

  it('writes through to Postgres when the Redis buffer is unavailable', async () => {
    redisClient.rpush.mockRejectedValue(new Error('redis down'));

    const result = await service.ingest(baseDto(), null, null);

    expect(result.accepted).toBe(1);
    expect(insertBuilder.execute).toHaveBeenCalledTimes(1);
  });

  describe('flush', () => {
    it('does nothing when the buffer is empty', async () => {
      redisClient.lpop.mockResolvedValue(null);

      expect(await service.flush()).toBe(0);
      expect(insertBuilder.execute).not.toHaveBeenCalled();
    });

    it('drains the buffer into a single insert per chunk', async () => {
      const event = JSON.stringify({
        event_name: 'click_youtube_live',
        occurred_at: new Date().toISOString(),
        platform: 'web',
        app_version: null,
        user_id: null,
        device_id: 'd',
        session_id: 's',
        program_id: 7,
        channel_id: 3,
        program_name: null,
        channel_name: null,
        user_gender: null,
        user_age_group: null,
        properties: {},
      });
      redisClient.lpop
        .mockResolvedValueOnce([event, event])
        .mockResolvedValueOnce(null);

      expect(await service.flush()).toBe(2);
      expect(insertBuilder.execute).toHaveBeenCalledTimes(1);
      expect(insertBuilder.values.mock.calls[0][0]).toHaveLength(2);
    });

    it('skips a corrupt entry without losing the rest of the chunk', async () => {
      const valid = JSON.stringify({
        event_name: 'zap_use',
        occurred_at: new Date().toISOString(),
        platform: 'web',
        app_version: null,
        user_id: null,
        device_id: null,
        session_id: null,
        program_id: null,
        channel_id: null,
        program_name: null,
        channel_name: null,
        user_gender: null,
        user_age_group: null,
        properties: {},
      });
      redisClient.lpop
        .mockResolvedValueOnce(['{not json', valid])
        .mockResolvedValueOnce(null);

      expect(await service.flush()).toBe(1);
    });
  });
});
