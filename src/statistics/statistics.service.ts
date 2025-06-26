import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/users.entity';
import { UserSubscription } from '../users/user-subscription.entity';
import { Program } from '../programs/programs.entity';
import { Channel } from '../channels/channels.entity';

export interface UserDemographics {
  totalUsers: number;
  byGender: {
    male: number;
    female: number;
    non_binary: number;
    rather_not_say: number;
  };
  byAgeGroup: {
    under18: number;
    age18to30: number;
    age30to45: number;
    age45to60: number;
    over60: number;
    unknown: number;
  };
  usersWithSubscriptions: number;
  usersWithoutSubscriptions: number;
}

export interface ProgramSubscriptionStats {
  programId: number;
  programName: string;
  channelName: string;
  totalSubscriptions: number;
  byGender: {
    male: number;
    female: number;
    non_binary: number;
    rather_not_say: number;
  };
  byAgeGroup: {
    under18: number;
    age18to30: number;
    age30to45: number;
    age45to60: number;
    over60: number;
    unknown: number;
  };
}

export interface TopProgramsStats {
  programId: number;
  programName: string;
  channelName: string;
  subscriptionCount: number;
  percentageOfTotalUsers: number;
}

@Injectable()
export class StatisticsService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserSubscription)
    private subscriptionRepository: Repository<UserSubscription>,
    @InjectRepository(Program)
    private programRepository: Repository<Program>,
    @InjectRepository(Channel)
    private channelRepository: Repository<Channel>,
  ) {}

  private calculateAgeGroup(birthDate: Date | string): string {
    // Ensure birthDate is a Date object
    const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
    
    // Check if the date is valid
    if (isNaN(birth.getTime())) {
      return 'unknown';
    }
    
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    if (age < 18) return 'under18';
    if (age >= 18 && age <= 30) return 'age18to30';
    if (age >= 31 && age <= 45) return 'age30to45';
    if (age >= 46 && age <= 60) return 'age45to60';
    return 'over60';
  }

  async getUserDemographics(): Promise<UserDemographics> {
    const users = await this.userRepository.find({
      where: { role: 'user' },
      relations: ['subscriptions'],
    });

    const totalUsers = users.length;
    const byGender = {
      male: 0,
      female: 0,
      non_binary: 0,
      rather_not_say: 0,
    };

    const byAgeGroup = {
      under18: 0,
      age18to30: 0,
      age30to45: 0,
      age45to60: 0,
      over60: 0,
      unknown: 0,
    };

    let usersWithSubscriptions = 0;
    let usersWithoutSubscriptions = 0;

    users.forEach(user => {
      // Count by gender
      if (user.gender) {
        byGender[user.gender]++;
      }

      // Count by age group
      if (user.birthDate) {
        const ageGroup = this.calculateAgeGroup(user.birthDate);
        byAgeGroup[ageGroup]++;
      }

      // Count subscription status
      if (user.subscriptions && user.subscriptions.length > 0) {
        usersWithSubscriptions++;
      } else {
        usersWithoutSubscriptions++;
      }
    });

    return {
      totalUsers,
      byGender,
      byAgeGroup,
      usersWithSubscriptions,
      usersWithoutSubscriptions,
    };
  }

  async getTopPrograms(limit: number = 10): Promise<TopProgramsStats[]> {
    const totalUsers = await this.userRepository.count({ where: { role: 'user' } });

    const topPrograms = await this.subscriptionRepository
      .createQueryBuilder('subscription')
      .leftJoinAndSelect('subscription.program', 'program')
      .leftJoinAndSelect('program.channel', 'channel')
      .select([
        'program.id as programId',
        'program.name as programName',
        'channel.name as channelName',
        'COUNT(subscription.id) as subscriptionCount',
      ])
      .groupBy('program.id, program.name, channel.name')
      .orderBy('subscriptionCount', 'DESC')
      .limit(limit)
      .getRawMany();

    return topPrograms.map(p => ({
      programId: parseInt(p.programid),
      programName: p.programname,
      channelName: p.channelname,
      subscriptionCount: parseInt(p.subscriptioncount),
      percentageOfTotalUsers: totalUsers > 0 ? (parseInt(p.subscriptioncount) / totalUsers) * 100 : 0,
    }));
  }

  async getProgramSubscriptionStats(programId: number): Promise<ProgramSubscriptionStats | null> {
    const program = await this.programRepository.findOne({
      where: { id: programId },
      relations: ['channel'],
    });

    if (!program) {
      return null;
    }

    const subscriptions = await this.subscriptionRepository.find({
      where: { program: { id: programId } },
      relations: ['user'],
    });

    const byGender = {
      male: 0,
      female: 0,
      non_binary: 0,
      rather_not_say: 0,
    };

    const byAgeGroup = {
      under18: 0,
      age18to30: 0,
      age30to45: 0,
      age45to60: 0,
      over60: 0,
      unknown: 0,
    };

    subscriptions.forEach(subscription => {
      const user = subscription.user;
      
      // Count by gender
      if (user.gender) {
        byGender[user.gender]++;
      }

      // Count by age group
      if (user.birthDate) {
        const ageGroup = this.calculateAgeGroup(user.birthDate);
        byAgeGroup[ageGroup]++;
      }
    });

    return {
      programId: program.id,
      programName: program.name,
      channelName: program.channel.name,
      totalSubscriptions: subscriptions.length,
      byGender,
      byAgeGroup,
    };
  }

  async getAllProgramsSubscriptionStats(): Promise<ProgramSubscriptionStats[]> {
    const programs = await this.programRepository.find({
      relations: ['channel'],
    });

    const stats = await Promise.all(
      programs.map(async (program) => {
        const subscriptions = await this.subscriptionRepository.find({
          where: { program: { id: program.id } },
          relations: ['user'],
        });

        const byGender = {
          male: 0,
          female: 0,
          non_binary: 0,
          rather_not_say: 0,
        };

        const byAgeGroup = {
          under18: 0,
          age18to30: 0,
          age30to45: 0,
          age45to60: 0,
          over60: 0,
          unknown: 0,
        };

        subscriptions.forEach(subscription => {
          const user = subscription.user;
          
          if (user.gender) {
            byGender[user.gender]++;
          }

          if (user.birthDate) {
            const ageGroup = this.calculateAgeGroup(user.birthDate);
            byAgeGroup[ageGroup]++;
          }
        });

        return {
          programId: program.id,
          programName: program.name,
          channelName: program.channel.name,
          totalSubscriptions: subscriptions.length,
          byGender,
          byAgeGroup,
        };
      })
    );

    return stats.sort((a, b) => b.totalSubscriptions - a.totalSubscriptions);
  }

  async getNewUsersReport(from: string, to: string, page: number = 1, pageSize: number = 20) {
    const skip = (page - 1) * pageSize;
    const qb = this.userRepository.createQueryBuilder('user')
      .where('user.role = :role', { role: 'user' })
      .andWhere('user.createdAt >= :from', { from })
      .andWhere('user.createdAt <= :to', { to })
      .orderBy('user.createdAt', 'DESC')
      .skip(skip)
      .take(pageSize)
      .select([
        'user.id',
        'user.firstName',
        'user.lastName',
        'user.gender',
        'user.birthDate',
        'user.createdAt',
      ]);
    const [users, total] = await qb.getManyAndCount();
    return {
      total,
      page,
      pageSize,
      users,
    };
  }

  async getNewSubscriptionsReport(
    from: string,
    to: string,
    page: number = 1,
    pageSize: number = 20,
    channelId?: number,
    programId?: number,
  ) {
    const skip = (page - 1) * pageSize;
    const qb = this.subscriptionRepository.createQueryBuilder('subscription')
      .leftJoinAndSelect('subscription.user', 'user')
      .leftJoinAndSelect('subscription.program', 'program')
      .leftJoinAndSelect('program.channel', 'channel')
      .where('subscription.createdAt >= :from', { from })
      .andWhere('subscription.createdAt <= :to', { to });
    if (programId) {
      qb.andWhere('program.id = :programId', { programId });
    }
    if (channelId) {
      qb.andWhere('channel.id = :channelId', { channelId });
    }
    qb.orderBy('subscription.createdAt', 'DESC')
      .skip(skip)
      .take(pageSize);
    const [subscriptions, total] = await qb.getManyAndCount();
    // Map to required fields
    const result = subscriptions.map(sub => ({
      id: sub.id,
      createdAt: sub.createdAt,
      user: sub.user ? { id: sub.user.id, firstName: sub.user.firstName, lastName: sub.user.lastName } : null,
      program: sub.program ? { id: sub.program.id, name: sub.program.name } : null,
      channel: sub.program && sub.program.channel ? { id: sub.program.channel.id, name: sub.program.channel.name } : null,
    }));
    return {
      total,
      page,
      pageSize,
      subscriptions: result,
    };
  }
} 