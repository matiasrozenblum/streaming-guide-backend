import { IsString, IsNotEmpty, IsOptional, IsHexColor, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ description: 'Nombre de la categoría' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Descripción de la categoría', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Color hexadecimal para la categoría', required: false })
  @IsString()
  @IsOptional()
  @IsHexColor()
  color?: string;

  @ApiProperty({ description: 'Si la categoría es visible', required: false, default: true })
  @IsBoolean()
  @IsOptional()
  is_visible?: boolean;
}
