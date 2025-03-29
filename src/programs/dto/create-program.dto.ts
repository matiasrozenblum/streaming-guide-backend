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
  @IsNotEmpty()
  startTime: string;

  @ApiProperty({ description: 'Hora de fin del programa' })
  @IsString()
  @IsNotEmpty()
  endTime: string;

  @IsOptional()
  @IsString()
  youtube_url?: string;
}