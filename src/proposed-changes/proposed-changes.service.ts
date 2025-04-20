import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProposedChange } from './proposed-changes.entity';

interface CreateProposedChangeDto {
  entityType: 'program' | 'schedule'; // (más adelante podemos expandir si queremos para panelists u otros)
  action: 'create' | 'update' | 'delete';
  channelName: string;
  programName: string;
  before?: any;
  after: any;
}

@Injectable()
export class ProposedChangesService {
  constructor(
    @InjectRepository(ProposedChange)
    private readonly proposedChangeRepo: Repository<ProposedChange>,
  ) {}

  async createProposedChange(change: CreateProposedChangeDto): Promise<ProposedChange> {
    const proposed = this.proposedChangeRepo.create({
      channelName: change.channelName,
      programName: change.programName,
      action: change.action,
      before: change.before || null,
      after: change.after,
      status: 'pending',
    });
    return await this.proposedChangeRepo.save(proposed);
  }

  async getPendingChanges(): Promise<ProposedChange[]> {
    return this.proposedChangeRepo.find({
      where: { status: 'pending' },
      order: { createdAt: 'DESC' },
    });
  }

  async approveChange(id: number): Promise<ProposedChange> {
    const change = await this.proposedChangeRepo.findOneBy({ id });
    if (!change) throw new Error('Change not found');

    change.status = 'approved';
    return await this.proposedChangeRepo.save(change);
  }

  async rejectChange(id: number): Promise<ProposedChange> {
    const change = await this.proposedChangeRepo.findOneBy({ id });
    if (!change) throw new Error('Change not found');

    change.status = 'rejected';
    return await this.proposedChangeRepo.save(change);
  }
}
