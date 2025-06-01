import { IsString, IsEmail, MinLength, IsEnum, IsDateString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty()
  @IsString()
  registration_token: string;

  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ enum: ['male', 'female', 'non_binary', 'rather_not_say'] })
  @IsEnum(['male', 'female', 'non_binary', 'rather_not_say'])
  gender: 'male' | 'female' | 'non_binary' | 'rather_not_say';

  @ApiProperty({ example: '1990-01-01', required: false })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  deviceId?: string;
}