import { Entity, Column, Index, PrimaryColumn } from 'typeorm';

/** Permanent per-channel daily rollup. Same contract as AnalyticsDailyProgram. */
@Entity('analytics_daily_channel')
@Index(['event_name', 'date'])
@Index(['date', 'event_name', 'count'])
export class AnalyticsDailyChannel {
  @PrimaryColumn({ type: 'date' })
  date: string;

  @PrimaryColumn({ type: 'int' })
  channel_id: number;

  @PrimaryColumn({ type: 'varchar', length: 64 })
  event_name: string;

  @Column({ type: 'int', default: 0 })
  count: number;

  @Column({ type: 'int', default: 0 })
  unique_users: number;

  @Column({ type: 'int', default: 0 })
  unique_devices: number;
}
