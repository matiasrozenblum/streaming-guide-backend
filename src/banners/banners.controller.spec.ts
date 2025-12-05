import { Test, TestingModule } from '@nestjs/testing';
import { BannersController } from './banners.controller';
import { BannersService } from './banners.service';
import { SupabaseStorageService } from './supabase-storage.service';
import { Banner, LinkType, BannerType } from './banners.entity';

describe('BannersController', () => {
  let controller: BannersController;
  let service: BannersService;

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
    is_fixed: false,
    priority: 0,
    banner_type: BannerType.NEWS,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockBannersService = {
    findAllActive: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    reorder: jest.fn(),
    getStats: jest.fn(),
  };

  const mockSupabaseStorageService = {
    uploadImage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BannersController],
      providers: [
        {
          provide: BannersService,
          useValue: mockBannersService,
        },
        {
          provide: SupabaseStorageService,
          useValue: mockSupabaseStorageService,
        },
      ],
    }).compile();

    controller = module.get<BannersController>(BannersController);
    service = module.get<BannersService>(BannersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAllActive', () => {
    it('should return active banners', async () => {
      const expectedBanners = [mockBanner];
      mockBannersService.findAllActive.mockResolvedValue(expectedBanners);

      const result = await controller.findAllActive();

      expect(result).toEqual(expectedBanners);
      expect(service.findAllActive).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all banners', async () => {
      const expectedBanners = [mockBanner];
      mockBannersService.findAll.mockResolvedValue(expectedBanners);

      const result = await controller.findAll();

      expect(result).toEqual(expectedBanners);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a banner by id', async () => {
      mockBannersService.findOne.mockResolvedValue(mockBanner);

      const result = await controller.findOne('1');

      expect(result).toEqual(mockBanner);
      expect(service.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('create', () => {
    it('should create a new banner', async () => {
      const createDto = {
        title: 'New Banner',
        image_url: 'https://example.com/new.jpg',
        link_type: LinkType.NONE,
      };
      mockBannersService.create.mockResolvedValue(mockBanner);

      const result = await controller.create(createDto);

      expect(result).toEqual(mockBanner);
      expect(service.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('update', () => {
    it('should update a banner', async () => {
      const updateDto = { title: 'Updated Banner' };
      const updatedBanner = { ...mockBanner, ...updateDto };
      mockBannersService.update.mockResolvedValue(updatedBanner);

      const result = await controller.update('1', updateDto);

      expect(result).toEqual(updatedBanner);
      expect(service.update).toHaveBeenCalledWith(1, updateDto);
    });
  });

  describe('remove', () => {
    it('should remove a banner', async () => {
      mockBannersService.remove.mockResolvedValue(undefined);

      await controller.remove('1');

      expect(service.remove).toHaveBeenCalledWith(1);
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
      const reorderedBanners = [mockBanner];
      mockBannersService.reorder.mockResolvedValue(reorderedBanners);

      const result = await controller.reorder(reorderDto);

      expect(result).toEqual(reorderedBanners);
      expect(service.reorder).toHaveBeenCalledWith(reorderDto);
    });
  });

  describe('getStats', () => {
    it('should return banner statistics', async () => {
      const expectedStats = {
        total: 10,
        active: 8,
        byType: { news: 5, promotional: 3 },
      };
      mockBannersService.getStats.mockResolvedValue(expectedStats);

      const result = await controller.getStats();

      expect(result).toEqual(expectedStats);
      expect(service.getStats).toHaveBeenCalled();
    });
  });

  describe('uploadImage', () => {
    it('should upload an image and return URL', async () => {
      const mockFile = {
        fieldname: 'file',
        originalname: 'test.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        size: 1024,
        buffer: Buffer.from('test'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      } as any;

      const expectedUrl = 'https://example.com/uploaded-image.jpg';
      mockSupabaseStorageService.uploadImage.mockResolvedValue(expectedUrl);

      const result = await controller.uploadImage(mockFile);

      expect(result).toEqual({ url: expectedUrl });
      expect(mockSupabaseStorageService.uploadImage).toHaveBeenCalledWith(mockFile);
    });

    it('should throw BadRequestException if no file provided', async () => {
      await expect(controller.uploadImage(null as any)).rejects.toThrow();
    });
  });
});
