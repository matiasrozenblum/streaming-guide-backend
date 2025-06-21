import { IsString, IsNotEmpty, IsEnum, IsArray, ValidateNested, IsOptional, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { Program } from '../../programs/programs.entity';

export class CreateScheduleDto {
  @IsString()
  @IsNotEmpty()
  programId: string; // ID del programa asociado al horario

  @IsString()
  @IsNotEmpty()
  channelId: string; // ID del canal asociado al horario

  @IsString()
  @IsNotEmpty()
  dayOfWeek: string; // Día de la semana (lunes, martes, etc.)

  @IsString()
  @IsNotEmpty()
  startTime: string; // Hora de inicio del programa, tipo 'HH:mm'

  @IsString()
  @IsNotEmpty()
  endTime: string; // Hora de finalización del programa, tipo 'HH:mm'
}

export class CreateScheduleItemDto {
  @IsString()
  @IsNotEmpty()
  dayOfWeek: string; // Día de la semana (lunes, martes, etc.)

  @IsString()
  @IsNotEmpty()
  startTime: string; // Hora de inicio del programa, tipo 'HH:mm'

  @IsString()
  @IsNotEmpty()
  endTime: string; // Hora de finalización del programa, tipo 'HH:mm'
}

export class CreateBulkSchedulesDto {
  @IsString()
  @IsNotEmpty()
  programId: string; // ID del programa asociado a todos los horarios

  @IsString()
  @IsNotEmpty()
  channelId: string; // ID del canal asociado a todos los horarios

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one schedule is required' })
  @ValidateNested({ each: true })
  @Type(() => CreateScheduleItemDto)
  schedules: CreateScheduleItemDto[]; // Array de horarios a crear
}