import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from './users.entity';
import { PushSubscriptionEntity } from '../push/push-subscription.entity';

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'device_id', unique: true })
  deviceId: string;

  @Column({ name: 'device_name', nullable: true })
  deviceName: string;

  @Column({ name: 'device_type', nullable: true })
  deviceType: string; // 'web', 'mobile', 'tablet', etc.

  @Column({ name: 'user_agent', nullable: true, type: 'text' })
  userAgent: string;

  @Column({ name: 'last_seen', nullable: true })
  lastSeen: Date;

  @Column({ name: 'platform', nullable: true })
  platform: string; // 'ios', 'android', 'web'

  @Column({ name: 'fcm_token', nullable: true, type: 'text' })
  fcmToken: string;

  @Column({ name: 'app_version', nullable: true, type: 'text' })
  appVersion: string;

  @ManyToOne(() => User, (user) => user.devices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => PushSubscriptionEntity, (subscription) => subscription.device)
  pushSubscriptions: PushSubscriptionEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
} 