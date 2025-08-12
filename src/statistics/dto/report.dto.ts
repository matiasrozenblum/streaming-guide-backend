import { IsString, IsEnum, IsOptional, IsNumber, IsArray, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export enum ReportType {
  USERS = 'users',
  SUBSCRIPTIONS = 'subscriptions',
  WEEKLY_SUMMARY = 'weekly-summary',
  MONTHLY_SUMMARY = 'monthly-summary',
  QUARTERLY_SUMMARY = 'quarterly-summary',
  YEARLY_SUMMARY = 'yearly-summary',
  CHANNEL_SUMMARY = 'channel-summary',
  COMPREHENSIVE_CHANNEL_SUMMARY = 'comprehensive-channel-summary',
}

export enum ReportFormat {
  CSV = 'csv',
  PDF = 'pdf',
}

export enum ReportAction {
  DOWNLOAD = 'download',
  EMAIL = 'email',
  TABLE = 'table',
}

export enum ReportPeriod {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
  CUSTOM = 'custom',
}

export class BaseReportDto {
  @IsEnum(ReportType)
  type: ReportType;

  @IsEnum(ReportFormat)
  format: ReportFormat;

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

  @IsEnum(ReportAction)
  action: ReportAction;

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

export class ChannelReportDto extends BaseReportDto {
  @IsNumber()
  declare channelId: number;
}

export class PeriodicReportDto {
  @IsEnum(ReportType)
  type: ReportType;

  @IsEnum(ReportFormat)
  format: ReportFormat;

  @IsEnum(ReportPeriod)
  period: ReportPeriod;

  @IsEnum(ReportAction)
  action: ReportAction;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsNumber()
  channelId?: number;

  @IsOptional()
  @IsString()
  toEmail?: string;
}

export class BatchReportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BaseReportDto)
  reports: BaseReportDto[];
}

export class AutomaticReportDto {
  @IsEnum(ReportType)
  type: ReportType;

  @IsEnum(ReportPeriod)
  period: ReportPeriod;

  @IsOptional()
  @IsNumber()
  channelId?: number;

  @IsString()
  toEmail: string = 'laguiadelstreaming@gmail.com';
} 