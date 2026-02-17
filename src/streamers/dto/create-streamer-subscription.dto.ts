import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStreamerSubscriptionDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    endpoint?: string;

    @IsString()
    p256dh?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    auth?: string;
}
