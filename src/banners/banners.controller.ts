import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  HttpCode,
  HttpStatus,
  Put,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { BannersService } from './banners.service';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';
import { ReorderBannersDto } from './dto/reorder-banners.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Banner } from './banners.entity';
import { SupabaseStorageService } from './supabase-storage.service';

@ApiTags('banners')
@Controller('banners')
export class BannersController {
  constructor(
    private readonly bannersService: BannersService,
    private readonly supabaseStorageService: SupabaseStorageService,
  ) {}

  @Get('active')
  @ApiOperation({ 
    summary: 'Get all active banners',
    description: 'Returns all enabled banners within their date range, ordered by display_order'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Active banners retrieved successfully',
    type: [Banner]
  })
  async findAllActive(): Promise<Banner[]> {
    return this.bannersService.findAllActive();
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get banner statistics',
    description: 'Returns statistics about banners (admin only)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Banner statistics retrieved successfully'
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async getStats() {
    return this.bannersService.getStats();
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get all banners',
    description: 'Returns all banners (admin only)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'All banners retrieved successfully',
    type: [Banner]
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAll(): Promise<Banner[]> {
    return this.bannersService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Get a banner by ID',
    description: 'Returns a single banner by ID (admin only)'
  })
  @ApiParam({ name: 'id', description: 'Banner ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Banner retrieved successfully',
    type: Banner
  })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findOne(@Param('id') id: string): Promise<Banner> {
    return this.bannersService.findOne(+id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Create a new banner',
    description: 'Creates a new banner (admin only)'
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Banner created successfully',
    type: Banner
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async create(@Body() createBannerDto: CreateBannerDto): Promise<Banner> {
    return this.bannersService.create(createBannerDto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Update a banner',
    description: 'Updates an existing banner (admin only)'
  })
  @ApiParam({ name: 'id', description: 'Banner ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Banner updated successfully',
    type: Banner
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async update(
    @Param('id') id: string,
    @Body() updateBannerDto: UpdateBannerDto,
  ): Promise<Banner> {
    return this.bannersService.update(+id, updateBannerDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ 
    summary: 'Delete a banner',
    description: 'Deletes a banner (admin only)'
  })
  @ApiParam({ name: 'id', description: 'Banner ID' })
  @ApiResponse({ status: 204, description: 'Banner deleted successfully' })
  @ApiResponse({ status: 404, description: 'Banner not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.bannersService.remove(+id);
  }

  @Put('reorder')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ 
    summary: 'Reorder banners',
    description: 'Updates the display order of multiple banners (admin only)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Banners reordered successfully',
    type: [Banner]
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'One or more banners not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async reorder(@Body() reorderDto: ReorderBannersDto): Promise<Banner[]> {
    return this.bannersService.reorder(reorderDto);
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ 
    summary: 'Upload banner image',
    description: 'Uploads an image file to Supabase Storage and returns the public URL (admin only)'
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ 
    status: 201, 
    description: 'Image uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Public URL of the uploaded image',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request (invalid file type or size)' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async uploadImage(@UploadedFile() file: Express.Multer.File): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const url = await this.supabaseStorageService.uploadImage(file);
    return { url };
  }
}
