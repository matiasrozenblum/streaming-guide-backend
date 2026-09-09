import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../users/users.entity';
import { Program } from '../../programs/programs.entity';
import { Channel } from '../../channels/channels.entity';

export type AnalyticsPlatform = 'web' | 'ios' | 'android';

/**
 * Raw behavioural event, one row per user action.
 *
 * This is the only first-party record of what people do in the product: PostHog,
 * Datadog RUM, GA4 and Firebase all receive the same events, but none of them
 * keeps them long enough to answer "how did this program trend over the year?"
 * (Datadog RUM retains a month). Rows here are deliberately short-lived — the
 * retention job drops them after RAW_RETENTION_DAYS — and the permanent history
 * lives in the analytics_daily_* rollups derived from them.
 *
 * program_id / channel_id are denormalised out of `properties` so rankings can
 * be aggregated with plain indexed joins instead of jsonb lookups.
 */
@Entity('analytics_event')
@Index(['event_name', 'occurred_at'])
@Index(['program_id', 'occurred_at'])
@Index(['channel_id', 'occurred_at'])
@Index(['user_id', 'occurred_at'])
@Index(['device_id', 'occurred_at'])
export class AnalyticsEvent {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  event_name: string;

  /** Client-side timestamp of the action. Drives every aggregation. */
  @Index()
  @Column({ type: 'timestamptz' })
  occurred_at: Date;

  /**
   * Server-side arrival time. Kept alongside occurred_at because mobile events
   * can arrive hours late (queued while the app was backgrounded) — the gap
   * between the two is what justifies the rollup's multi-day recompute window.
   */
  @Column({ type: 'timestamptz', default: () => 'now()' })
  received_at: Date;

  @Column({ type: 'varchar', length: 16 })
  platform: AnalyticsPlatform;

  @Column({ type: 'varchar', length: 32, nullable: true })
  app_version: string | null;

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  /** Stable per-install id. The only attribution anonymous visitors have. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  device_id: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  session_id: string | null;

  @Column({ type: 'int', nullable: true })
  program_id: number | null;

  @ManyToOne(() => Program, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'program_id' })
  program: Program | null;

  @Column({ type: 'int', nullable: true })
  channel_id: number | null;

  @ManyToOne(() => Channel, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'channel_id' })
  channel: Channel | null;

  @Column({ type: 'varchar', length: 24, nullable: true })
  user_gender: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  user_age_group: string | null;

  // `any` rather than `unknown`: TypeORM's QueryDeepPartialEntity rejects an
  // index signature of unknown on a jsonb column, and the project already
  // accepts `any` for raw payloads of this kind (see eslint.config.mjs).
  @Column({ type: 'jsonb', default: () => `'{}'` })
  properties: Record<string, any>;
}
