import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateProgramDto {
  @ApiProperty({ description: 'Nombre del programa' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Descripción del programa' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Hora de inicio del programa' })
  @IsString()
  @IsOptional()
  start_time?: string;

  @ApiProperty({ description: 'Hora de fin del programa' })
  @IsString()
  @IsOptional()
  end_time?: string;

  @IsOptional()
  @IsString()
  youtube_url?: string;
}