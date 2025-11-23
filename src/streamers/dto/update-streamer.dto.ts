import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUrl, ValidateIf, IsBoolean, IsArray, IsNumber, ValidateNested, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { StreamerServiceDto, StreamingService } from './create-streamer.dto';

export class UpdateStreamerDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  @ValidateIf(o => o.logo_url !== '')
  @IsUrl()
  logo_url?: string;

  @ApiProperty({ required: false, description: 'Whether the streamer is visible on the frontend' })
  @IsBoolean()
  @IsOptional()
  is_visible?: boolean;

  @ApiProperty({ description: 'List of streaming services', type: [StreamerServiceDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StreamerServiceDto)
  @IsOptional()
  services?: StreamerServiceDto[];

  @ApiProperty({ description: 'Array of category IDs to associate with this streamer', required: false })
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  category_ids?: number[];
}

