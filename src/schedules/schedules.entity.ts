import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Program } from '../programs/programs.entity';

@Entity('schedules')
@Index(['day_of_week', 'start_time']) // Composite index for day + time queries
@Index(['program_id']) // Index for program joins
@Index(['start_time']) // Index for time-based queries
export class Schedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'day_of_week' })
  day_of_week: string;

  @Column({ name: 'start_time' })
  start_time: string;

  @Column({ name: 'end_time' })
  end_time: string;

  @Column({ name: 'program_id' })
  program_id: string;

  @ManyToOne(() => Program, { eager: true })
  @JoinColumn({ name: 'program_id' })
  program: Program;
}