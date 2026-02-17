import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, OneToMany } from "typeorm";
import { Exclude } from "class-transformer";
import { Device } from "./device.entity";
import { UserSubscription } from "./user-subscription.entity";
import { UserStreamerSubscription } from "./user-streamer-subscription.entity";

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
    name: 'gender'
  })
  gender: 'male' | 'female' | 'non_binary' | 'rather_not_say';

  @Column({ type: 'date', nullable: true, name: 'birth_date' })
  birthDate: Date;

  @Column({
    type: 'enum',
    enum: ['traditional', 'google', 'facebook'],
    default: 'traditional',
    name: 'origin'
  })
  origin: 'traditional' | 'google' | 'facebook';

  @OneToMany(() => Device, (device) => device.user, { cascade: true })
  devices: Device[];

  @OneToMany(() => UserSubscription, (subscription) => subscription.user, { cascade: true })
  subscriptions: UserSubscription[];

  @OneToMany(() => UserStreamerSubscription, (subscription) => subscription.user, { cascade: true })
  streamerSubscriptions: UserStreamerSubscription[];
}