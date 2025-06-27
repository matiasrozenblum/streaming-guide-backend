import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';
import { User } from '../users/users.entity';
import { UserSubscription } from '../users/user-subscription.entity';
import { Program } from '../programs/programs.entity';
import { Channel } from '../channels/channels.entity';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserSubscription, Program, Channel]),
    EmailModule,
  ],
  controllers: [StatisticsController],
  providers: [StatisticsService],
  exports: [StatisticsService],
})
export class StatisticsModule {} 