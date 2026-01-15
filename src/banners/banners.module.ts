import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BannersService } from './banners.service';
import { BannersController } from './banners.controller';
import { Banner } from './banners.entity';
import { SupabaseStorageService } from './supabase-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([Banner])],
  controllers: [BannersController],
  providers: [BannersService, SupabaseStorageService],
  exports: [BannersService],
})
export class BannersModule {}
