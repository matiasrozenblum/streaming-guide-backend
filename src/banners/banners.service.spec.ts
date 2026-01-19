import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
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
    image_url_desktop: null,
    image_url_mobile: null,
    link_type: LinkType.INTERNAL,
    link_url: '/test',
    is_enabled: true,
    start_date: null,
    end_date: null,
    display_order: 1,
    is_fixed: false,
    priority: 0,
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
    it('should return active banners with fixed/timed logic', async () => {
      const now = new Date();
      const timedBanner: Banner = {
        ...mockBanner,
        id: 1,
        is_fixed: false,
        priority: 1,
        start_date: new Date(now.getTime() - 86400000), // Yesterday
        end_date: new Date(now.getTime() + 86400000), // Tomorrow
      };
      const fixedBanner: Banner = {
        ...mockBanner,
        id: 2,
        is_fixed: true,
        priority: 1,
        start_date: null,
        end_date: null,
      };

      mockRepository.find.mockResolvedValue([timedBanner, fixedBanner]);

      const result = await service.findAllActive();

      expect(result.length).toBeGreaterThan(0);
      expect(mockRepository.find).toHaveBeenCalled();
    });

    it('should separate timed and fixed banners correctly', async () => {
      const now = new Date();
      const timedBanner: Banner = {
        ...mockBanner,
        id: 1,
        is_fixed: false,
        priority: 1,
        start_date: new Date(now.getTime() - 86400000),
        end_date: new Date(now.getTime() + 86400000),
      };
      const fixedBanner: Banner = {
        ...mockBanner,
        id: 2,
        is_fixed: true,
        priority: 2,
        start_date: null,
        end_date: null,
      };

      mockRepository.find.mockResolvedValue([timedBanner, fixedBanner]);

      const result = await service.findAllActive();

      // Timed banners should come first
      const timedIndex = result.findIndex(b => b.id === 1);
      const fixedIndex = result.findIndex(b => b.id === 2);
      expect(timedIndex).toBeLessThan(fixedIndex);
    });

    it('should sort banners by priority', async () => {
      const now = new Date();
      const banner1: Banner = {
        ...mockBanner,
        id: 1,
        is_fixed: false,
        priority: 3,
        start_date: new Date(now.getTime() - 86400000),
        end_date: new Date(now.getTime() + 86400000),
      };
      const banner2: Banner = {
        ...mockBanner,
        id: 2,
        is_fixed: false,
        priority: 1,
        start_date: new Date(now.getTime() - 86400000),
        end_date: new Date(now.getTime() + 86400000),
      };

      mockRepository.find.mockResolvedValue([banner1, banner2]);

      const result = await service.findAllActive();

      // Banner with priority 1 should come before priority 3
      const banner2Index = result.findIndex(b => b.id === 2);
      const banner1Index = result.findIndex(b => b.id === 1);
      expect(banner2Index).toBeLessThan(banner1Index);
    });

    it('should auto-enable fixed banners when less than 2 banners are active', async () => {
      const now = new Date();
      const timedBanner: Banner = {
        ...mockBanner,
        id: 1,
        is_fixed: false,
        priority: 1,
        start_date: new Date(now.getTime() - 86400000),
        end_date: new Date(now.getTime() + 86400000),
      };
      const disabledFixedBanner: Banner = {
        ...mockBanner,
        id: 2,
        is_fixed: true,
        priority: 1,
        is_enabled: false,
        start_date: null,
        end_date: null,
      };

      mockRepository.find.mockResolvedValue([timedBanner, disabledFixedBanner]);
      // Mock save to return the updated banner
      mockRepository.save.mockImplementation((banner) => Promise.resolve({ ...banner, is_enabled: true }));

      const result = await service.findAllActive();

      // Should have at least 2 banners
      expect(result.length).toBeGreaterThanOrEqual(2);
      // Should have called save to enable the fixed banner
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should not auto-enable more than 2 fixed banners', async () => {
      const now = new Date();
      const timedBanner: Banner = {
        ...mockBanner,
        id: 1,
        is_fixed: false,
        priority: 1,
        start_date: new Date(now.getTime() - 86400000),
        end_date: new Date(now.getTime() + 86400000),
      };
      const disabledFixed1: Banner = {
        ...mockBanner,
        id: 2,
        is_fixed: true,
        priority: 1,
        is_enabled: false,
        start_date: null,
        end_date: null,
      };
      const disabledFixed2: Banner = {
        ...mockBanner,
        id: 3,
        is_fixed: true,
        priority: 2,
        is_enabled: false,
        start_date: null,
        end_date: null,
      };
      const disabledFixed3: Banner = {
        ...mockBanner,
        id: 4,
        is_fixed: true,
        priority: 3,
        is_enabled: false,
        start_date: null,
        end_date: null,
      };

      mockRepository.find.mockResolvedValue([timedBanner, disabledFixed1, disabledFixed2, disabledFixed3]);
      mockRepository.save.mockImplementation((banner) => Promise.resolve({ ...banner, is_enabled: true }));

      const result = await service.findAllActive();

      // Should only auto-enable up to 2 fixed banners (we have 1 timed, so need 1 more = 1 auto-enabled)
      // Total enabled fixed should be at most 2 (including any already enabled)
      const enabledFixedCount = result.filter(b => b.is_fixed && b.is_enabled).length;
      expect(enabledFixedCount).toBeLessThanOrEqual(2);
      // Should have called save at most once (for 1 auto-enable)
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should return empty array if banner table does not exist', async () => {
      const queryError = new QueryFailedError('', [], { code: '42P01' } as any);
      mockRepository.find.mockRejectedValue(queryError);

      const result = await service.findAllActive();

      expect(result).toEqual([]);
    });

    it('should re-throw non-table-missing errors', async () => {
      const otherError = new Error('Database connection failed');
      mockRepository.find.mockRejectedValue(otherError);

      await expect(service.findAllActive()).rejects.toThrow('Database connection failed');
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

      const timedDto = {
        ...createDto,
        start_date: '2024-01-01T00:00:00Z',
        end_date: '2024-12-31T23:59:59Z',
      };

      const result = await service.create(timedDto);

      expect(result).toEqual(mockBanner);
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should create a fixed banner without dates', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max: 5 }),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockRepository.create.mockReturnValue(mockBanner);
      mockRepository.save.mockResolvedValue(mockBanner);

      const fixedDto = {
        ...createDto,
        is_fixed: true,
      };

      const result = await service.create(fixedDto);

      expect(result).toEqual(mockBanner);
      expect(mockRepository.create).toHaveBeenCalled();
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

    it('should throw BadRequestException if timed banner missing dates', async () => {
      const invalidDto = {
        ...createDto,
        is_fixed: false,
        start_date: '2024-01-01T00:00:00Z',
        // end_date missing
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

    it('should clear dates when changing to fixed banner', async () => {
      const bannerWithDates = {
        ...mockBanner,
        start_date: new Date(),
        end_date: new Date(),
      };
      mockRepository.findOne.mockResolvedValue(bannerWithDates);
      mockRepository.save.mockResolvedValue({ ...bannerWithDates, is_fixed: true, start_date: null, end_date: null });

      const result = await service.update(1, { is_fixed: true });

      expect(result.is_fixed).toBe(true);
      expect(result.start_date).toBeNull();
      expect(result.end_date).toBeNull();
    });

    it('should require dates when changing from fixed to timed', async () => {
      const fixedBanner = {
        ...mockBanner,
        is_fixed: true,
        start_date: null,
        end_date: null,
      };
      mockRepository.findOne.mockResolvedValue(fixedBanner);

      await expect(
        service.update(1, { is_fixed: false, start_date: '2024-01-01T00:00:00Z' })
      ).rejects.toThrow(BadRequestException);
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
