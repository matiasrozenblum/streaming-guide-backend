import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { Channel } from '../channels/channels.entity';

@Entity()
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  color: string; // Hex color for the category tab

  @Column({ type: 'int', default: 0 })
  order: number;

  @Column({ type: 'boolean', default: true })
  is_visible: boolean;

  @ManyToMany(() => Channel, (channel) => channel.categories)
  channels: Channel[];
}
