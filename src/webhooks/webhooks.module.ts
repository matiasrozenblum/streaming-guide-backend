import { Module, forwardRef } from '@nestjs/common';
import { TwitchWebhookController } from './twitch-webhook.controller';
import { KickWebhookController } from './kick-webhook.controller';
import { WebhookSubscriptionService } from './webhook-subscription.service';
import { StreamersModule } from '../streamers/streamers.module';
import { RedisModule } from '../redis/redis.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    forwardRef(() => StreamersModule),
    RedisModule,
    ConfigModule,
  ],
  controllers: [TwitchWebhookController, KickWebhookController],
  providers: [WebhookSubscriptionService],
  exports: [WebhookSubscriptionService],
})
export class WebhooksModule {}

