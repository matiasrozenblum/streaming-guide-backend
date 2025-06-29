import { IsString, IsEnum, IsOptional, IsNumber } from 'class-validator';

export class UnifiedReportDto {
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