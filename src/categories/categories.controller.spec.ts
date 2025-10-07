import { Test, TestingModule } from '@nestjs/testing';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './categories.entity';
import { NotFoundException } from '@nestjs/common';

describe('CategoriesController', () => {
  let controller: CategoriesController;
  let service: CategoriesService;

  const mockCategory: Category = {
    id: 1,
    name: 'Deportes',
    description: 'Canales de deportes y fútbol',
    color: '#FF6B6B',
    order: 1,
    is_visible: true,
    channels: [],
  };

  const mockCategoriesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    searchByName: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CategoriesController],
      providers: [
        {
          provide: CategoriesService,
          useValue: mockCategoriesService,
        },
      ],
    }).compile();

    controller = module.get<CategoriesController>(CategoriesController);
    service = module.get<CategoriesService>(CategoriesService);
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
        id: 2,
        ...createCategoryDto,
        order: 0,
        channels: [],
      };

      mockCategoriesService.create.mockResolvedValue(expectedCategory);

      const result = await controller.create(createCategoryDto);

      expect(mockCategoriesService.create).toHaveBeenCalledWith(createCategoryDto);
      expect(result).toEqual(expectedCategory);
    });

    it('should create a category with minimal data', async () => {
      const createCategoryDto: CreateCategoryDto = {
        name: 'Tecnología',
      };

      const expectedCategory = {
        id: 3,
        ...createCategoryDto,
        order: 0,
        channels: [],
      };

      mockCategoriesService.create.mockResolvedValue(expectedCategory);

      const result = await controller.create(createCategoryDto);

      expect(result).toEqual(expectedCategory);
    });
  });

  describe('findAll', () => {
    it('should return all categories', async () => {
      const mockCategories = [mockCategory];
      mockCategoriesService.findAll.mockResolvedValue(mockCategories);

      const result = await controller.findAll();

      expect(mockCategoriesService.findAll).toHaveBeenCalled();
      expect(result).toEqual(mockCategories);
    });

    it('should return empty array when no categories exist', async () => {
      mockCategoriesService.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('search', () => {
    it('should search categories by name', async () => {
      const searchTerm = 'deport';
      const expectedResults = [mockCategory];

      mockCategoriesService.searchByName.mockResolvedValue(expectedResults);

      const result = await controller.search(searchTerm);

      expect(mockCategoriesService.searchByName).toHaveBeenCalledWith(searchTerm);
      expect(result).toEqual(expectedResults);
    });

    it('should return empty array when no matches found', async () => {
      const searchTerm = 'nonexistent';
      mockCategoriesService.searchByName.mockResolvedValue([]);

      const result = await controller.search(searchTerm);

      expect(result).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a category by id', async () => {
      const categoryId = '1';
      mockCategoriesService.findOne.mockResolvedValue(mockCategory);

      const result = await controller.findOne(categoryId);

      expect(mockCategoriesService.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual(mockCategory);
    });

    it('should throw NotFoundException when category not found', async () => {
      const categoryId = '999';
      mockCategoriesService.findOne.mockRejectedValue(
        new NotFoundException(`Category with ID 999 not found`),
      );

      await expect(controller.findOne(categoryId)).rejects.toThrow(NotFoundException);
      expect(mockCategoriesService.findOne).toHaveBeenCalledWith(999);
    });
  });

  describe('update', () => {
    it('should update a category', async () => {
      const categoryId = '1';
      const updateCategoryDto: UpdateCategoryDto = {
        name: 'Sports',
        color: '#FF0000',
      };

      const updatedCategory = { ...mockCategory, ...updateCategoryDto };
      mockCategoriesService.update.mockResolvedValue(updatedCategory);

      const result = await controller.update(categoryId, updateCategoryDto);

      expect(mockCategoriesService.update).toHaveBeenCalledWith(1, updateCategoryDto);
      expect(result).toEqual(updatedCategory);
    });

    it('should throw NotFoundException when updating non-existent category', async () => {
      const categoryId = '999';
      const updateCategoryDto: UpdateCategoryDto = {
        name: 'Updated Name',
      };

      mockCategoriesService.update.mockRejectedValue(
        new NotFoundException(`Category with ID 999 not found`),
      );

      await expect(controller.update(categoryId, updateCategoryDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should remove a category', async () => {
      const categoryId = '1';
      mockCategoriesService.remove.mockResolvedValue(undefined);

      await controller.remove(categoryId);

      expect(mockCategoriesService.remove).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when removing non-existent category', async () => {
      const categoryId = '999';
      mockCategoriesService.remove.mockRejectedValue(
        new NotFoundException(`Category with ID 999 not found`),
      );

      await expect(controller.remove(categoryId)).rejects.toThrow(NotFoundException);
    });
  });
});
