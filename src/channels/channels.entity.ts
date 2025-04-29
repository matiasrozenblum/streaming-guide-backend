import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Program } from '../programs/programs.entity';

@Entity()
export class Channel {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  handle: string;

  @Column({ type: 'text', nullable: true })
  logo_url: string | null;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  youtube_channel_id: string;

  @Column({ type: 'int', nullable: true })
  order: number;

  @OneToMany(() => Program, (program) => program.channel, { cascade: true, onDelete: 'CASCADE' })
  programs: Program[];
}