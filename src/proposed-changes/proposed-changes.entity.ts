import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity()
export class ProposedChange {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  entityType: 'program' | 'schedule'; // ⬅️ para saber qué tipo de entidad afecta

  @Column({ nullable: true })
  channelName?: string; // ⬅️ para poder mostrarlo en el mail / backoffice

  @Column({ nullable: true })
  programName?: string; // ⬅️ para poder mostrarlo en el mail / backoffice

  @Column()
  action: 'create' | 'update' | 'delete'; // ⬅️ que tipo de cambio es

  @Column('jsonb', { nullable: true })
  before?: any; // ⬅️ datos anteriores (solo para update o delete)

  @Column('jsonb', { nullable: true })
  after?: any; // ⬅️ datos propuestos (solo para create o update)

  @Column({ default: 'pending' })
  status: 'pending' | 'approved' | 'rejected'; // ⬅️ estado de aprobación

  @CreateDateColumn()
  createdAt: Date;
}
