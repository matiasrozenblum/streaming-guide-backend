import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Config } from './config.entity';
import { Repository } from 'typeorm';
import * as DateHolidays from 'date-holidays';
import { TimezoneUtil } from '../utils/timezone.util';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class ConfigService {
  private readonly hd = new ((DateHolidays as any).default ?? DateHolidays)('AR');
  
  // Redis key prefixes for config cache
  private readonly FETCH_ENABLED_PREFIX = 'config:fetch_enabled:';
  private readonly HOLIDAY_OVERRIDE_PREFIX = 'config:holiday_override:';
  private readonly HOLIDAY_CACHE_KEY = 'config:holiday_status';
  
  private cacheSeeded = false;
  
  constructor(
    @InjectRepository(Config)
    private configRepository: Repository<Config>,
    private readonly redisService: RedisService,
  ) {
    // Seed cache asynchronously on first use, not in constructor
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
      const acquired = await this.redisService.client.set(lockKey, lockValue, 'EX', lockTTL, 'NX');
      
      if (acquired) {
        // We got the lock, seed the cache
        await this.seedCache();
        this.cacheSeeded = true;
        // Release lock
        await this.redisService.del(lockKey);
      } else {
        // Another instance is seeding, wait and mark as seeded
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.cacheSeeded = true;
      }
    } catch (error) {
      console.error('[ConfigService] Failed to ensure cache seeded:', error.message);
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
      
      for (const config of allConfigs) {
        const value = config.value === 'true';
        
        if (config.key === 'youtube.fetch_enabled' || config.key.startsWith('youtube.fetch_enabled.')) {
          // Store in Redis with no TTL (permanent)
          await this.redisService.set(`${this.FETCH_ENABLED_PREFIX}${config.key}`, value);
          fetchEnabledCount++;
        } else if (config.key.startsWith('youtube.fetch_override_holiday.')) {
          await this.redisService.set(`${this.HOLIDAY_OVERRIDE_PREFIX}${config.key}`, value);
          holidayOverrideCount++;
        }
      }
      
      console.log(`[ConfigService] Redis cache seeded: ${fetchEnabledCount} fetch_enabled, ${holidayOverrideCount} holiday overrides`);
    } catch (error) {
      console.error('[ConfigService] Failed to seed Redis cache:', error.message);
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
    
    if (key === 'youtube.fetch_enabled' || key.startsWith('youtube.fetch_enabled.')) {
      await this.redisService.set(`${this.FETCH_ENABLED_PREFIX}${key}`, boolValue);
    } else if (key.startsWith('youtube.fetch_override_holiday.')) {
      await this.redisService.set(`${this.HOLIDAY_OVERRIDE_PREFIX}${key}`, boolValue);
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
    if (key === 'youtube.fetch_enabled' || key.startsWith('youtube.fetch_enabled.')) {
      await this.redisService.del(`${this.FETCH_ENABLED_PREFIX}${key}`);
    } else if (key.startsWith('youtube.fetch_override_holiday.')) {
      await this.redisService.del(`${this.HOLIDAY_OVERRIDE_PREFIX}${key}`);
    }
  }

  async isYoutubeFetchEnabledFor(handle: string): Promise<boolean> {
    // Ensure cache is seeded before reading
    await this.ensureCacheSeeded();
    
    const perChannelKey = `youtube.fetch_enabled.${handle}`;
    
    // Check Redis cache first
    const cachedPerChannel = await this.redisService.get<boolean>(`${this.FETCH_ENABLED_PREFIX}${perChannelKey}`);
    if (cachedPerChannel !== null) {
      return cachedPerChannel;
    }
    
    // Fallback to global if not in cache
    const cachedGlobal = await this.redisService.get<boolean>(`${this.FETCH_ENABLED_PREFIX}youtube.fetch_enabled`);
    if (cachedGlobal !== null) {
      return cachedGlobal;
    }
    
    // Cache miss - fetch from DB and warm cache
    const perChannel = await this.get(perChannelKey);
    if (perChannel != null) {
      const value = perChannel === 'true';
      await this.redisService.set(`${this.FETCH_ENABLED_PREFIX}${perChannelKey}`, value);
      return value;
    }

    const global = await this.get('youtube.fetch_enabled');
    const value = global === 'true';
    await this.redisService.set(`${this.FETCH_ENABLED_PREFIX}youtube.fetch_enabled`, value);
    return value;
  }

  async canFetchLive(handle: string): Promise<boolean> {
    // Check if fetch is enabled
    const enabled = await this.isYoutubeFetchEnabledFor(handle);
    if (!enabled) return false;

    // Check if today is a holiday (cached daily) - using Argentina/Buenos Aires timezone
    const today = TimezoneUtil.currentDateString(); // YYYY-MM-DD in Argentina time
    
    // Check Redis for holiday status
    const cachedHoliday = await this.redisService.get<{ date: string; isHoliday: boolean }>(this.HOLIDAY_CACHE_KEY);
    
    let isHoliday: boolean;
    if (!cachedHoliday || cachedHoliday.date !== today) {
      // Check holiday using Argentina timezone
      const argentinaDate = TimezoneUtil.now().toDate();
      isHoliday = !!this.hd.isHoliday(argentinaDate);
      
      // Cache until end of day (Argentina time)
      const ttl = TimezoneUtil.ttlUntilEndOfDay();
      await this.redisService.set(this.HOLIDAY_CACHE_KEY, { date: today, isHoliday }, ttl);
    } else {
      isHoliday = cachedHoliday.isHoliday;
    }
    
    if (!isHoliday) {
      return true; // Not a holiday, can fetch
    }
    
    // It's a holiday - check override from Redis
    const overrideKey = `youtube.fetch_override_holiday.${handle}`;
    
    // Check Redis cache first
    const cachedOverride = await this.redisService.get<boolean>(`${this.HOLIDAY_OVERRIDE_PREFIX}${overrideKey}`);
    if (cachedOverride !== null) {
      return cachedOverride;
    }
    
    // Cache miss - fetch from DB
    const override = await this.getBoolean(overrideKey);
    await this.redisService.set(`${this.HOLIDAY_OVERRIDE_PREFIX}${overrideKey}`, override);
    return override;
  }
}
