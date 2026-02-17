import { IsEnum, IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { NotificationMethod } from '../../users/user-streamer-subscription.entity';

export class CreateStreamerSubscriptionDto {
    @ApiProperty({ enum: NotificationMethod, default: NotificationMethod.BOTH })
    @IsEnum(NotificationMethod)
    notificationMethod: NotificationMethod;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    endpoint?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    p256dh?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    auth?: string;
}
