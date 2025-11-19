import { IsString, IsNotEmpty, IsOptional, IsUrl, IsBoolean, IsArray, IsNumber, ValidateNested, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum StreamingService {
  TWITCH = 'twitch',
  KICK = 'kick',
  YOUTUBE = 'youtube',
}

export class StreamerServiceDto {
  @ApiProperty({ description: 'Streaming service type', enum: StreamingService })
  @IsEnum(StreamingService)
  service: StreamingService;

  @ApiProperty({ description: 'URL to the streamer\'s channel on this service' })
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  url: string;

  @ApiProperty({ description: 'Username on this service (optional)', required: false })
  @IsString()
  @IsOptional()
  username?: string;
}

export class CreateStreamerDto {
  @ApiProperty({ description: 'Nombre del streamer' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Logo del streamer', required: false })
  @IsString()
  @IsOptional()
  @IsUrl()
  logo_url?: string;

  @ApiProperty({ description: 'Whether the streamer is visible on the frontend', default: true })
  @IsBoolean()
  @IsOptional()
  is_visible?: boolean;

  @ApiProperty({ description: 'List of streaming services', type: [StreamerServiceDto] })
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => StreamerServiceDto)
  services: StreamerServiceDto[];

  @ApiProperty({ description: 'Array of category IDs to associate with this streamer', required: false })
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  category_ids?: number[];
}

