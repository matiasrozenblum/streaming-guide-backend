import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, ManyToMany, JoinTable, JoinColumn } from 'typeorm';
import { Channel } from '../channels/channels.entity';
import { Schedule } from '../schedules/schedules.entity';
import { Panelist } from '../panelists/panelists.entity';

@Entity()
export class Program {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @ManyToOne(() => Channel, (channel) => channel.programs)
  @JoinColumn({ name: 'channel_id' })
  channel: Channel;

  @OneToMany(() => Schedule, (schedule) => schedule.program, { cascade: true, onDelete: 'CASCADE' })
  schedules: Schedule[];

  @ManyToMany(() => Panelist, (panelist) => panelist.programs)
  @JoinTable()
  panelists: Panelist[];

  @Column({ type: 'text', nullable: true })
  logo_url: string | null;

  @Column({ type: 'text', nullable: true })
  youtube_url: string | null;

  @Column({ nullable: true })
  is_live: boolean;

  @Column({ type: 'text', nullable: true })
  stream_url: string | null;
}