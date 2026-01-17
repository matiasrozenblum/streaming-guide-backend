import { IsString, IsOptional, IsEnum, IsBoolean, IsDateString, IsInt, IsUrl, ValidateIf, Validate } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LinkType, BannerType } from '../banners.entity';

export class CreateBannerDto {
  @ApiProperty({ description: 'Banner title' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Banner description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Legacy banner image URL (fallback)' })
  @IsString()
  @IsUrl()
  image_url: string;

  @ApiPropertyOptional({ description: 'Desktop image URL (recommended 1920x400)' })
  @IsOptional()
  @IsString()
  @IsUrl()
  image_url_desktop?: string;

  @ApiPropertyOptional({ description: 'Mobile image URL (recommended 1200x400)' })
  @IsOptional()
  @IsString()
  @IsUrl()
  image_url_mobile?: string;

  @ApiPropertyOptional({ 
    description: 'Link type',
    enum: LinkType,
    default: LinkType.NONE
  })
  @IsOptional()
  @IsEnum(LinkType)
  link_type?: LinkType;

  @ApiPropertyOptional({ description: 'Link URL (required if link_type is not "none")' })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.link_type && o.link_type !== LinkType.NONE)
  link_url?: string;

  @ApiPropertyOptional({ 
    description: 'Whether the banner is enabled',
    default: true
  })
  @IsOptional()
  @IsBoolean()
  is_enabled?: boolean;

  @ApiPropertyOptional({ description: 'Banner start date (ISO string). Required for timed banners, ignored for fixed banners.' })
  @IsOptional()
  @ValidateIf((o) => !o.is_fixed)
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ description: 'Banner end date (ISO string). Required for timed banners, ignored for fixed banners.' })
  @IsOptional()
  @ValidateIf((o) => !o.is_fixed)
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ 
    description: 'Display order (lower numbers appear first)',
    default: 0
  })
  @IsOptional()
  @IsInt()
  display_order?: number;

  @ApiPropertyOptional({ 
    description: 'Whether this is a fixed banner (always active, no date restrictions)',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  is_fixed?: boolean;

  @ApiPropertyOptional({ 
    description: 'Priority for ordering (lower numbers appear first). Timed banners always appear before fixed banners.',
    default: 0
  })
  @IsOptional()
  @IsInt()
  priority?: number;

  @ApiPropertyOptional({ 
    description: 'Banner type',
    enum: BannerType,
    default: BannerType.NEWS
  })
  @IsOptional()
  @IsEnum(BannerType)
  banner_type?: BannerType;
}
