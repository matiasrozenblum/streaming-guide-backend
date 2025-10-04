import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToMany, Index, JoinTable } from 'typeorm';
import { Program } from '../programs/programs.entity';
import { Category } from '../categories/categories.entity';

@Entity()
@Index(['is_visible', 'order']) // Composite index for filtering visible channels and ordering
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

  @Column({ type: 'boolean', default: true })
  is_visible: boolean;

  @Column({ type: 'text', nullable: true })
  background_color: string | null;

  @Column({ type: 'boolean', default: false })
  show_only_when_scheduled: boolean;

  @OneToMany(() => Program, (program) => program.channel, { cascade: true, onDelete: 'CASCADE' })
  programs: Program[];

  @ManyToMany(() => Category, (category) => category.channels)
  @JoinTable()
  categories?: Category[];
}