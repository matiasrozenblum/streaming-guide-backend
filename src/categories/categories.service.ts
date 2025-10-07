import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Category } from './categories.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoriesRepository: Repository<Category>,
    private dataSource: DataSource,
  ) {}

  async create(createCategoryDto: CreateCategoryDto): Promise<Category> {
    const category = this.categoriesRepository.create(createCategoryDto);
    return await this.categoriesRepository.save(category);
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
    return await this.categoriesRepository.save(category);
  }

  async remove(id: number): Promise<void> {
    const category = await this.findOne(id);
    await this.categoriesRepository.remove(category);
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
  }
}
