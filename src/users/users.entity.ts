import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from "typeorm";
import { Exclude } from "class-transformer";
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true })
  phone: string;

  @Exclude()
  @Column()
  password: string;

  @Column({ type: 'enum', enum: ['user','admin'], default: 'user' })
  role: 'user' | 'admin';
}