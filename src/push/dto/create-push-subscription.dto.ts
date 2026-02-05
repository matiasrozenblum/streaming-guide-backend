import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PushSubscriptionDto {
  @IsNotEmpty()
  @IsString()
  endpoint: string;

  keys?: { p256dh: string; auth: string };
}

export class CreatePushSubscriptionDto {
  @IsNotEmpty()
  @IsString()
  deviceId: string;

  @ValidateNested()
  @Type(() => PushSubscriptionDto)
  subscription: PushSubscriptionDto;
}