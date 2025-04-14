import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgramsController } from './programs.controller';
import { ProgramsService } from './programs.service';
import { Program } from './programs.entity';
import { Panelist } from '../panelists/panelists.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Program, Panelist]),
  ],
  controllers: [ProgramsController],
  providers: [ProgramsService],
  exports: [ProgramsService],
})
export class ProgramsModule {}