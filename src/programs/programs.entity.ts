import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, ManyToMany, JoinTable } from 'typeorm';
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

  @Column({ type: 'time', nullable: true })
  start_time: string;

  @Column({ type: 'time', nullable: true })
  end_time: string;

  @ManyToOne(() => Channel, (channel) => channel.programs)
  channel: Channel;

  @OneToMany(() => Schedule, (schedule) => schedule.program)
  schedules: Schedule[];

  @ManyToMany(() => Panelist, (panelist) => panelist.programs)
  @JoinTable()
  panelists: Panelist[];
}