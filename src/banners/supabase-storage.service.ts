import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name);
  private supabase: SupabaseClient | null = null;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn('Supabase credentials not configured. Image upload will not work.');
      return;
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.logger.log('Supabase Storage client initialized');
  }

  /**
   * Upload an image file to Supabase Storage
   * @param file Express file object
   * @param bucketName Storage bucket name (default: 'banners')
   * @returns Public URL of the uploaded file
   */
  async uploadImage(
    file: Express.Multer.File,
    bucketName: string = 'banners'
  ): Promise<string> {
    if (!this.supabase) {
      throw new BadRequestException('Supabase Storage is not configured');
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException(`File size exceeds maximum of ${maxSize / 1024 / 1024}MB`);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const uuid = uuidv4();
    const extension = file.originalname.split('.').pop() || 'jpg';
    const filename = `${uuid}-${timestamp}.${extension}`;

    try {
      // Upload file to Supabase Storage
      const { data, error } = await this.supabase.storage
        .from(bucketName)
        .upload(filename, file.buffer, {
          contentType: file.mimetype,
          upsert: false, // Don't overwrite existing files
        });

      if (error) {
        this.logger.error('Supabase Storage upload error:', error);
        throw new BadRequestException(`Failed to upload image: ${error.message}`);
      }

      // Get public URL
      const { data: urlData } = this.supabase.storage
        .from(bucketName)
        .getPublicUrl(filename);

      if (!urlData?.publicUrl) {
        throw new BadRequestException('Failed to get public URL for uploaded image');
      }

      this.logger.debug(`Image uploaded successfully: ${filename}`);
      return urlData.publicUrl;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error('Unexpected error during image upload:', error);
      throw new BadRequestException('Failed to upload image');
    }
  }
}

