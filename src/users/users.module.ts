import { Module, forwardRef } from '@nestjs/common';
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
import { AuthModule } from '../auth/auth.module';
import { PushModule } from '../push/push.module';
import { DeviceController } from './device.controller';
import { AdminSubscriptionController } from './admin-subscription.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Device, UserSubscription, Program]),
    forwardRef(() => AuthModule),
    PushModule,
  ],
  controllers: [UsersController, SubscriptionController, DeviceController, AdminSubscriptionController],
  providers: [UsersService, DeviceService, SubscriptionService],
  exports: [UsersService, DeviceService, SubscriptionService],
})
export class UsersModule {}