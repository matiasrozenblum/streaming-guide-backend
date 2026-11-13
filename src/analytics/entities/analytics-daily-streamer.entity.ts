import { Entity, Column, Index, PrimaryColumn } from 'typeorm';

/** Permanent per-streamer daily rollup. Same contract as AnalyticsDailyChannel. */
@Entity('analytics_daily_streamer')
@Index(['event_name', 'date'])
@Index(['date', 'event_name', 'count'])
export class AnalyticsDailyStreamer {
  @PrimaryColumn({ type: 'date' })
  date: string;

  @PrimaryColumn({ type: 'int' })
  streamer_id: number;

  @PrimaryColumn({ type: 'varchar', length: 64 })
  event_name: string;

  @Column({ type: 'int', default: 0 })
  count: number;

  @Column({ type: 'int', default: 0 })
  unique_users: number;

  @Column({ type: 'int', default: 0 })
  unique_devices: number;
}
