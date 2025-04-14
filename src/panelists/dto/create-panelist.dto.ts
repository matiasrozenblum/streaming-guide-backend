import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePanelistDto {
  @ApiProperty({ description: 'Nombre del panelista' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Biografía del panelista' })
  @IsString()
  bio?: string;
}