import {
  IsString,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  IsOptional,
  ArrayMinSize,
  IsIn,
  IsInt,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateScheduleDto {
  @IsString()
  @IsNotEmpty()
  programId: string;

  @IsString()
  @IsNotEmpty()
  channelId: string;

  @IsOptional()
  @IsString()
  dayOfWeek?: string;

  @IsString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  endTime: string;

  @IsOptional()
  @IsIn(['weekly', 'monthly_weekday', 'monthly_dated'])
  scheduleType?: string;

  @IsOptional()
  @IsInt()
  @Min(-1)
  @Max(4)
  weekNumberInMonth?: number;

  @IsOptional()
  @IsDateString()
  specificDate?: string;
}

export class CreateScheduleItemDto {
  @IsOptional()
  @IsString()
  dayOfWeek?: string;

  @IsString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  endTime: string;

  @IsOptional()
  @IsIn(['weekly', 'monthly_weekday', 'monthly_dated'])
  scheduleType?: string;

  @IsOptional()
  @IsInt()
  @Min(-1)
  @Max(4)
  weekNumberInMonth?: number;

  @IsOptional()
  @IsDateString()
  specificDate?: string;
}

export class CreateBulkSchedulesDto {
  @IsString()
  @IsNotEmpty()
  programId: string;

  @IsString()
  @IsNotEmpty()
  channelId: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one schedule is required' })
  @ValidateNested({ each: true })
  @Type(() => CreateScheduleItemDto)
  schedules: CreateScheduleItemDto[];

  skipLinkPropagation?: boolean;
}
