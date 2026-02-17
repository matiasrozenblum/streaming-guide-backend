import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserStreamerSubscription } from '../users/user-streamer-subscription.entity';
import { User } from '../users/users.entity';
import { Streamer } from './streamers.entity';
import { CreateStreamerSubscriptionDto } from './dto/create-streamer-subscription.dto';
import { Device } from '../users/device.entity';
import { PushSubscriptionEntity } from '../push/push-subscription.entity';
import { PushService } from '../push/push.service';

@Injectable()
export class StreamerSubscriptionService {
    private readonly logger = new Logger(StreamerSubscriptionService.name);

    constructor(
        @InjectRepository(UserStreamerSubscription)
        private subscriptionRepository: Repository<UserStreamerSubscription>,
        @InjectRepository(Streamer)
        private streamerRepository: Repository<Streamer>,
        @InjectRepository(Device)
        private deviceRepository: Repository<Device>,
        @InjectRepository(PushSubscriptionEntity)
        private pushSubscriptionRepository: Repository<PushSubscriptionEntity>,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        private readonly pushService: PushService,
    ) { }

    async subscribe(user: User, streamerId: number, dto: CreateStreamerSubscriptionDto): Promise<UserStreamerSubscription> {
        const { endpoint, p256dh, auth } = dto;
        const streamer = await this.streamerRepository.findOne({ where: { id: streamerId } });
        if (!streamer) {
            throw new NotFoundException(`Streamer with ID ${streamerId} not found`);
        }

        // Check if subscription already exists
        const existingSubscription = await this.subscriptionRepository.findOne({
            where: { user: { id: user.id }, streamer: { id: streamerId } },
        });

        let subscription: UserStreamerSubscription;

        if (existingSubscription) {
            existingSubscription.isActive = true;
            subscription = await this.subscriptionRepository.save(existingSubscription);
        } else {
            subscription = this.subscriptionRepository.create({
                user,
                streamer,
                isActive: true,
            });
            subscription = await this.subscriptionRepository.save(subscription);
        }

        // Always handle device subscription for Push
        if (endpoint) {
            await this.createPushSubscription(user, endpoint, p256dh, auth);
        }

        return subscription;
    }

    async unsubscribe(user: User, streamerId: number): Promise<void> {
        const subscription = await this.subscriptionRepository.findOne({
            where: { user: { id: user.id }, streamer: { id: streamerId } },
        });

        if (subscription) {
            await this.subscriptionRepository.remove(subscription);
        }
    }

    async getUserSubscriptions(userId: number): Promise<number[]> {
        const subscriptions = await this.subscriptionRepository.find({
            where: { user: { id: userId }, isActive: true },
            relations: ['streamer'],
        });

        return subscriptions.map(sub => sub.streamer.id);
    }

    private async createPushSubscription(
        user: User,
        endpoint: string,
        p256dh?: string,
        auth?: string
    ): Promise<void> {
        const device = await this.deviceRepository.findOne({
            where: { user: { id: user.id } }, // Simplification: associating with first found device or needs proper device ID passed
            // Ideally, the device ID should be passed from the client or determined from context.
            // For now, I'll use the logic similar to program subscription service which seems to pick *a* device.
            // Actually, looking at program subscription service, it finds a device for the user.
            relations: ['pushSubscriptions'],
        });

        if (!device) {
            this.logger.warn(`No device found for user ${user.id} to create push subscription`);
            return;
        }

        const existingPushSubscription = await this.pushSubscriptionRepository.findOne({
            where: { device: { id: device.id }, endpoint },
        });

        if (!existingPushSubscription) {
            const pushSubscription = this.pushSubscriptionRepository.create({
                device,
                endpoint,
                p256dh: p256dh || null,
                auth: auth || null,
            });
            await this.pushSubscriptionRepository.save(pushSubscription);
        }
    }

    async notifySubscribers(streamerId: number): Promise<void> {
        const streamer = await this.streamerRepository.findOne({ where: { id: streamerId } });
        if (!streamer) return;

        this.logger.log(`📢 Notifying subscribers for streamer ${streamer.name} (ID: ${streamerId})`);

        const subscriptions = await this.subscriptionRepository.find({
            where: { streamer: { id: streamerId }, isActive: true },
            relations: ['user', 'user.devices', 'user.devices.pushSubscriptions'],
        });

        if (subscriptions.length === 0) {
            this.logger.log(`No active subscriptions for streamer ${streamer.name}`);
            return;
        }

        const title = streamer.name;
        const body = `¡${streamer.name} acaba de empezar un stream!`;
        const icon = streamer.logo_url || '/img/logo-192x192.png';

        for (const subscription of subscriptions) {
            const user = subscription.user;

            // PUSH Notifications
            if (user.devices && user.devices.length > 0) {
                for (const device of user.devices) {
                    if (device.pushSubscriptions && device.pushSubscriptions.length > 0) {
                        for (const pushSub of device.pushSubscriptions) {
                            try {
                                await this.pushService.sendNotification(pushSub, {
                                    title,
                                    options: {
                                        body,
                                        icon,
                                    },
                                });
                            } catch (error) {
                                this.logger.error(`Failed to send push notification to user ${user.id}`, error);
                            }
                        }
                    }
                }
            }
        }

        this.logger.log(`✅ Notifications sent to ${subscriptions.length} subscribers.`);
    }
}
