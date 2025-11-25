import { IsString, IsNotEmpty, IsOptional, IsUrl, IsBoolean, IsArray, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChannelDto {
  @ApiProperty({ description: 'Nombre del canal' })  // Descripción para Swagger
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Descripción del canal' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Logo del canal' })
  @IsString()
  @IsOptional()
  @IsUrl()
  logo_url?: string;

  @ApiProperty({ description: 'Handle de YouTube, sin arroba ni prefijo' })
  @IsString()
  @IsNotEmpty()
  handle: string;

  @ApiProperty({ description: 'Whether the channel is visible on the frontend', default: false })
  @IsBoolean()
  @IsOptional()
  is_visible?: boolean;

  @ApiProperty({ description: 'Background color for the channel logo (hex color or CSS gradient)', required: false })
  @IsString()
  @IsOptional()
  background_color?: string;

  @ApiProperty({ description: 'Whether the channel should only show on days it has programming', default: false })
  @IsBoolean()
  @IsOptional()
  show_only_when_scheduled?: boolean;

  @ApiProperty({ description: 'Array of category IDs to associate with this channel', required: false })
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  category_ids?: number[];

  @ApiProperty({ description: 'Whether YouTube fetching is enabled for this channel', default: true, required: false })
  @IsBoolean()
  @IsOptional()
  youtube_fetch_enabled?: boolean;

  @ApiProperty({ description: 'Whether YouTube fetching is enabled on holidays for this channel', default: true, required: false })
  @IsBoolean()
  @IsOptional()
  youtube_fetch_override_holiday?: boolean;
}