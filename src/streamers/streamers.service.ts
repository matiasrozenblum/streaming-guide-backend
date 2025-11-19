import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Streamer } from './streamers.entity';
import { CreateStreamerDto } from './dto/create-streamer.dto';
import { UpdateStreamerDto } from './dto/update-streamer.dto';
import { RedisService } from '@/redis/redis.service';
import { Category } from '../categories/categories.entity';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';
import { ConfigService } from '@/config/config.service';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://staging.laguiadelstreaming.com';
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || 'changeme';

@Injectable()
export class StreamersService {
  private notifyUtil: NotifyAndRevalidateUtil;
  private readonly CACHE_KEY = 'streamers:visible';
  private readonly CACHE_TTL = 3600; // 1 hour

  constructor(
    @InjectRepository(Streamer)
    private readonly streamersRepository: Repository<Streamer>,
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.notifyUtil = new NotifyAndRevalidateUtil(
      this.redisService,
      FRONTEND_URL,
      REVALIDATE_SECRET
    );
  }

  async findAll(): Promise<Streamer[]> {
    return this.streamersRepository.find({
      relations: ['categories'],
      order: {
        id: 'ASC',
      },
    });
  }

  async findAllVisible(): Promise<Streamer[]> {
    // Try cache first
    const cached = await this.redisService.get<Streamer[]>(this.CACHE_KEY);
    if (cached) {
      return cached;
    }

    // Fetch from database
    const streamers = await this.streamersRepository.find({
      where: { is_visible: true },
      relations: ['categories'],
      order: {
        id: 'ASC',
      },
    });

    // Cache the result
    await this.redisService.set(this.CACHE_KEY, streamers, this.CACHE_TTL);

    return streamers;
  }

  async findOne(id: number): Promise<Streamer> {
    const streamer = await this.streamersRepository.findOne({ 
      where: { id },
      relations: ['categories']
    });
    if (!streamer) {
      throw new NotFoundException(`Streamer with ID ${id} not found`);
    }
    return streamer;
  }

  async create(createStreamerDto: CreateStreamerDto): Promise<Streamer> {
    const { category_ids, ...streamerData } = createStreamerDto;
    
    const streamer = this.streamersRepository.create({
      ...streamerData,
      is_visible: streamerData.is_visible ?? true,
    });

    // Load categories if provided
    if (category_ids && category_ids.length > 0) {
      const categories = await this.categoriesRepository.findBy({ id: In(category_ids) });
      streamer.categories = categories;
    }

    // Clear cache
    try {
      await this.redisService.del(this.CACHE_KEY);
    } catch (error) {
      console.error('❌ Error clearing streamers cache:', error.message);
    }
    
    const saved = await this.streamersRepository.save(streamer);

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'streamer_created',
      entity: 'streamer',
      entityId: saved.id,
      payload: { streamer: saved },
      revalidatePaths: ['/streamers'],
    });

    return saved;
  }

  async update(id: number, updateStreamerDto: UpdateStreamerDto): Promise<Streamer> {
    const streamer = await this.findOne(id);
    
    const { category_ids, ...streamerData } = updateStreamerDto;
    
    // Update streamer fields
    Object.assign(streamer, streamerData);

    // Update categories if provided
    if (category_ids !== undefined) {
      if (category_ids.length > 0) {
        const categories = await this.categoriesRepository.findBy({ id: In(category_ids) });
        streamer.categories = categories;
      } else {
        streamer.categories = [];
      }
    }

    // Clear cache
    try {
      await this.redisService.del(this.CACHE_KEY);
    } catch (error) {
      console.error('❌ Error clearing streamers cache:', error.message);
    }

    const saved = await this.streamersRepository.save(streamer);

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'streamer_updated',
      entity: 'streamer',
      entityId: saved.id,
      payload: { streamer: saved },
      revalidatePaths: ['/streamers'],
    });

    return saved;
  }

  async remove(id: number): Promise<void> {
    const streamer = await this.findOne(id);
    
    // Clear cache
    try {
      await this.redisService.del(this.CACHE_KEY);
    } catch (error) {
      console.error('❌ Error clearing streamers cache:', error.message);
    }

    await this.streamersRepository.remove(streamer);

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'streamer_deleted',
      entity: 'streamer',
      entityId: id,
      payload: { streamerId: id },
      revalidatePaths: ['/streamers'],
    });
  }
}

