import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProposedChange } from './proposed-changes.entity';

interface CreateProposedChangeInput {
  entityType: 'program' | 'schedule';
  action: 'create' | 'update' | 'delete';
  channelName: string;
  programName: string;
  before: any | null;
  after: any;
}

@Injectable()
export class ProposedChangesService {
  constructor(
    @InjectRepository(ProposedChange)
    private readonly proposedChangeRepo: Repository<ProposedChange>,
  ) {}

  async createProposedChange(data: CreateProposedChangeInput | CreateProposedChangeInput[]) {
    const dataArray = Array.isArray(data) ? data : [data];

    const proposedChanges = dataArray.map((item) =>
      this.proposedChangeRepo.create({
        entityType: item.entityType,
        action: item.action,
        channelName: item.channelName,
        programName: item.programName,
        before: item.before,
        after: item.after,
        status: 'pending',
      }),
    );

    return await this.proposedChangeRepo.save(proposedChanges);
  }

  async listPendingChanges() {
    return this.proposedChangeRepo.find({
      where: { status: 'pending' },
      order: { createdAt: 'DESC' },
    });
  }

  async approveChange(id: number) {
    const change = await this.proposedChangeRepo.findOneBy({ id });
    if (!change) throw new Error('ProposedChange not found');

    change.status = 'approved';
    return this.proposedChangeRepo.save(change);
  }

  async rejectChange(id: number) {
    const change = await this.proposedChangeRepo.findOneBy({ id });
    if (!change) throw new Error('ProposedChange not found');

    change.status = 'rejected';
    return this.proposedChangeRepo.save(change);
  }

  async getPendingChanges() {
    return this.proposedChangeRepo.find({
      where: { status: 'pending' },
    });
  }
}
