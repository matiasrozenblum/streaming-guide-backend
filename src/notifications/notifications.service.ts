import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationPreferenceEntity } from './notification-preference.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationPreferenceEntity)
    private repo: Repository<NotificationPreferenceEntity>,
  ) {}

  async list(deviceId: string) {
    return this.repo.find({ where: { deviceId } });
  }

  async subscribe(deviceId: string, programId: number) {
    const exists = await this.repo.findOne({ where: { deviceId, programId } });
    if (!exists) {
      return this.repo.save(this.repo.create({ deviceId, programId }));
    }
    return exists;
  }

  async unsubscribe(deviceId: string, programId: number) {
    await this.repo.delete({ deviceId, programId });
  }
}