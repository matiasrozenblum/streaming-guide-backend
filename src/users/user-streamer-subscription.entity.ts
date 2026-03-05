import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
    Unique,
    Index,
} from 'typeorm';
import { User } from './users.entity';
import { Streamer } from '../streamers/streamers.entity';

@Entity('user_streamer_subscriptions')
@Unique(['user', 'streamer'])
@Index(['streamer', 'isActive']) // For fast lookup of active subscribers when streamer goes live
export class UserStreamerSubscription {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @ManyToOne(() => User, (user) => user.streamerSubscriptions, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @ManyToOne(() => Streamer, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'streamer_id' })
    streamer: Streamer;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
