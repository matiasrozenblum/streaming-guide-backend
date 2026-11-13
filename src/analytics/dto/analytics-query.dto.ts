import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum Granularity {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export enum RecapPeriod {
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class DateRangeDto {
  @Matches(ISO_DATE, { message: 'from must be YYYY-MM-DD' })
  from: string;

  @Matches(ISO_DATE, { message: 'to must be YYYY-MM-DD' })
  to: string;

  @IsOptional()
  @IsString()
  platform?: string;
}

export class TrendQueryDto extends DateRangeDto {
  @IsOptional()
  @IsString()
  metric?: string;

  @IsOptional()
  @IsEnum(Granularity)
  granularity?: Granularity;
}

export class RankingQueryDto extends DateRangeDto {
  @IsOptional()
  @IsString()
  metric?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ProgramTrendQueryDto extends DateRangeDto {
  @IsOptional()
  @IsEnum(Granularity)
  granularity?: Granularity;

  @IsOptional()
  @IsString()
  metric?: string;
}

export class RecapQueryDto {
  @IsOptional()
  @IsEnum(RecapPeriod)
  period?: RecapPeriod;

  /** Any date inside the wanted period. Defaults to today. */
  @IsOptional()
  @Matches(ISO_DATE, { message: 'date must be YYYY-MM-DD' })
  date?: string;
}

export class RollupRangeDto {
  @Matches(ISO_DATE, { message: 'from must be YYYY-MM-DD' })
  from: string;

  @Matches(ISO_DATE, { message: 'to must be YYYY-MM-DD' })
  to: string;
}
