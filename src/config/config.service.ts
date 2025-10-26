import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Config } from './config.entity';
import { Repository } from 'typeorm';
import * as DateHolidays from 'date-holidays';
import { TimezoneUtil } from '../utils/timezone.util';

@Injectable()
export class ConfigService {
  private readonly hd = new ((DateHolidays as any).default ?? DateHolidays)('AR');
  
  // Permanent cache (never expires, only invalidated on set/remove)
  private fetchEnabledCache = new Map<string, boolean>(); // 'youtube.fetch_enabled' or 'youtube.fetch_enabled.{handle}'
  private holidayOverrideCache = new Map<string, boolean>(); // 'youtube.fetch_override_holiday.{handle}'
  
  // Daily cache for holiday status
  private holidayCache: { date: string; isHoliday: boolean } | null = null;
  
  constructor(
    @InjectRepository(Config)
    private configRepository: Repository<Config>,
  ) {
    // Seed cache on startup
    this.seedCache();
  }

  /**
   * Seed caches with all fetch_enabled and holiday override values
   */
  private async seedCache(): Promise<void> {
    try {
      const allConfigs = await this.configRepository.find();
      
      for (const config of allConfigs) {
        const value = config.value === 'true';
        
        if (config.key === 'youtube.fetch_enabled' || config.key.startsWith('youtube.fetch_enabled.')) {
          this.fetchEnabledCache.set(config.key, value);
        } else if (config.key.startsWith('youtube.fetch_override_holiday.')) {
          this.holidayOverrideCache.set(config.key, value);
        }
      }
      
      console.log(`[ConfigService] Cache seeded: ${this.fetchEnabledCache.size} fetch_enabled, ${this.holidayOverrideCache.size} holiday overrides`);
    } catch (error) {
      console.error('[ConfigService] Failed to seed cache:', error.message);
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
    
    // Update cache when value changes
    const boolValue = value === 'true';
    
    if (key === 'youtube.fetch_enabled' || key.startsWith('youtube.fetch_enabled.')) {
      this.fetchEnabledCache.set(key, boolValue);
    } else if (key.startsWith('youtube.fetch_override_holiday.')) {
      this.holidayOverrideCache.set(key, boolValue);
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
    
    // Remove from cache
    if (key === 'youtube.fetch_enabled' || key.startsWith('youtube.fetch_enabled.')) {
      this.fetchEnabledCache.delete(key);
    } else if (key.startsWith('youtube.fetch_override_holiday.')) {
      this.holidayOverrideCache.delete(key);
    }
  }

  async isYoutubeFetchEnabledFor(handle: string): Promise<boolean> {
    const perChannelKey = `youtube.fetch_enabled.${handle}`;
    
    // Check cache first
    if (this.fetchEnabledCache.has(perChannelKey)) {
      return this.fetchEnabledCache.get(perChannelKey)!;
    }
    
    // Fallback to global if not in cache
    if (this.fetchEnabledCache.has('youtube.fetch_enabled')) {
      return this.fetchEnabledCache.get('youtube.fetch_enabled')!;
    }
    
    // Cache miss - fetch from DB (shouldn't happen after seedCache)
    const perChannel = await this.get(perChannelKey);
    if (perChannel != null) {
      const value = perChannel === 'true';
      this.fetchEnabledCache.set(perChannelKey, value);
      return value;
    }

    const global = await this.get('youtube.fetch_enabled');
    const value = global === 'true';
    this.fetchEnabledCache.set('youtube.fetch_enabled', value);
    return value;
  }

  async canFetchLive(handle: string): Promise<boolean> {
    // Check if fetch is enabled
    const enabled = await this.isYoutubeFetchEnabledFor(handle);
    if (!enabled) return false;

    // Check if today is a holiday (cached daily) - using Argentina/Buenos Aires timezone
    const today = TimezoneUtil.currentDateString(); // YYYY-MM-DD in Argentina time
    
    if (!this.holidayCache || this.holidayCache.date !== today) {
      // Check holiday using Argentina timezone
      const argentinaDate = TimezoneUtil.now().toDate();
      const isHoliday = !!this.hd.isHoliday(argentinaDate);
      this.holidayCache = { date: today, isHoliday };
    }
    
    if (!this.holidayCache.isHoliday) {
      return true; // Not a holiday, can fetch
    }
    
    // It's a holiday - check override
    const overrideKey = `youtube.fetch_override_holiday.${handle}`;
    
    // Check cache first
    if (this.holidayOverrideCache.has(overrideKey)) {
      return this.holidayOverrideCache.get(overrideKey)!;
    }
    
    // Cache miss - fetch from DB
    const override = await this.getBoolean(overrideKey);
    this.holidayOverrideCache.set(overrideKey, override);
    return override;
  }
}
