import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PanelistsController } from './panelists.controller';
import { PanelistsService } from './panelists.service';
import { Panelist } from './panelists.entity';
import { Program } from '../programs/programs.entity';
import { RedisModule } from '../redis/redis.module';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Panelist, Program]),
    RedisModule,
    forwardRef(() => SchedulesModule), // For cache warming after panelist updates
  ],
  controllers: [PanelistsController],
  providers: [PanelistsService],
  exports: [PanelistsService],
})
export class PanelistsModule {}
