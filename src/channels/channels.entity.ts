import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToMany,
  Index,
  JoinTable,
} from 'typeorm';
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

  /**
   * videoId of the channel's permanent 24/7 broadcast, when it has one.
   *
   * Signals like TN keep a single stream open for years, and YouTube's search index
   * drops those videos even while they are live — so the only reliable way to resolve
   * them is to ask videos?id=<this> directly. Discovered and refreshed automatically
   * by YoutubeLiveService; null for channels that broadcast per-program.
   */
  @Column({ type: 'text', nullable: true })
  youtube_live_video_id: string | null;

  @Column({ type: 'int', nullable: true })
  order: number;

  @Column({ type: 'boolean', default: true })
  is_visible: boolean;

  @Column({ type: 'text', nullable: true })
  background_color: string | null;

  @Column({ type: 'boolean', default: false })
  show_only_when_scheduled: boolean;

  @OneToMany(() => Program, (program) => program.channel, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  programs: Program[];

  @ManyToMany(() => Category, (category) => category.channels)
  @JoinTable()
  categories?: Category[];
}
