import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, Index, JoinTable } from 'typeorm';
import { Category } from '../categories/categories.entity';

export interface StreamerService {
  service: 'twitch' | 'kick' | 'youtube';
  url: string;
  username?: string;
}

@Entity()
@Index(['is_visible']) // Index for filtering visible streamers
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

  @ManyToMany(() => Category)
  @JoinTable({
    name: 'streamer_categories_category',
    joinColumn: { name: 'streamerId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'categoryId', referencedColumnName: 'id' },
  })
  categories?: Category[];
}

