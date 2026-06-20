import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  ArrayMinSize,
  IsInt,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CreateScheduleItemDto } from '../../schedules/dto/create-schedule.dto';

export class CreateBulkProgramsDto {
  @ApiProperty({ description: 'IDs de los canales donde se creará el programa' })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  channel_ids: number[];

  @ApiProperty({ description: 'Nombre del programa' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Descripción del programa', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  logo_url?: string;

  @IsString()
  @IsOptional()
  youtube_url?: string;

  @IsOptional()
  @IsString()
  style_override?: string;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  is_visible?: boolean;

  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  is_premiere?: boolean;

  @ApiProperty({ required: false, description: 'Horarios a crear para cada programa (mismos para todos los canales)' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateScheduleItemDto)
  schedules?: CreateScheduleItemDto[];
}
