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

  private calculateAgeGroup(birthDate: Date): string {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
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

    return topPrograms.map(program => ({
      programId: parseInt(program.programId),
      programName: program.programName,
      channelName: program.channelName,
      subscriptionCount: parseInt(program.subscriptionCount),
      percentageOfTotalUsers: totalUsers > 0 ? (parseInt(program.subscriptionCount) / totalUsers) * 100 : 0,
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
} 