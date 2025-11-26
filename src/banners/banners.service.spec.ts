import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BannersService } from './banners.service';
import { Banner, LinkType, BannerType } from './banners.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('BannersService', () => {
  let service: BannersService;
  let repository: Repository<Banner>;

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    count: jest.fn(),
    findByIds: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockBanner: Banner = {
    id: 1,
    title: 'Test Banner',
    description: 'Test Description',
    image_url: 'https://example.com/image.jpg',
    link_type: LinkType.INTERNAL,
    link_url: '/test',
    is_enabled: true,
    start_date: null,
    end_date: null,
    display_order: 1,
    banner_type: BannerType.NEWS,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BannersService,
        {
          provide: getRepositoryToken(Banner),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<BannersService>(BannersService);
    repository = module.get<Repository<Banner>>(getRepositoryToken(Banner));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAllActive', () => {
    it('should return active banners', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockBanner]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.findAllActive();

      expect(result).toEqual([mockBanner]);
      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('banner');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('banner.is_enabled = :enabled', { enabled: true });
    });
  });

  describe('findAll', () => {
    it('should return all banners', async () => {
      mockRepository.find.mockResolvedValue([mockBanner]);

      const result = await service.findAll();

      expect(result).toEqual([mockBanner]);
      expect(mockRepository.find).toHaveBeenCalledWith({
        order: {
          display_order: 'ASC',
          created_at: 'DESC',
        },
      });
    });
  });

  describe('findOne', () => {
    it('should return a banner by id', async () => {
      mockRepository.findOne.mockResolvedValue(mockBanner);

      const result = await service.findOne(1);

      expect(result).toEqual(mockBanner);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should throw NotFoundException if banner not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const createDto = {
      title: 'New Banner',
      image_url: 'https://example.com/new.jpg',
      link_type: LinkType.NONE,
    };

    it('should create a new banner', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: 5 }),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockRepository.create.mockReturnValue(mockBanner);
      mockRepository.save.mockResolvedValue(mockBanner);

      const result = await service.create(createDto);

      expect(result).toEqual(mockBanner);
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if link_url is missing for non-none link_type', async () => {
      const invalidDto = {
        ...createDto,
        link_type: LinkType.INTERNAL,
        link_url: undefined,
      };

      await expect(service.create(invalidDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if start_date is after end_date', async () => {
      const invalidDto = {
        ...createDto,
        start_date: '2024-12-31T23:59:59Z',
        end_date: '2024-01-01T00:00:00Z',
      };

      await expect(service.create(invalidDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    const updateDto = {
      title: 'Updated Banner',
    };

    it('should update a banner', async () => {
      mockRepository.findOne.mockResolvedValue(mockBanner);
      mockRepository.save.mockResolvedValue({ ...mockBanner, ...updateDto });

      const result = await service.update(1, updateDto);

      expect(result.title).toBe(updateDto.title);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if banner not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.update(999, updateDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove a banner', async () => {
      mockRepository.findOne.mockResolvedValue(mockBanner);
      mockRepository.remove.mockResolvedValue(mockBanner);

      await service.remove(1);

      expect(mockRepository.remove).toHaveBeenCalledWith(mockBanner);
    });

    it('should throw NotFoundException if banner not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('reorder', () => {
    it('should reorder banners', async () => {
      const reorderDto = {
        banners: [
          { id: 1, display_order: 2 },
          { id: 2, display_order: 1 },
        ],
      };

      mockRepository.findByIds.mockResolvedValue([mockBanner, { ...mockBanner, id: 2 }]);
      mockRepository.update.mockResolvedValue({ affected: 1 });
      mockRepository.find.mockResolvedValue([mockBanner]);

      const result = await service.reorder(reorderDto);

      expect(mockRepository.update).toHaveBeenCalledTimes(2);
      expect(result).toEqual([mockBanner]);
    });

    it('should throw NotFoundException if some banners not found', async () => {
      const reorderDto = {
        banners: [
          { id: 1, display_order: 1 },
          { id: 999, display_order: 2 },
        ],
      };

      mockRepository.findByIds.mockResolvedValue([mockBanner]); // Only one banner found

      await expect(service.reorder(reorderDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('should return banner statistics', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { type: 'news', count: '5' },
          { type: 'promotional', count: '3' },
        ]),
      };

      mockRepository.count.mockResolvedValueOnce(10); // total
      mockRepository.count.mockResolvedValueOnce(8); // active
      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getStats();

      expect(result).toEqual({
        total: 10,
        active: 8,
        byType: {
          news: 5,
          promotional: 3,
        },
      });
    });
  });
});
