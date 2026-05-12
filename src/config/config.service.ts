import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Config } from './config.entity';
import { Repository } from 'typeorm';
import * as DateHolidays from 'date-holidays';
import { TimezoneUtil } from '../utils/timezone.util';
import { RedisService } from '../redis/redis.service';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';

const FRONTEND_URL =
  process.env.FRONTEND_URL || 'https://staging.laguiadelstreaming.com';
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || 'changeme';

@Injectable()
export class ConfigService {
  private readonly hd = new ((DateHolidays as any).default ?? DateHolidays)(
    'AR',
  );
  private notifyUtil: NotifyAndRevalidateUtil;

  // Redis key prefixes for config cache
  private readonly FETCH_ENABLED_PREFIX = 'config:fetch_enabled:';
  private readonly HOLIDAY_OVERRIDE_PREFIX = 'config:holiday_override:';
  private readonly HOLIDAY_CACHE_KEY = 'config:holiday_status';
  private readonly TITLE_MATCH_DISABLED_PREFIX = 'config:title_match_disabled:';

  private cacheSeeded = false;

  constructor(
    @InjectRepository(Config)
    private configRepository: Repository<Config>,
    private readonly redisService: RedisService,
  ) {
    this.notifyUtil = new NotifyAndRevalidateUtil(
      this.redisService,
      FRONTEND_URL,
      REVALIDATE_SECRET,
    );
  }

  /**
   * Ensure cache is seeded (only runs once)
   */
  private async ensureCacheSeeded(): Promise<void> {
    if (this.cacheSeeded) return;

    // Use Redis lock to ensure only one instance seeds the cache
    const lockKey = 'config:seed_lock';
    const lockValue = `${Date.now()}`;
    const lockTTL = 30; // 30 seconds

    try {
      // Try to acquire lock
      const acquired = await this.redisService.client.set(
        lockKey,
        lockValue,
        'EX',
        lockTTL,
        'NX',
      );

      if (acquired) {
        // We got the lock, seed the cache
        await this.seedCache();
        this.cacheSeeded = true;
        // Release lock
        await this.redisService.del(lockKey);
      } else {
        // Another instance is seeding, wait and mark as seeded
        await new Promise((resolve) => setTimeout(resolve, 1000));
        this.cacheSeeded = true;
      }
    } catch (error) {
      console.error(
        '[ConfigService] Failed to ensure cache seeded:',
        error.message,
      );
      this.cacheSeeded = true; // Mark as seeded to avoid blocking
    }
  }

  /**
   * Seed Redis cache with all fetch_enabled and holiday override values
   */
  private async seedCache(): Promise<void> {
    try {
      const allConfigs = await this.configRepository.find();

      let fetchEnabledCount = 0;
      let holidayOverrideCount = 0;
      let titleMatchDisabledCount = 0;

      for (const config of allConfigs) {
        const value = config.value === 'true';

        if (
          config.key === 'youtube.fetch_enabled' ||
          config.key.startsWith('youtube.fetch_enabled.')
        ) {
          // Store in Redis with no TTL (permanent)
          await this.redisService.set(
            `${this.FETCH_ENABLED_PREFIX}${config.key}`,
            value,
          );
          fetchEnabledCount++;
        } else if (config.key.startsWith('youtube.fetch_override_holiday.')) {
          await this.redisService.set(
            `${this.HOLIDAY_OVERRIDE_PREFIX}${config.key}`,
            value,
          );
          holidayOverrideCount++;
        } else if (
          config.key === 'youtube.title_match_disabled' ||
          config.key.startsWith('youtube.title_match_disabled.')
        ) {
          await this.redisService.set(
            `${this.TITLE_MATCH_DISABLED_PREFIX}${config.key}`,
            value,
          );
          titleMatchDisabledCount++;
        }
      }

      console.log(
        `[ConfigService] Redis cache seeded: ${fetchEnabledCount} fetch_enabled, ${holidayOverrideCount} holiday overrides, ${titleMatchDisabledCount} title_match_disabled`,
      );
    } catch (error) {
      console.error(
        '[ConfigService] Failed to seed Redis cache:',
        error.message,
      );
    }
  }

  async get(key: string): Promise<string | null> {
    const entry = await this.configRepository.findOne({ where: { key } });
    return entry?.value ?? null;
  }

  async getNumber(key: string): Promise<number | null> {
    const val = await this.get(key);
    return val ? Number(val) : null;
  }

  async getBoolean(key: string): Promise<boolean> {
    const val = await this.get(key);
    return val === 'true';
  }

  async set(key: string, value: string): Promise<Config> {
    let config = await this.configRepository.findOne({ where: { key } });

    if (config) {
      config.value = value;
    } else {
      config = this.configRepository.create({ key, value });
    }

    const result = await this.configRepository.save(config);

    // Update Redis cache when value changes
    const boolValue = value === 'true';

    if (
      key === 'youtube.fetch_enabled' ||
      key.startsWith('youtube.fetch_enabled.')
    ) {
      await this.redisService.set(
        `${this.FETCH_ENABLED_PREFIX}${key}`,
        boolValue,
      );
    } else if (key.startsWith('youtube.fetch_override_holiday.')) {
      await this.redisService.set(
        `${this.HOLIDAY_OVERRIDE_PREFIX}${key}`,
        boolValue,
      );
    } else if (
      key === 'youtube.title_match_disabled' ||
      key.startsWith('youtube.title_match_disabled.')
    ) {
      await this.redisService.set(
        `${this.TITLE_MATCH_DISABLED_PREFIX}${key}`,
        boolValue,
      );
    }

    // When holiday custom dates change: invalidate holiday cache + revalidate frontend
    if (key === 'holiday.custom_dates') {
      await this.redisService.del(this.HOLIDAY_CACHE_KEY);
      this.notifyUtil.notifyAndRevalidate({
        eventType: 'config.updated',
        entity: 'config',
        entityId: key,
        payload: { key, value },
        revalidatePaths: ['/'],
      });
    }

    return result;
  }

  async findAll(): Promise<Config[]> {
    return this.configRepository.find({
      order: { updated_at: 'DESC' },
    });
  }

  async remove(key: string): Promise<void> {
    await this.configRepository.delete({ key });

    // Remove from Redis cache
    if (
      key === 'youtube.fetch_enabled' ||
      key.startsWith('youtube.fetch_enabled.')
    ) {
      await this.redisService.del(`${this.FETCH_ENABLED_PREFIX}${key}`);
    } else if (key.startsWith('youtube.fetch_override_holiday.')) {
      await this.redisService.del(`${this.HOLIDAY_OVERRIDE_PREFIX}${key}`);
    } else if (
      key === 'youtube.title_match_disabled' ||
      key.startsWith('youtube.title_match_disabled.')
    ) {
      await this.redisService.del(`${this.TITLE_MATCH_DISABLED_PREFIX}${key}`);
    }
  }

  async isYoutubeFetchEnabledFor(handle: string): Promise<boolean> {
    // Ensure cache is seeded before reading
    await this.ensureCacheSeeded();

    const perChannelKey = `youtube.fetch_enabled.${handle}`;

    // Check Redis cache first
    const cachedPerChannel = await this.redisService.get<boolean>(
      `${this.FETCH_ENABLED_PREFIX}${perChannelKey}`,
    );
    if (cachedPerChannel !== null) {
      return cachedPerChannel;
    }

    // Fallback to global if not in cache
    const cachedGlobal = await this.redisService.get<boolean>(
      `${this.FETCH_ENABLED_PREFIX}youtube.fetch_enabled`,
    );
    if (cachedGlobal !== null) {
      return cachedGlobal;
    }

    // Cache miss - fetch from DB and warm cache
    const perChannel = await this.get(perChannelKey);
    if (perChannel != null) {
      const value = perChannel === 'true';
      await this.redisService.set(
        `${this.FETCH_ENABLED_PREFIX}${perChannelKey}`,
        value,
      );
      return value;
    }

    const global = await this.get('youtube.fetch_enabled');
    const value = global === 'true';
    await this.redisService.set(
      `${this.FETCH_ENABLED_PREFIX}youtube.fetch_enabled`,
      value,
    );
    return value;
  }

  async canFetchLive(handle: string): Promise<boolean> {
    const results = await this.canFetchLiveBulk([handle]);
    return results.get(handle) ?? false;
  }

  async canFetchLiveBulk(handles: string[]): Promise<Map<string, boolean>> {
    if (handles.length === 0) return new Map();

    await this.ensureCacheSeeded();

    const results = new Map<string, boolean>();
    const uniqueHandles = [...new Set(handles)];

    // 1. Check fetch_enabled status for all channels and global
    const fetchEnabledKeys = uniqueHandles.map(
      (h) => `${this.FETCH_ENABLED_PREFIX}youtube.fetch_enabled.${h}`,
    );
    fetchEnabledKeys.push(`${this.FETCH_ENABLED_PREFIX}youtube.fetch_enabled`); // global is last

    const fetchEnabledValues =
      await this.redisService.mget<boolean>(fetchEnabledKeys);

    const globalFetchEnabled =
      fetchEnabledValues[fetchEnabledValues.length - 1];

    // Fallback to DB if global cache is missing
    let globalEnabled =
      globalFetchEnabled !== null
        ? globalFetchEnabled
        : await this.getBoolean('youtube.fetch_enabled');
    if (globalFetchEnabled === null) {
      await this.redisService.set(
        `${this.FETCH_ENABLED_PREFIX}youtube.fetch_enabled`,
        globalEnabled,
      );
    }

    const enabledChannels = new Set<string>();

    for (let i = 0; i < uniqueHandles.length; i++) {
      const handle = uniqueHandles[i];
      let isEnabled = fetchEnabledValues[i];

      if (isEnabled === null) {
        // Cache miss for this specific channel, hit DB
        const perChannelKey = `youtube.fetch_enabled.${handle}`;
        const dbVal = await this.get(perChannelKey);
        if (dbVal !== null) {
          isEnabled = dbVal === 'true';
          await this.redisService.set(
            `${this.FETCH_ENABLED_PREFIX}${perChannelKey}`,
            isEnabled,
          );
        } else {
          isEnabled = globalEnabled;
        }
      }

      if (isEnabled) {
        enabledChannels.add(handle);
      } else {
        results.set(handle, false);
      }
    }

    if (enabledChannels.size === 0) {
      return results;
    }

    // 2. Check if today is a holiday
    const today = TimezoneUtil.currentDateString();
    let isHoliday = false;
    const cachedHoliday = await this.redisService.get<{
      date: string;
      isHoliday: boolean;
    }>(this.HOLIDAY_CACHE_KEY);

    if (!cachedHoliday || cachedHoliday.date !== today) {
      const argentinaDate = TimezoneUtil.now().toDate();
      isHoliday = !!this.hd.isHoliday(argentinaDate);

      if (!isHoliday) {
        const customDatesRaw = await this.get('holiday.custom_dates');
        if (customDatesRaw) {
          const customDates = customDatesRaw.split(',').map((d) => d.trim());
          isHoliday = customDates.includes(today);
        }
      }

      const ttl = TimezoneUtil.ttlUntilEndOfDay();
      await this.redisService.set(
        this.HOLIDAY_CACHE_KEY,
        { date: today, isHoliday },
        ttl,
      );
    } else {
      isHoliday = cachedHoliday.isHoliday;
    }

    if (!isHoliday) {
      // Not a holiday, all enabled channels can fetch
      for (const handle of enabledChannels) {
        results.set(handle, true);
      }
      return results;
    }

    // 3. It's a holiday, check overrides in bulk
    const enabledChannelsList = Array.from(enabledChannels);
    const overrideKeys = enabledChannelsList.map(
      (h) =>
        `${this.HOLIDAY_OVERRIDE_PREFIX}youtube.fetch_override_holiday.${h}`,
    );

    const overrideValues = await this.redisService.mget<boolean>(overrideKeys);

    for (let i = 0; i < enabledChannelsList.length; i++) {
      const handle = enabledChannelsList[i];
      const overrideKey = `youtube.fetch_override_holiday.${handle}`;
      let override = overrideValues[i];

      if (override === null) {
        // Cache miss, check DB
        const dbVal = await this.get(overrideKey);
        override = dbVal === null ? true : dbVal === 'true';
        await this.redisService.set(
          `${this.HOLIDAY_OVERRIDE_PREFIX}${overrideKey}`,
          override,
        );
      }

      results.set(handle, override);
    }

    return results;
  }

  /**
   * Check if title matching should be disabled for a channel
   * Some channels use a single unified live stream for all their programs
   * and the video title won't match individual program names
   *
   * @param handle Channel handle
   * @returns true if title matching should be disabled, false otherwise
   */
  async isTitleMatchDisabled(handle: string): Promise<boolean> {
    // Ensure cache is seeded before reading
    await this.ensureCacheSeeded();

    const perChannelKey = `youtube.title_match_disabled.${handle}`;

    // Check Redis cache first
    const cachedPerChannel = await this.redisService.get<boolean>(
      `${this.TITLE_MATCH_DISABLED_PREFIX}${perChannelKey}`,
    );
    if (cachedPerChannel !== null) {
      return cachedPerChannel;
    }

    // Fallback to global if not in cache
    const cachedGlobal = await this.redisService.get<boolean>(
      `${this.TITLE_MATCH_DISABLED_PREFIX}youtube.title_match_disabled`,
    );
    if (cachedGlobal !== null) {
      return cachedGlobal;
    }

    // Cache miss - fetch from DB and warm cache
    const perChannel = await this.get(perChannelKey);
    if (perChannel != null) {
      const value = perChannel === 'true';
      await this.redisService.set(
        `${this.TITLE_MATCH_DISABLED_PREFIX}${perChannelKey}`,
        value,
      );
      return value;
    }

    const global = await this.get('youtube.title_match_disabled');
    const value = global === 'true';
    await this.redisService.set(
      `${this.TITLE_MATCH_DISABLED_PREFIX}youtube.title_match_disabled`,
      value,
    );
    return value;
  }
}
