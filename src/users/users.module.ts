import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './users.entity';
import { Device } from './device.entity';
import { UserSubscription } from './user-subscription.entity';
import { Program } from '../programs/programs.entity';
import { DeviceService } from './device.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, Device, UserSubscription, Program])],
  controllers: [UsersController, SubscriptionController],
  providers: [UsersService, DeviceService, SubscriptionService],
  exports: [UsersService, DeviceService, SubscriptionService],
})
export class UsersModule {}