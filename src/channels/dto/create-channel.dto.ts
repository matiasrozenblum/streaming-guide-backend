import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateChannelDto {
  @ApiProperty({ description: 'Nombre del canal' })  // Descripción para Swagger
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Descripción del canal' })
  @IsString()
  @IsNotEmpty()
  description: string;
}