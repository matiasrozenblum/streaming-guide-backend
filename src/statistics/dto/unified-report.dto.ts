import { IsString, IsEnum, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class SingleReportDto {
  @IsEnum(['users', 'subscriptions', 'weekly-summary'])
  type: 'users' | 'subscriptions' | 'weekly-summary';

  @IsEnum(['csv', 'pdf'])
  format: 'csv' | 'pdf';

  @IsString()
  from: string;

  @IsString()
  to: string;

  @IsOptional()
  @IsNumber()
  channelId?: number;

  @IsOptional()
  @IsNumber()
  programId?: number;

  @IsEnum(['download', 'email', 'table'])
  action: 'download' | 'email' | 'table';

  @IsOptional()
  @IsString()
  toEmail?: string;

  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  pageSize?: number;
}

export class UnifiedReportDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => SingleReportDto)
  report?: SingleReportDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SingleReportDto)
  reports?: SingleReportDto[];
} 