import { IsString, IsEmail, MinLength, Matches, IsOptional } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+\d+$/, { message: 'Phone must be in international format, e.g. +54911…' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}