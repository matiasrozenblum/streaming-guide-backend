import { Injectable, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { SentryService } from '../sentry/sentry.service';

@Injectable()
export class RedisService implements OnModuleInit {
  public readonly client: Redis;

  constructor(private readonly sentryService: SentryService) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not set');
    }
    this.client = new Redis(redisUrl + '?family=0');
    console.log('🚀 Connected to Redis:', redisUrl);
  }

  onModuleInit() {
    // Set up Redis error handlers
    this.client.on('error', (error) => {
      console.error('❌ Redis connection error:', error);
      this.sentryService.captureMessage('Redis connection error - Cache service unavailable', 'error', {
        service: 'redis',
        error_type: 'connection_error',
        error_message: error.message,
        redis_url: process.env.REDIS_URL?.split('@')[1] || 'unknown',
        timestamp: new Date().toISOString(),
      });
      
      this.sentryService.setTag('service', 'redis');
      this.sentryService.setTag('error_type', 'connection_error');
    });

    this.client.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    this.client.on('ready', () => {
      console.log('✅ Redis ready for commands');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, serialized);
    }
  }

  /**
   * Set a key with NX (only if not exists) option and TTL
   * Returns true if the key was set, false if it already existed
   */
  async setNX(key: string, value: any, ttlSeconds: number): Promise<boolean> {
    const serialized = JSON.stringify(value);
    const result = await this.client.set(key, serialized, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return await this.client.incr(key);
  }

  async delByPattern(pattern: string): Promise<void> {
    const stream = this.client.scanStream({ match: pattern });
    const pipeline = this.client.pipeline();

    stream.on('data', (keys: string[]) => {
      if (keys.length) {
        keys.forEach((key) => {
          pipeline.del(key);
        });
      }
    });

    await new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    await pipeline.exec();
  }
}
