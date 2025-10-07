import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoriesService } from './categories.service';
import { Category } from './categories.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { NotFoundException } from '@nestjs/common';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let repository: Repository<Category>;

  const mockCategories: Category[] = [
    {
      id: 1,
      name: 'Deportes',
      description: 'Canales de deportes y fútbol',
      color: '#FF6B6B',
      order: 1,
      is_visible: true,
      channels: [],
    },
    {
      id: 2,
      name: 'Noticias',
      description: 'Canales de noticias y periodismo',
      color: '#4ECDC4',
      order: 2,
      is_visible: true,
      channels: [],
    },
  ];

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: getRepositoryToken(Category),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    repository = module.get<Repository<Category>>(getRepositoryToken(Category));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new category', async () => {
      const createCategoryDto: CreateCategoryDto = {
        name: 'Humor',
        description: 'Canales de comedia y humor',
        color: '#FFEAA7',
      };

      const expectedCategory = {
        id: 3,
        ...createCategoryDto,
        order: 0,
        channels: [],
      };

      mockRepository.create.mockReturnValue(expectedCategory);
      mockRepository.save.mockResolvedValue(expectedCategory);

      const result = await service.create(createCategoryDto);

      expect(mockRepository.create).toHaveBeenCalledWith(createCategoryDto);
      expect(mockRepository.save).toHaveBeenCalledWith(expectedCategory);
      expect(result).toEqual(expectedCategory);
    });

    it('should create a category without optional fields', async () => {
      const createCategoryDto: CreateCategoryDto = {
        name: 'Tecnología',
      };

      const expectedCategory = {
        id: 4,
        ...createCategoryDto,
        order: 0,
        channels: [],
      };

      mockRepository.create.mockReturnValue(expectedCategory);
      mockRepository.save.mockResolvedValue(expectedCategory);

      const result = await service.create(createCategoryDto);

      expect(result).toEqual(expectedCategory);
    });
  });

  describe('findAll', () => {
    it('should return all categories ordered by order and name', async () => {
      mockRepository.find.mockResolvedValue(mockCategories);

      const result = await service.findAll();

      expect(mockRepository.find).toHaveBeenCalledWith({
        relations: ['channels'],
        order: { order: 'ASC', name: 'ASC' },
      });
      expect(result).toEqual(mockCategories);
    });

    it('should return empty array when no categories exist', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a category by id', async () => {
      const categoryId = 1;
      const expectedCategory = mockCategories[0];

      mockRepository.findOne.mockResolvedValue(expectedCategory);

      const result = await service.findOne(categoryId);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: categoryId },
        relations: ['channels'],
      });
      expect(result).toEqual(expectedCategory);
    });

    it('should throw NotFoundException when category not found', async () => {
      const categoryId = 999;

      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(categoryId)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(categoryId)).rejects.toThrow(
        `Category with ID ${categoryId} not found`,
      );
    });
  });

  describe('findByName', () => {
    it('should return a category by name', async () => {
      const categoryName = 'Deportes';
      const expectedCategory = mockCategories[0];

      mockRepository.findOne.mockResolvedValue(expectedCategory);

      const result = await service.findByName(categoryName);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { name: categoryName },
      });
      expect(result).toEqual(expectedCategory);
    });

    it('should return null when category not found by name', async () => {
      const categoryName = 'NonExistent';

      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findByName(categoryName);

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should update a category', async () => {
      const categoryId = 1;
      const updateCategoryDto: UpdateCategoryDto = {
        name: 'Sports',
        color: '#FF0000',
      };

      const existingCategory = { ...mockCategories[0] };
      const updatedCategory = { ...existingCategory, ...updateCategoryDto };

      mockRepository.findOne.mockResolvedValue(existingCategory);
      mockRepository.save.mockResolvedValue(updatedCategory);

      const result = await service.update(categoryId, updateCategoryDto);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: categoryId },
        relations: ['channels'],
      });
      expect(mockRepository.save).toHaveBeenCalledWith(updatedCategory);
      expect(result).toEqual(updatedCategory);
    });

    it('should throw NotFoundException when updating non-existent category', async () => {
      const categoryId = 999;
      const updateCategoryDto: UpdateCategoryDto = {
        name: 'Updated Name',
      };

      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update(categoryId, updateCategoryDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should remove a category', async () => {
      const categoryId = 1;
      const categoryToRemove = mockCategories[0];

      mockRepository.findOne.mockResolvedValue(categoryToRemove);
      mockRepository.remove.mockResolvedValue(categoryToRemove);

      await service.remove(categoryId);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: categoryId },
        relations: ['channels'],
      });
      expect(mockRepository.remove).toHaveBeenCalledWith(categoryToRemove);
    });

    it('should throw NotFoundException when removing non-existent category', async () => {
      const categoryId = 999;

      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(categoryId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('searchByName', () => {
    it('should search categories by name using ILIKE', async () => {
      const searchTerm = 'deport';
      const expectedResults = [mockCategories[0]];

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(expectedResults);

      const result = await service.searchByName(searchTerm);

      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('category');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'category.name ILIKE :searchTerm',
        { searchTerm: `%${searchTerm}%` },
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('category.name', 'ASC');
      expect(result).toEqual(expectedResults);
    });

    it('should return empty array when no matches found', async () => {
      const searchTerm = 'nonexistent';

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.searchByName(searchTerm);

      expect(result).toEqual([]);
    });

    it('should handle case-insensitive search', async () => {
      const searchTerm = 'NOTICIAS';
      const expectedResults = [mockCategories[1]];

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(expectedResults);

      const result = await service.searchByName(searchTerm);

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'category.name ILIKE :searchTerm',
        { searchTerm: '%NOTICIAS%' },
      );
      expect(result).toEqual(expectedResults);
    });
  });
});
