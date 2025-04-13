import { IsString, IsNotEmpty, IsOptional, IsUrl, ValidateIf } from 'class-validator';
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
  @ValidateIf(o => o.logo_url !== '')
  @IsUrl()
  logo_url?: string;

  @ApiProperty({ description: 'Link al canal de Youtube del canal' })
  @IsString()
  @IsNotEmpty()
  @ValidateIf(o => o.streaming_url !== '')
  @IsUrl()
  streaming_url: string;
}