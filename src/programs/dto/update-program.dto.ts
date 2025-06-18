import { PartialType } from '@nestjs/swagger';
import { CreateProgramDto } from './create-program.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateProgramDto extends PartialType(CreateProgramDto) {
  @IsOptional()
  @IsString()
  style_override?: string;
} 