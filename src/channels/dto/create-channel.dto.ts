import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChannelDto {
  @ApiProperty({ description: 'Nombre del canal' })  // Descripción para Swagger
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Descripción del canal' })
  @IsString()
  @IsOptional()
  description: string;

  @ApiProperty({ description: 'Logo del canal' })
  @IsString()
  @IsOptional()
  logo_url: string;

  @ApiProperty({ description: 'Link al canal de Youtube del canal' })
  @IsString()
  streaming_url: string;
}