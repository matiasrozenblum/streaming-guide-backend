import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Config } from './config.entity';
import { Repository } from 'typeorm';

@Injectable()
export class ConfigService {
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
}
