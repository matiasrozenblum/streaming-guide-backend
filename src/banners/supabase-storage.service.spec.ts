import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseStorageService } from './supabase-storage.service';
import { BadRequestException } from '@nestjs/common';

// Mock @supabase/supabase-js
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

describe('SupabaseStorageService', () => {
  let service: SupabaseStorageService;
  let mockSupabaseClient: any;

  const mockFile: any = {
    fieldname: 'file',
    originalname: 'test.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: 1024 * 1024, // 1MB
    buffer: Buffer.from('test image data'),
    destination: '',
    filename: '',
    path: '',
    stream: null as any,
  };

  beforeEach(async () => {
    // Mock Supabase client
    mockSupabaseClient = {
      storage: {
        from: jest.fn().mockReturnThis(),
        upload: jest.fn(),
        getPublicUrl: jest.fn(),
      },
    };

    const { createClient } = require('@supabase/supabase-js');
    createClient.mockReturnValue(mockSupabaseClient);

    // Set environment variables
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [SupabaseStorageService],
    }).compile();

    service = module.get<SupabaseStorageService>(SupabaseStorageService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  describe('uploadImage', () => {
    it('should upload an image successfully', async () => {
      const expectedUrl = 'https://test.supabase.co/storage/v1/object/public/banners/test-uuid-123.jpg';
      
      mockSupabaseClient.storage.upload.mockResolvedValue({
        data: { path: 'test-uuid-123.jpg' },
        error: null,
      });
      
      mockSupabaseClient.storage.getPublicUrl.mockReturnValue({
        data: { publicUrl: expectedUrl },
      });

      const result = await service.uploadImage(mockFile);

      expect(result).toBe(expectedUrl);
      expect(mockSupabaseClient.storage.from).toHaveBeenCalledWith('banners');
      expect(mockSupabaseClient.storage.upload).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid file type', async () => {
      const invalidFile = {
        ...mockFile,
        mimetype: 'application/pdf',
      };

      await expect(service.uploadImage(invalidFile as any)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw BadRequestException for file size exceeding limit', async () => {
      const largeFile = {
        ...mockFile,
        size: 6 * 1024 * 1024, // 6MB
      };

      await expect(service.uploadImage(largeFile as any)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should throw BadRequestException if Supabase upload fails', async () => {
      mockSupabaseClient.storage.upload.mockResolvedValue({
        data: null,
        error: { message: 'Upload failed' },
      });

      await expect(service.uploadImage(mockFile)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if Supabase is not configured', async () => {
      delete process.env.SUPABASE_URL;
      
      // Create new service instance without config
      const module: TestingModule = await Test.createTestingModule({
        providers: [SupabaseStorageService],
      }).compile();

      const unconfiguredService = module.get<SupabaseStorageService>(SupabaseStorageService);

      await expect(unconfiguredService.uploadImage(mockFile)).rejects.toThrow(
        BadRequestException
      );
    });

    it('should accept PNG files', async () => {
      const pngFile = {
        ...mockFile,
        mimetype: 'image/png',
        originalname: 'test.png',
      };

      mockSupabaseClient.storage.upload.mockResolvedValue({
        data: { path: 'test-uuid-123.png' },
        error: null,
      });
      
      mockSupabaseClient.storage.getPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/banners/test-uuid-123.png' },
      });

      const result = await service.uploadImage(pngFile as any);

      expect(result).toContain('.png');
    });

    it('should accept WebP files', async () => {
      const webpFile = {
        ...mockFile,
        mimetype: 'image/webp',
        originalname: 'test.webp',
      };

      mockSupabaseClient.storage.upload.mockResolvedValue({
        data: { path: 'test-uuid-123.webp' },
        error: null,
      });
      
      mockSupabaseClient.storage.getPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/banners/test-uuid-123.webp' },
      });

      const result = await service.uploadImage(webpFile as any);

      expect(result).toContain('.webp');
    });

    it('should generate unique filename with UUID and timestamp', async () => {
      mockSupabaseClient.storage.upload.mockResolvedValue({
        data: { path: 'test-uuid-123.jpg' },
        error: null,
      });
      
      mockSupabaseClient.storage.getPublicUrl.mockReturnValue({
        data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/banners/test-uuid-123.jpg' },
      });

      await service.uploadImage(mockFile);

      const uploadCall = mockSupabaseClient.storage.upload.mock.calls[0];
      const filename = uploadCall[0];
      
      // Filename should contain UUID pattern and timestamp
      expect(filename).toMatch(/^[a-f0-9-]+-\d+\.jpg$/);
    });
  });
});

