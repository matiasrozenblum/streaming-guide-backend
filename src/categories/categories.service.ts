import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Category } from './categories.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { RedisService } from '../redis/redis.service';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://staging.laguiadelstreaming.com';
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || 'changeme';
const VERCEL_BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

@Injectable()
export class CategoriesService {
  private notifyUtil: NotifyAndRevalidateUtil;

  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    private dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {
    console.log('[CategoriesService] Initializing NotifyAndRevalidateUtil...');
    console.log('[CategoriesService] FRONTEND_URL:', FRONTEND_URL);
    console.log('[CategoriesService] REVALIDATE_SECRET:', REVALIDATE_SECRET ? REVALIDATE_SECRET.substring(0, 8) + '...' : 'undefined');
    console.log('[CategoriesService] VERCEL_BYPASS_SECRET:', VERCEL_BYPASS_SECRET ? VERCEL_BYPASS_SECRET.substring(0, 8) + '...' : 'undefined');
    
    this.notifyUtil = new NotifyAndRevalidateUtil(
      this.redisService,
      FRONTEND_URL,
      REVALIDATE_SECRET,
      VERCEL_BYPASS_SECRET,
    );
    console.log('[CategoriesService] NotifyAndRevalidateUtil initialized successfully');
  }

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    const category = this.categoriesRepository.create(createCategoryDto);
    const saved = await this.categoriesRepository.save(category);

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'category_created',
      entity: 'category',
      entityId: saved.id,
      payload: { category: saved },
      revalidatePaths: ['/'],
    });

    return saved;
  }

  async findAll(): Promise<Category[]> {
    return await this.categoriesRepository.find({
      where: { is_visible: true },
      relations: ['channels'],
      order: { order: 'ASC', name: 'ASC' },
    });
  }

  async findAllForAdmin(): Promise<Category[]> {
    return await this.categoriesRepository.find({
      relations: ['channels'],
      order: { order: 'ASC', name: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Category> {
    const category = await this.categoriesRepository.findOne({
      where: { id },
      relations: ['channels'],
    });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return category;
  }

  async findByName(name: string): Promise<Category | null> {
    return await this.categoriesRepository.findOne({
      where: { name },
    });
  }

  async update(id: number, updateCategoryDto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findOne(id);
    Object.assign(category, updateCategoryDto);
    const updated = await this.categoriesRepository.save(category);

    // Notify and revalidate
    console.log('[CategoriesService] Triggering revalidation for category update...');
    console.log('[CategoriesService] notifyUtil available:', !!this.notifyUtil);
    
    if (!this.notifyUtil) {
      console.error('[CategoriesService] ❌ notifyUtil is not available!');
      return updated;
    }
    
    try {
      await this.notifyUtil.notifyAndRevalidate({
        eventType: 'category_updated',
        entity: 'category',
        entityId: id,
        payload: { category: updated },
        revalidatePaths: ['/'],
      });
      console.log('[CategoriesService] Revalidation triggered successfully');
    } catch (error) {
      console.error('[CategoriesService] ❌ Error during revalidation:', error);
    }

    return updated;
  }

  async remove(id: number): Promise<void> {
    const category = await this.findOne(id);
    await this.categoriesRepository.remove(category);

    // Notify and revalidate
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'category_deleted',
      entity: 'category',
      entityId: id,
      payload: {},
      revalidatePaths: ['/'],
    });
  }

  async searchByName(searchTerm: string): Promise<Category[]> {
    return await this.categoriesRepository
      .createQueryBuilder('category')
      .where('category.name ILIKE :searchTerm', { searchTerm: `%${searchTerm}%` })
      .orderBy('category.name', 'ASC')
      .getMany();
  }

  async reorder(categoryIds: number[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      for (let i = 0; i < categoryIds.length; i++) {
        await manager.update(Category, categoryIds[i], { order: i + 1 });
      }
    });

    // Notify and revalidate
    console.log('[CategoriesService] Triggering revalidation for categories reorder...');
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'categories_reordered',
      entity: 'category',
      entityId: 'all',
      payload: { categoryIds },
      revalidatePaths: ['/'],
    });
    console.log('[CategoriesService] Revalidation triggered successfully');
  }
}
