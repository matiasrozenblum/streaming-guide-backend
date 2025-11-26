import { IsString, IsOptional, IsEnum, IsBoolean, IsDateString, IsInt, IsUrl, ValidateIf } from 'class-validator';
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

  @ApiProperty({ description: 'Banner image URL' })
  @IsString()
  @IsUrl()
  image_url: string;

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

  @ApiPropertyOptional({ description: 'Banner start date (ISO string)' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ description: 'Banner end date (ISO string)' })
  @IsOptional()
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
    description: 'Banner type',
    enum: BannerType,
    default: BannerType.NEWS
  })
  @IsOptional()
  @IsEnum(BannerType)
  banner_type?: BannerType;
}
