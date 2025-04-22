import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PanelistsController } from './panelists.controller';
import { PanelistsService } from './panelists.service';
import { Panelist } from './panelists.entity';
import { Program } from '../programs/programs.entity';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Panelist, Program]),
    RedisModule,
  ],
  controllers: [PanelistsController],
  providers: [PanelistsService],
  exports: [PanelistsService],
})
export class PanelistsModule {}
