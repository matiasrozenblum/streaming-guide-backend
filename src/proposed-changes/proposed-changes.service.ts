import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProposedChange } from './proposed-changes.entity';
import { Schedule } from '@/schedules/schedules.entity';
import { Program } from '@/programs/programs.entity';

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
    @InjectRepository(Program)
    private readonly programRepo: Repository<Program>,
    @InjectRepository(Schedule)
    private readonly scheduleRepo: Repository<Schedule>,
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
    const change = await this.proposedChangeRepo.findOne({ where: { id } });
  
    if (!change) {
      throw new Error('Proposed change not found');
    }
  
    if (change.status !== 'pending') {
      throw new Error('Only pending changes can be approved');
    }
  
    if (change.entityType === 'program') {
      let program = await this.programRepo.findOne({ where: { name: change.programName } });
  
      if (!program) {
        // No existe -> Crear
        program = this.programRepo.create({
          name: change.after.name,
          logo_url: change.after.logo_url,
        });
        await this.programRepo.save(program);
      } else {
        // Existe -> Actualizar
        await this.programRepo.update(
          { id: program.id },
          {
            name: change.after.name,
            logo_url: change.after.logo_url,
          }
        );
      }
    } else if (change.entityType === 'schedule') {
      const program = await this.programRepo.findOne({ where: { name: change.programName } });
  
      if (!program) {
        throw new Error(`Program "${change.programName}" not found when approving schedule`);
      }
  
      const schedule = await this.scheduleRepo.findOne({
        where: {
          program: { id: program.id },
          day_of_week: change.before.day_of_week,
          start_time: change.before.start_time,
          end_time: change.before.end_time,
        },
        relations: ['program'],
      });
  
      if (!schedule) {
        // No existe schedule -> Crear nuevo
        const newSchedule = this.scheduleRepo.create({
          program,
          day_of_week: change.after.day_of_week,
          start_time: change.after.start_time,
          end_time: change.after.end_time,
        });
        await this.scheduleRepo.save(newSchedule);
      } else {
        // Existe -> Actualizar
        schedule.day_of_week = change.after.day_of_week;
        schedule.start_time = change.after.start_time;
        schedule.end_time = change.after.end_time;
        await this.scheduleRepo.save(schedule);
      }
    }
  
    // Actualizar estado a aprobado
    change.status = 'approved';
    await this.proposedChangeRepo.save(change);
  
    return { success: true };
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

  async clearPendingChangesForChannel(channelName: string) {
    await this.proposedChangeRepo.delete({ channelName, status: 'pending' });
  }
}
