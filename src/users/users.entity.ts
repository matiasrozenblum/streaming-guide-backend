import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  OneToMany,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Device } from './device.entity';
import { UserSubscription } from './user-subscription.entity';
import { UserStreamerSubscription } from './user-streamer-subscription.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true, nullable: true })
  phone: string;

  @Exclude()
  @Column()
  password: string;

  @Column({ type: 'enum', enum: ['user', 'admin'], default: 'user' })
  role: 'user' | 'admin';

  @Column({
    type: 'enum',
    enum: ['male', 'female', 'non_binary', 'rather_not_say'],
    nullable: true,
    name: 'gender',
  })
  gender: 'male' | 'female' | 'non_binary' | 'rather_not_say';

  @Column({ type: 'date', nullable: true, name: 'birth_date' })
  birthDate: Date;

  @Column({
    type: 'enum',
    enum: ['traditional', 'google', 'facebook', 'apple'],
    default: 'traditional',
    name: 'origin',
  })
  origin: 'traditional' | 'google' | 'facebook' | 'apple';

  @Column({ type: 'text', array: true, name: 'seen_features', default: '{}' })
  seenFeatures: string[];

  /**
   * Whether we may tell this person, on their phone, that a recap is ready.
   *
   * Two switches and not one: the monthly recap is a rarer, bigger thing, and
   * somebody who finds a weekly nudge too much may still want that one. They
   * default to on — the recap is the point of having signed in — and they sit
   * on the user and not on the device because a recap belongs to a person, not
   * to the phone they happen to be holding.
   */
  @Column({ name: 'recap_weekly_push', type: 'boolean', default: true })
  recapWeeklyPush: boolean;

  @Column({ name: 'recap_monthly_push', type: 'boolean', default: true })
  recapMonthlyPush: boolean;

  @OneToMany(() => Device, (device) => device.user, { cascade: true })
  devices: Device[];

  @OneToMany(() => UserSubscription, (subscription) => subscription.user, {
    cascade: true,
  })
  subscriptions: UserSubscription[];

  @OneToMany(
    () => UserStreamerSubscription,
    (subscription) => subscription.user,
    { cascade: true },
  )
  streamerSubscriptions: UserStreamerSubscription[];
}
