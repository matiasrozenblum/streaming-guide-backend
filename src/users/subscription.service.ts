import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSubscription, NotificationMethod } from './user-subscription.entity';
import { User } from './users.entity';
import { Program } from '../programs/programs.entity';

export interface CreateSubscriptionDto {
  programId: number;
  notificationMethod: NotificationMethod;
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
  ) {}

  async createSubscription(
    user: User,
    dto: CreateSubscriptionDto,
  ): Promise<UserSubscription> {
    // Check if program exists
    const program = await this.programRepository.findOne({
      where: { id: dto.programId },
    });
    
    if (!program) {
      throw new NotFoundException('Program not found');
    }

    // Check if subscription already exists
    const existingSubscription = await this.subscriptionRepository.findOne({
      where: { user: { id: user.id }, program: { id: dto.programId } },
    });

    if (existingSubscription) {
      throw new ConflictException('User is already subscribed to this program');
    }

    // Create new subscription
    const subscription = this.subscriptionRepository.create({
      user,
      program,
      notificationMethod: dto.notificationMethod,
      isActive: true,
    });

    return await this.subscriptionRepository.save(subscription);
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
} 