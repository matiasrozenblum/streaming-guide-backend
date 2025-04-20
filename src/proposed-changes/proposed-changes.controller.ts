import { Controller, Get, Post, Param, Body, ParseIntPipe } from '@nestjs/common';
import { ProposedChangesService } from './proposed-changes.service';
import { ProposedChange } from './proposed-changes.entity';

@Controller('proposed-changes')
export class ProposedChangesController {
  constructor(private readonly proposedChangesService: ProposedChangesService) {}

  @Get()
  async listPendingChanges(): Promise<ProposedChange[]> {
    return this.proposedChangesService.getPendingChanges();
  }

  @Post()
  async createProposedChange(@Body() data: {
    entityType: 'program' | 'schedule';
    action: 'create' | 'update' | 'delete';
    channelName: string;
    programName: string;
    before?: any;
    after: any;
  }) {
    return this.proposedChangesService.createProposedChange(data);
  }

  @Post(':id/approve')
  async approveChange(@Param('id', ParseIntPipe) id: number) {
    return this.proposedChangesService.approveChange(id);
  }

  @Post(':id/reject')
  async rejectChange(@Param('id', ParseIntPipe) id: number) {
    return this.proposedChangesService.rejectChange(id);
  }
}
