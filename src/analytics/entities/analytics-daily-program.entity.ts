import { Entity, Column, Index, PrimaryColumn } from 'typeorm';

/**
 * Permanent per-program daily rollup. Survives the raw-event retention window,
 * so this is what the backoffice charts and the Instagram ranking actually read.
 */
@Entity('analytics_daily_program')
@Index(['event_name', 'date'])
@Index(['date', 'event_name', 'count'])
export class AnalyticsDailyProgram {
  @PrimaryColumn({ type: 'date' })
  date: string;

  @PrimaryColumn({ type: 'int' })
  program_id: number;

  @PrimaryColumn({ type: 'varchar', length: 64 })
  event_name: string;

  /**
   * Denormalised from the program's channel at rollup time. Not part of the key:
   * a program that moves to another channel keeps its historical rows attributed
   * to the channel it aired on, which is what a year-over-year chart should show.
   */
  @Column({ type: 'int', nullable: true })
  channel_id: number | null;

  @Column({ type: 'int', default: 0 })
  count: number;

  @Column({ type: 'int', default: 0 })
  unique_users: number;

  @Column({ type: 'int', default: 0 })
  unique_devices: number;
}
