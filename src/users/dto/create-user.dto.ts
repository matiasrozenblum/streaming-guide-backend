import { IsString, IsEmail, MinLength, Matches, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+\d+$/, { message: 'Phone must be in international format, e.g. +54911…' })
  phone?: string;

  @IsString()
  @MinLength(6)
  password: string;
}