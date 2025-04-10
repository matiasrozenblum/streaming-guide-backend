import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PanelistsController } from './panelists.controller';
import { PanelistsService } from './panelists.service';
import { Panelist } from './panelists.entity';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    TypeOrmModule.forFeature([Panelist]),
    CacheModule.register(),
  ],
  controllers: [PanelistsController],
  providers: [PanelistsService],
  exports: [PanelistsService],
})
export class PanelistsModule {}