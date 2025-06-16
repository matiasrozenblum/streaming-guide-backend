import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Config } from './config.entity';
import { Repository } from 'typeorm';
import * as DateHolidays from 'date-holidays';

@Injectable()
export class ConfigService {
  private readonly hd = new ((DateHolidays as any).default ?? DateHolidays)('AR');
  constructor(
    @InjectRepository(Config)
    private configRepository: Repository<Config>,
  ) {}

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

    return this.configRepository.save(config); // updated_at se actualiza automáticamente
  }

  async findAll(): Promise<Config[]> {
    return this.configRepository.find({
      order: { updated_at: 'DESC' },
    });
  }

  async remove(key: string): Promise<void> {
    await this.configRepository.delete({ key });
  }

  async isYoutubeFetchEnabledFor(handle: string): Promise<boolean> {
    // checkeo específico de canal
    const perChannel = await this.get(`youtube.fetch_enabled.${handle}`);
    if (perChannel != null) return perChannel === 'true';

    // fallback al global
    const global = await this.get('youtube.fetch_enabled');
    return global === 'true';
  }

  async canFetchLive(handle: string): Promise<boolean> {
    const enabled = await this.isYoutubeFetchEnabledFor(handle);
    if (!enabled) return false;

    const isHoliday = !!this.hd.isHoliday(new Date());
    if (isHoliday) {
      return this.getBoolean(`youtube.fetch_override_holiday.${handle}`);
    }
    return true;
  }
}
