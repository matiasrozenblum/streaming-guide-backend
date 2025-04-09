import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateScheduleDto {
  @ApiProperty({ description: 'Día de la semana (lunes, martes, etc.)', required: false })
  @IsString()
  @IsOptional()
  dayOfWeek?: string;

  @ApiProperty({ description: 'Hora de inicio del programa, tipo HH:mm', required: false })
  @IsString()
  @IsOptional()
  startTime?: string;

  @ApiProperty({ description: 'Hora de finalización del programa, tipo HH:mm', required: false })
  @IsString()
  @IsOptional()
  endTime?: string;
} 