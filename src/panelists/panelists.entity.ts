import { Entity, PrimaryGeneratedColumn, Column, ManyToMany } from 'typeorm';
import { Program } from '../programs/programs.entity';

@Entity()
export class Panelist {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  photo_url: string;

  @Column({ type: 'text', nullable: true })
  bio: string;

  @ManyToMany(() => Program, (program) => program.panelists)
  programs: Program[];
}