import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Category } from './categories.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { RedisService } from '../redis/redis.service';
import { NotifyAndRevalidateUtil } from '../utils/notify-and-revalidate.util';

@Injectable()
export class CategoriesService {
  private notifyUtil: NotifyAndRevalidateUtil;

  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    private dataSource: DataSource,
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    this.notifyUtil = new NotifyAndRevalidateUtil(
      this.redisService,
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001',
      this.configService.get<string>('REVALIDATE_SECRET') || '',
    );
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
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'category_updated',
      entity: 'category',
      entityId: id,
      payload: { category: updated },
      revalidatePaths: ['/'],
    });

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
    await this.notifyUtil.notifyAndRevalidate({
      eventType: 'categories_reordered',
      entity: 'category',
      entityId: 'all',
      payload: { categoryIds },
      revalidatePaths: ['/'],
    });
  }
}
