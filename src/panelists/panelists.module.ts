import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PanelistsController } from './panelists.controller';
import { PanelistsService } from './panelists.service';
import { Panelist } from './panelists.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Panelist])],
  controllers: [PanelistsController],
  providers: [PanelistsService],
})
export class PanelistsModule {}