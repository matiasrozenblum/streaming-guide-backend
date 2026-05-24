import {
  IsString,
  IsOptional,
  IsIn,
  IsInt,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateScheduleDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  dayOfWeek?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  startTime?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  endTime?: string;

  @ApiProperty({
    required: false,
    enum: ['weekly', 'monthly_weekday', 'monthly_dated'],
  })
  @IsOptional()
  @IsIn(['weekly', 'monthly_weekday', 'monthly_dated'])
  scheduleType?: string;

  @ApiProperty({
    required: false,
    description: '1=first, 2=second, 3=third, 4=fourth, -1=last',
  })
  @IsOptional()
  @IsInt()
  @Min(-1)
  @Max(4)
  weekNumberInMonth?: number;

  @ApiProperty({
    required: false,
    description: 'YYYY-MM-DD, only for monthly_dated type',
  })
  @IsOptional()
  @IsDateString()
  specificDate?: string;
}
