import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProgramsController } from './programs.controller';
import { ProgramsService } from './programs.service';
import { Program } from './programs.entity';
import { Panelist } from '../panelists/panelists.entity';
import { Channel } from '../channels/channels.entity';
import { RedisModule } from '../redis/redis.module';
import { UsersModule } from '../users/users.module';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Program, Panelist, Channel]),
    RedisModule,
    UsersModule,
    forwardRef(() => SchedulesModule),
  ],
  controllers: [ProgramsController],
  providers: [ProgramsService],
  exports: [ProgramsService],
})
export class ProgramsModule {}