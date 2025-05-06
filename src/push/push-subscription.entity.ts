import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('push_subscriptions')
export class PushSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column() deviceId: string;
  @Column('text') endpoint: string;
  @Column('text') p256dh: string;
  @Column('text') auth: string;

  @CreateDateColumn() createdAt: Date;
}