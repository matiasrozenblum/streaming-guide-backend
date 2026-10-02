import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { IsAdult } from '../../utils/is-adult.validator';

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
  @Matches(/^\+\d+$/, {
    message: 'Phone must be in international format, e.g. +54911…',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsEnum(['user', 'admin'], { message: 'Role must be either user or admin' })
  role?: 'user' | 'admin';

  @IsOptional()
  @IsEnum(['male', 'female', 'non_binary', 'rather_not_say'])
  gender?: 'male' | 'female' | 'non_binary' | 'rather_not_say';

  @IsOptional()
  @IsDateString()
  @IsAdult()
  birthDate?: string;
}
