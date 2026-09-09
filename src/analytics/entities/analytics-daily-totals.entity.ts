import { Entity, Column, Index, PrimaryColumn } from 'typeorm';

/**
 * Permanent product-wide daily rollup, split by platform. Feeds the overview
 * tiles and the trend curves — the questions that don't involve a specific
 * program or channel.
 */
@Entity('analytics_daily_totals')
@Index(['event_name', 'date'])
export class AnalyticsDailyTotals {
  @PrimaryColumn({ type: 'date' })
  date: string;

  @PrimaryColumn({ type: 'varchar', length: 16 })
  platform: string;

  @PrimaryColumn({ type: 'varchar', length: 64 })
  event_name: string;

  @Column({ type: 'int', default: 0 })
  count: number;

  @Column({ type: 'int', default: 0 })
  unique_users: number;

  @Column({ type: 'int', default: 0 })
  unique_devices: number;

  @Column({ type: 'int', default: 0 })
  sessions: number;
}
