import {
  Entity,
  Column,
  Index,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/users.entity';

/**
 * Per-user daily rollup for streamers — the streamer half of the recap.
 *
 * A separate table rather than a column on `analytics_daily_user`: there
 * `program_id` is part of the primary key, and a streamer has no program, so a
 * shared row would need a null in a key column. This mirrors the split that
 * already exists between the program, channel and streamer rollups.
 */
@Entity('analytics_daily_user_streamer')
@Index(['user_id', 'date'])
export class AnalyticsDailyUserStreamer {
  @PrimaryColumn({ type: 'date' })
  date: string;

  @PrimaryColumn({ type: 'int' })
  user_id: number;

  /** CASCADE for the same reason as the program rollup: user_id is in the key. */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @PrimaryColumn({ type: 'int' })
  streamer_id: number;

  @PrimaryColumn({ type: 'varchar', length: 64 })
  event_name: string;

  @Column({ type: 'int', default: 0 })
  count: number;
}
