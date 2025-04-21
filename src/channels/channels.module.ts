import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { Channel } from './channels.entity';
import { Program } from '../programs/programs.entity';
import { Schedule } from '../schedules/schedules.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Channel, Program, Schedule])],
  controllers: [ChannelsController],
  providers: [ChannelsService],
})
export class ChannelsModule {}