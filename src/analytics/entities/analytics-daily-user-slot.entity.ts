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
 * Per-user daily rollup with a time-of-day dimension — the source for the
 * channel-by-hour grid in the recap.
 *
 * The hour is stored raw (0-23, Argentina time) rather than pre-bucketed into
 * the three-hour blocks the design draws. Grouping happens at query time, so
 * changing the visual bands — or adding the 00-06 stretch the first design left
 * out — is a different GROUP BY and not a migration.
 *
 * program_id is in the key alongside channel_id so the same rows answer both
 * "which channels at which hours" and "which programs in that slot". Rolling
 * the finer grain up to the coarser one is a SUM; the reverse is impossible.
 *
 * Both ids are part of the key and therefore non-null, which means an event
 * without an identified program does not land here. That is the same rule
 * analytics_daily_user already applies, so the two tables agree.
 */
@Entity('analytics_daily_user_slot')
@Index(['user_id', 'date'])
export class AnalyticsDailyUserSlot {
  @PrimaryColumn({ type: 'date' })
  date: string;

  @PrimaryColumn({ type: 'int' })
  user_id: number;

  /** CASCADE for the same reason as the other per-user rollups. */
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @PrimaryColumn({ type: 'int' })
  channel_id: number;

  @PrimaryColumn({ type: 'int' })
  program_id: number;

  /** Hour of day, 0-23, in America/Argentina/Buenos_Aires. */
  @PrimaryColumn({ type: 'smallint' })
  hour: number;

  @PrimaryColumn({ type: 'varchar', length: 64 })
  event_name: string;

  @Column({ type: 'int', default: 0 })
  count: number;
}
