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
  startTime?: string;

  @ApiProperty({ description: 'Hora de fin del programa' })
  @IsString()
  @IsOptional()
  endTime?: string;

  @IsOptional()
  @IsString()
  youtube_url?: string;
}