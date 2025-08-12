import { IsString, IsEnum, IsNumber, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChannelReportDto {
  @ApiProperty({ description: 'Start date (YYYY-MM-DD)', example: '2025-01-01' })
  @IsString()
  from: string;

  @ApiProperty({ description: 'End date (YYYY-MM-DD)', example: '2025-01-31' })
  @IsString()
  to: string;

  @ApiProperty({ description: 'Report format', enum: ['csv', 'pdf'], example: 'pdf' })
  @IsEnum(['csv', 'pdf'])
  format: 'csv' | 'pdf';
}

export class ChannelReportEmailDto extends ChannelReportDto {
  @ApiProperty({ description: 'Recipient email address', example: 'user@example.com' })
  @IsEmail()
  toEmail: string;
}

export class PeriodicReportDto {
  @ApiProperty({ description: 'Start date (YYYY-MM-DD)', example: '2025-01-01' })
  @IsString()
  from: string;

  @ApiProperty({ description: 'End date (YYYY-MM-DD)', example: '2025-01-31' })
  @IsString()
  to: string;

  @ApiProperty({ description: 'Channel ID (optional)', required: false, example: 1 })
  @IsNumber()
  @IsOptional()
  channelId?: number;
}

export class PeriodicReportEmailDto extends PeriodicReportDto {
  @ApiProperty({ description: 'Recipient email address', example: 'user@example.com' })
  @IsEmail()
  toEmail: string;
}
