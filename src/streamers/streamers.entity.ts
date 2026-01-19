import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, Index, JoinTable } from 'typeorm';
import { Category } from '../categories/categories.entity';

export interface StreamerService {
  service: 'twitch' | 'kick' | 'youtube';
  url: string;
  username?: string;
  userId?: number; // Optional: Store platform user ID (e.g., Kick user_id) to avoid API lookups
}

@Entity()
@Index(['is_visible', 'order']) // Composite index for filtering visible streamers and ordering
export class Streamer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  logo_url: string | null;

  @Column({ type: 'boolean', default: true })
  is_visible: boolean;

  @Column({ type: 'json', default: '[]' })
  services: StreamerService[];

  @Column({ type: 'int', nullable: true })
  order: number | null;

  @ManyToMany(() => Category)
  @JoinTable({
    name: 'streamer_categories_category',
    joinColumn: { name: 'streamerId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'categoryId', referencedColumnName: 'id' },
  })
  categories?: Category[];
}

