import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl, ValidateIf } from 'class-validator';

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
} 