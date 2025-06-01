import { IsString, IsEmail, MinLength, Matches, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  firstName: string;

  @ApiProperty()
  @IsString()
  lastName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  @Matches(/^\+\d+$/, { message: 'Phone must be in international format, e.g. +54911…' })
  phone?: string;

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
}