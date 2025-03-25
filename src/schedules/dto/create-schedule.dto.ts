import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
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