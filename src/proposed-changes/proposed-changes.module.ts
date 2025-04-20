import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProposedChangesService } from './proposed-changes.service';
import { ProposedChangesController } from './proposed-changes.controller';
import { ProposedChange } from './proposed-changes.entity';
@Module({
  imports: [TypeOrmModule.forFeature([ProposedChange])],
  providers: [ProposedChangesService],
  controllers: [ProposedChangesController]
})
export class ProposedChangesModule {}
