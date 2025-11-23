import { Module, forwardRef } from '@nestjs/common';
import { TwitchWebhookController } from './twitch-webhook.controller';
import { KickWebhookController } from './kick-webhook.controller';
import { TokenRefreshController } from './token-refresh.controller';
import { WebhookSubscriptionService } from './webhook-subscription.service';
import { TokenRefreshService } from './token-refresh.service';
import { TokenRefreshScheduler } from './token-refresh.scheduler';
import { StreamersModule } from '../streamers/streamers.module';
import { RedisModule } from '../redis/redis.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [
    forwardRef(() => StreamersModule),
    RedisModule,
    ConfigModule,
  ],
  controllers: [TwitchWebhookController, KickWebhookController, TokenRefreshController],
  providers: [WebhookSubscriptionService, TokenRefreshService, TokenRefreshScheduler],
  exports: [WebhookSubscriptionService, TokenRefreshService],
})
export class WebhooksModule {}

