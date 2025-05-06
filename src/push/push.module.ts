import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PushSubscriptionEntity } from './push-subscription.entity';
import { PushService } from './push.service';
import { PushController } from './push.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PushSubscriptionEntity]),
  ],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}