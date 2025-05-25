import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { User } from './users.entity';
import { Program } from '../programs/programs.entity';

export enum NotificationMethod {
  PUSH = 'push',
  EMAIL = 'email',
  BOTH = 'both',
}

@Entity('user_subscriptions')
@Unique(['user', 'program'])
export class UserSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.subscriptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Program, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'program_id' })
  program: Program;

  @Column({
    type: 'enum',
    enum: NotificationMethod,
    default: NotificationMethod.BOTH,
    name: 'notification_method',
  })
  notificationMethod: NotificationMethod;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
} 