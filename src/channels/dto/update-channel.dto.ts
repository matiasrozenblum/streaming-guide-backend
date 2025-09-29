import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl, ValidateIf, IsBoolean } from 'class-validator';

export class UpdateChannelDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false, description: 'Handle de YouTube, sin arroba ni prefijo' })
  @IsString()
  @IsOptional()
  handle?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @ValidateIf(o => o.logo_url !== '')
  @IsUrl()
  logo_url?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false, description: 'Whether the channel is visible on the frontend' })
  @IsBoolean()
  @IsOptional()
  is_visible?: boolean;

  @ApiProperty({ required: false, description: 'Background color for the channel logo (hex color or CSS gradient)' })
  @IsString()
  @IsOptional()
  background_color?: string;

  @ApiProperty({ required: false, description: 'Whether the channel should only show on days it has programming' })
  @IsBoolean()
  @IsOptional()
  show_only_when_scheduled?: boolean;
} 