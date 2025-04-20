import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProposedChangesService } from './proposed-changes.service';
import { ProposedChangesController } from './proposed-changes.controller';
import { ProposedChange } from './proposed-changes.entity';
import { Schedule } from '@/schedules/schedules.entity';
import { Program } from '@/programs/programs.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProposedChange, Program, Schedule])],
  providers: [ProposedChangesService],
  controllers: [ProposedChangesController],
  exports: [ProposedChangesService],
})
export class ProposedChangesModule {}
