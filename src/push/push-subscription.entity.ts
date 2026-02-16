import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Unique,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Device } from '../users/device.entity';

@Entity('push_subscriptions')
@Unique(['device', 'endpoint'])
export class PushSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Device, (device) => device.pushSubscriptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'device_id' })
  device: Device;

  @Column('text')
  endpoint: string;

  @Column({ type: 'text', nullable: true })
  p256dh: string | null;

  @Column({ type: 'text', nullable: true })
  auth: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}