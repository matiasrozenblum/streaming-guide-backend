import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    Unique,
  } from 'typeorm';
  
    @Entity('notification_preferences')
    @Unique(['deviceId', 'programId'])
    export class NotificationPreferenceEntity {
        @PrimaryGeneratedColumn('uuid')
        id: string;
    
        @Column({ name: 'device_id' })
        deviceId: string;
    
        @Column({ name: 'program_id', type: 'int' })
        programId: number;
    
        @CreateDateColumn({ name: 'created_at' })
        createdAt: Date;
}