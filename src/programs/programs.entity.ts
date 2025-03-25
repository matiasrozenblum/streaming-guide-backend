import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany } from 'typeorm';
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
  channel: Channel;

  @OneToMany(() => Schedule, (schedule) => schedule.program)
  schedules: Schedule[];

  @OneToMany(() => Panelist, (panelist) => panelist.programs)
  panelists: Panelist[];
}