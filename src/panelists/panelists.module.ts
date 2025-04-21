import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PanelistsController } from './panelists.controller';
import { PanelistsService } from './panelists.service';
import { Panelist } from './panelists.entity';
import { Program } from '../programs/programs.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Panelist, Program]),
  ],
  controllers: [PanelistsController],
  providers: [PanelistsService],
  exports: [PanelistsService],
})
export class PanelistsModule {}
