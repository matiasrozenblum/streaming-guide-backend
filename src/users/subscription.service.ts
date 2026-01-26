import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSubscription, NotificationMethod } from './user-subscription.entity';
import { User } from './users.entity';
import { Program } from '../programs/programs.entity';
import { Device } from '../users/device.entity';
import { PushSubscriptionEntity } from '../push/push-subscription.entity';
import { DeviceService } from './device.service';
import { v4 as uuidv4 } from 'uuid';

export interface CreateSubscriptionDto {
  programId: number;
  notificationMethod: NotificationMethod;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface UpdateSubscriptionDto {
  notificationMethod?: NotificationMethod;
  isActive?: boolean;
}

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(UserSubscription)
    private subscriptionRepository: Repository<UserSubscription>,
    @InjectRepository(Program)
    private programRepository: Repository<Program>,
    @InjectRepository(Device)
    private deviceRepository: Repository<Device>,
    @InjectRepository(PushSubscriptionEntity)
    private pushSubscriptionRepository: Repository<PushSubscriptionEntity>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private deviceService: DeviceService,
  ) { }

  async createSubscription(user: User, dto: CreateSubscriptionDto): Promise<UserSubscription> {
    const { programId, notificationMethod, endpoint, p256dh, auth } = dto;
    const program = await this.programRepository.findOne({ where: { id: programId } });
    if (!program) {
      throw new NotFoundException(`Program with ID ${programId} not found`);
    }

    // Check if subscription already exists
    const existingSubscription = await this.subscriptionRepository.findOne({
      where: { user: { id: user.id }, program: { id: programId } },
    });

    if (existingSubscription) {
      existingSubscription.notificationMethod = notificationMethod;
      existingSubscription.isActive = true;
      return await this.subscriptionRepository.save(existingSubscription);
    }

    const subscription = this.subscriptionRepository.create({
      user,
      program,
      notificationMethod,
      isActive: true,
    });

    const savedSubscription = await this.subscriptionRepository.save(subscription);

    // If notification method is PUSH or BOTH, create a push subscription entry
    if (notificationMethod === NotificationMethod.PUSH || notificationMethod === NotificationMethod.BOTH) {
      await this.createPushSubscription(user, savedSubscription, endpoint, p256dh, auth);
    }

    return savedSubscription;
  }

  // Updated method to create a push subscription entry with actual values
  private async createPushSubscription(
    user: User,
    subscription: UserSubscription,
    endpoint: string,
    p256dh: string,
    auth: string
  ): Promise<void> {
    let device = await this.deviceRepository.findOne({
      where: { user: { id: user.id } },
      relations: ['pushSubscriptions'],
    });

    // If no device exists, create one on-demand
    if (!device) {
      console.log(`📱 [SubscriptionService] No device found for user ${user.id}, creating one on-demand`);
      const generatedDeviceId = uuidv4();
      device = await this.deviceService.findOrCreateDevice(
        user,
        'Auto-created during push subscription', // userAgent placeholder
        generatedDeviceId,
      );
      console.log(`✅ [SubscriptionService] Device created on-demand: ${device.deviceId}`);
    }

    // Check if a push subscription already exists for this device with the same endpoint
    const existingPushSubscription = await this.pushSubscriptionRepository.findOne({
      where: { device: { id: device.id }, endpoint },
    });

    if (!existingPushSubscription) {
      // Create a new push subscription entry with actual values
      const pushSubscription = this.pushSubscriptionRepository.create({
        device,
        endpoint,
        p256dh,
        auth,
      });
      await this.pushSubscriptionRepository.save(pushSubscription);
      console.log(`✅ [SubscriptionService] Push subscription created for device ${device.deviceId}`);
    } else {
      // Update existing push subscription with new keys if they differ
      if (existingPushSubscription.p256dh !== p256dh || existingPushSubscription.auth !== auth) {
        existingPushSubscription.p256dh = p256dh;
        existingPushSubscription.auth = auth;
        await this.pushSubscriptionRepository.save(existingPushSubscription);
        console.log(`🔄 [SubscriptionService] Push subscription updated for device ${device.deviceId}`);
      }
    }
  }

  async getUserSubscriptions(userId: number): Promise<UserSubscription[]> {
    return await this.subscriptionRepository.find({
      where: { user: { id: userId }, isActive: true },
      relations: ['program', 'program.channel'],
      order: { createdAt: 'DESC' },
    });
  }

  async updateSubscription(
    userId: number,
    subscriptionId: string,
    dto: UpdateSubscriptionDto,
  ): Promise<UserSubscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId, user: { id: userId } },
      relations: ['program'],
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (dto.notificationMethod !== undefined) {
      subscription.notificationMethod = dto.notificationMethod;
    }

    if (dto.isActive !== undefined) {
      subscription.isActive = dto.isActive;
    }

    return await this.subscriptionRepository.save(subscription);
  }

  async removeSubscription(userId: number, subscriptionId: string): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId, user: { id: userId } },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    await this.subscriptionRepository.remove(subscription);
  }

  async getSubscribedUsersForProgram(programId: number): Promise<UserSubscription[]> {
    return await this.subscriptionRepository.find({
      where: { program: { id: programId }, isActive: true },
      relations: ['user', 'user.devices', 'user.devices.pushSubscriptions'],
    });
  }

  async isUserSubscribedToProgram(userId: number, programId: number): Promise<boolean> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { user: { id: userId }, program: { id: programId }, isActive: true },
    });
    return !!subscription;
  }

  // Admin Methods

  async adminCreateSubscription(userId: number, programId: number, notificationMethod: NotificationMethod): Promise<UserSubscription> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    const program = await this.programRepository.findOne({ where: { id: programId } });
    if (!program) {
      throw new NotFoundException(`Program with ID ${programId} not found`);
    }

    if (notificationMethod !== NotificationMethod.EMAIL) {
      throw new BadRequestException('Admin can only create subscriptions with "email" notification method.');
    }

    let subscription = await this.subscriptionRepository.findOne({
      where: { user: { id: user.id }, program: { id: programId } },
    });

    if (subscription) {
      subscription.notificationMethod = notificationMethod;
      subscription.isActive = true;
    } else {
      subscription = this.subscriptionRepository.create({
        user,
        program,
        notificationMethod,
        isActive: true,
      });
    }

    return await this.subscriptionRepository.save(subscription);
  }

  async adminUpdateSubscription(subscriptionId: string, dto: UpdateSubscriptionDto): Promise<UserSubscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (dto.notificationMethod !== undefined) {
      subscription.notificationMethod = dto.notificationMethod;
    }

    if (dto.isActive !== undefined) {
      subscription.isActive = dto.isActive;
    }

    return await this.subscriptionRepository.save(subscription);
  }

  async adminRemoveSubscription(subscriptionId: string): Promise<void> {
    const result = await this.subscriptionRepository.delete(subscriptionId);
    if (result.affected === 0) {
      throw new NotFoundException(`Subscription with ID ${subscriptionId} not found`);
    }
  }
} 