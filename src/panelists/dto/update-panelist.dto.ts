import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePanelistDto {
  @ApiProperty({ description: 'Nombre del panelista', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ description: 'URL de la foto del panelista', required: false })
  @IsString()
  @IsOptional()
  photo_url?: string;

  @ApiProperty({ description: 'Biografía del panelista', required: false })
  @IsString()
  @IsOptional()
  bio?: string;
} 