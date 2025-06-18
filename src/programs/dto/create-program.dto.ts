import { IsString, IsNotEmpty, IsOptional, IsTimeZone } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProgramDto {
  @ApiProperty({ description: 'Nombre del programa' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Descripción del programa', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  logo_url?: string;

  @IsString()
  @IsOptional()
  youtube_url?: string;

  @ApiProperty({ description: 'ID del canal asociado al programa' })
  @IsNotEmpty()
  channel_id: number;

  @IsOptional()
  @IsString()
  style_override?: string;
}