import { Entity, Column, Index, PrimaryColumn } from 'typeorm';

/**
 * Permanent per-user daily rollup — the source for the Wrapped-style recap.
 *
 * Only signed-in activity lands here; anonymous events have no user to recap.
 * program_id is part of the key so a user's top-programs list is a plain
 * GROUP BY over a date range instead of a scan of raw events.
 */
@Entity('analytics_daily_user')
@Index(['user_id', 'date'])
export class AnalyticsDailyUser {
  @PrimaryColumn({ type: 'date' })
  date: string;

  @PrimaryColumn({ type: 'int' })
  user_id: number;

  @PrimaryColumn({ type: 'int' })
  program_id: number;

  @PrimaryColumn({ type: 'varchar', length: 64 })
  event_name: string;

  @Column({ type: 'int', nullable: true })
  channel_id: number | null;

  @Column({ type: 'int', default: 0 })
  count: number;
}
