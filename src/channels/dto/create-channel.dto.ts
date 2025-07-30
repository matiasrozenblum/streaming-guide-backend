import { IsString, IsNotEmpty, IsOptional, IsUrl, IsBoolean } from 'class-validator';
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
}