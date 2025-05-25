import { IsString, IsNumber, Min } from 'class-validator';

export class ScheduleNotificationDto {
  @IsString()
  programId: string;

  @IsString()
  title: string;

  @IsNumber()
  @Min(0)
  minutesBefore: number;
}