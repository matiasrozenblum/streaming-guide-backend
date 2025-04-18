import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgramsController } from './programs.controller';
import { ProgramsService } from './programs.service';
import { Program } from './programs.entity';
import { Panelist } from '../panelists/panelists.entity';
import { Channel } from '../channels/channels.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Program, Panelist, Channel]),
  ],
  controllers: [ProgramsController],
  providers: [ProgramsService],
  exports: [ProgramsService],
})
export class ProgramsModule {}