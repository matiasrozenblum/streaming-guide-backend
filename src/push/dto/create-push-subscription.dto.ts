export class CreatePushSubscriptionDto {
    deviceId: string;
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
  }