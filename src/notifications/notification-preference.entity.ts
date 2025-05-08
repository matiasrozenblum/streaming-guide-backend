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
    
        @Column()
        deviceId: string;
    
        @Column()
        programId: string;
    
        @CreateDateColumn()
        createdAt: Date;
}