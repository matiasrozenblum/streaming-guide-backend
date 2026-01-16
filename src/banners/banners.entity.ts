import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum LinkType {
  INTERNAL = 'internal',
  EXTERNAL = 'external',
  NONE = 'none',
}

export enum BannerType {
  NEWS = 'news',
  PROMOTIONAL = 'promotional',
  FEATURED = 'featured',
}

@Entity()
@Index(['is_enabled'])
@Index(['display_order'])
@Index(['start_date', 'end_date'])
@Index(['banner_type'])
export class Banner {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // Legacy single image URL kept for backward compatibility and as fallback
  @Column({ type: 'text' })
  image_url: string;

  // New: device-specific images
  @Column({ type: 'text', nullable: true })
  image_url_desktop: string | null;

  @Column({ type: 'text', nullable: true })
  image_url_mobile: string | null;

  @Column({
    type: 'enum',
    enum: LinkType,
    default: LinkType.NONE,
  })
  link_type: LinkType;

  @Column({ type: 'text', nullable: true })
  link_url: string | null;

  @Column({ type: 'boolean', default: true })
  is_enabled: boolean;

  @Column({ type: 'timestamp', nullable: true })
  start_date: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  end_date: Date | null;

  @Column({ type: 'int', default: 0 })
  display_order: number;

  @Column({ type: 'boolean', default: false })
  is_fixed: boolean;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({
    type: 'enum',
    enum: BannerType,
    default: BannerType.NEWS,
  })
  banner_type: BannerType;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
