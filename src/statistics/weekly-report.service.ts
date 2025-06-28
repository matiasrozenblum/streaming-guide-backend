import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { User } from '../users/users.entity';
import { UserSubscription } from '../users/user-subscription.entity';
import { Program } from '../programs/programs.entity';
import { Channel } from '../channels/channels.entity';
import * as dayjs from 'dayjs';
import { fetchYouTubeClicks, aggregateClicksBy } from './posthog.util';

export interface WeeklyReportData {
  from: string;
  to: string;
  totalNewUsers: number;
  usersByGender: Record<string, number>;
  totalNewSubscriptions: number;
  subscriptionsByGender: Record<string, number>;
  subscriptionsByAge: Record<string, number>;
  subscriptionsByProgram: { programId: number; programName: string; count: number }[];
  subscriptionsByChannel: { channelId: number; channelName: string; count: number }[];
  topChannelsBySubscriptions: { channelId: number; channelName: string; count: number }[];
  topChannelsByClicksLive: { channelName: string; count: number }[];
  topChannelsByClicksDeferred: { channelName: string; count: number }[];
  topProgramsBySubscriptions: { programId: number; programName: string; channelName: string; count: number }[];
  topProgramsByClicksLive: { programName: string; channelName: string; count: number }[];
  topProgramsByClicksDeferred: { programName: string; channelName: string; count: number }[];
  rankingChanges: {
    type: 'channel' | 'program';
    metric: 'subscriptions' | 'clicksLive' | 'clicksDeferred';
    previous: { id: number | string; name: string; rank: number }[];
    current: { id: number | string; name: string; rank: number }[];
  }[];
}

@Injectable()
export class WeeklyReportService {
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

  async getWeeklyReportData(from: string, to: string, channelId?: number): Promise<WeeklyReportData> {
    // 1. New users
    const userWhere: any = { role: 'user', createdAt: Between(from, to) };
    if (channelId) userWhere.channel = { id: channelId };
    const newUsers = await this.userRepository.find({ where: userWhere });
    const totalNewUsers = newUsers.length;
    const usersByGender: Record<string, number> = {};
    newUsers.forEach(u => {
      usersByGender[u.gender || 'unknown'] = (usersByGender[u.gender || 'unknown'] || 0) + 1;
    });

    // 2. New subscriptions
    const subWhere: any = { createdAt: Between(from, to) };
    if (channelId) subWhere.channel = { id: channelId };
    const newSubs = await this.subscriptionRepository.find({
      where: subWhere,
      relations: ['user', 'program', 'program.channel'],
    });
    const totalNewSubscriptions = newSubs.length;
    const subscriptionsByGender: Record<string, number> = {};
    const subscriptionsByAge: Record<string, number> = {};
    const subscriptionsByProgram: Record<number, { programId: number; programName: string; count: number; channelName: string }> = {};
    const subscriptionsByChannel: Record<number, { channelId: number; channelName: string; count: number }> = {};
    newSubs.forEach(sub => {
      // Gender
      const gender = sub.user?.gender || 'unknown';
      subscriptionsByGender[gender] = (subscriptionsByGender[gender] || 0) + 1;
      // Age
      if (sub.user?.birthDate) {
        const age = this.calculateAge(sub.user.birthDate, from);
        const ageGroup = this.getAgeGroup(age);
        subscriptionsByAge[ageGroup] = (subscriptionsByAge[ageGroup] || 0) + 1;
      } else {
        subscriptionsByAge['unknown'] = (subscriptionsByAge['unknown'] || 0) + 1;
      }
      // Program
      if (sub.program) {
        const pid = sub.program.id;
        if (!subscriptionsByProgram[pid]) {
          subscriptionsByProgram[pid] = {
            programId: pid,
            programName: sub.program.name,
            count: 0,
            channelName: sub.program.channel?.name || '',
          };
        }
        subscriptionsByProgram[pid].count++;
      }
      // Channel
      if (sub.program?.channel) {
        const cid = sub.program.channel.id;
        if (!subscriptionsByChannel[cid]) {
          subscriptionsByChannel[cid] = {
            channelId: cid,
            channelName: sub.program.channel.name,
            count: 0,
          };
        }
        subscriptionsByChannel[cid].count++;
      }
    });

    // 3. Top 5 channels/programs by subscriptions
    const topChannelsBySubscriptions = Object.values(subscriptionsByChannel)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const topProgramsBySubscriptions = Object.values(subscriptionsByProgram)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map(p => ({ programId: p.programId, programName: p.programName, channelName: p.channelName, count: p.count }));

    // 4. Top 5 channels/programs by YouTube clicks (from PostHog)
    const [liveClicks, deferredClicks] = await Promise.all([
      fetchYouTubeClicks({ from, to, eventType: 'click_youtube_live' }),
      fetchYouTubeClicks({ from, to, eventType: 'click_youtube_deferred' }),
    ]);
    const liveClicksByChannel = await aggregateClicksBy(liveClicks, 'channel_name');
    const deferredClicksByChannel = await aggregateClicksBy(deferredClicks, 'channel_name');
    const liveClicksByProgram = await aggregateClicksBy(liveClicks, 'program_name');
    const deferredClicksByProgram = await aggregateClicksBy(deferredClicks, 'program_name');
    const topChannelsByClicksLive = Object.entries(liveClicksByChannel)
      .map(([channelName, count]) => ({ channelName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const topChannelsByClicksDeferred = Object.entries(deferredClicksByChannel)
      .map(([channelName, count]) => ({ channelName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const topProgramsByClicksLive = Object.entries(liveClicksByProgram)
      .map(([programName, count]) => ({ programName, channelName: '', count })) // channelName can be filled if needed
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const topProgramsByClicksDeferred = Object.entries(deferredClicksByProgram)
      .map(([programName, count]) => ({ programName, channelName: '', count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 5. Ranking changes (stubbed for now)
    const rankingChanges: WeeklyReportData['rankingChanges'] = [];

    return {
      from,
      to,
      totalNewUsers,
      usersByGender,
      totalNewSubscriptions,
      subscriptionsByGender,
      subscriptionsByAge,
      subscriptionsByProgram: Object.values(subscriptionsByProgram),
      subscriptionsByChannel: Object.values(subscriptionsByChannel),
      topChannelsBySubscriptions,
      topChannelsByClicksLive,
      topChannelsByClicksDeferred,
      topProgramsBySubscriptions,
      topProgramsByClicksLive,
      topProgramsByClicksDeferred,
      rankingChanges,
    };
  }

  private calculateAge(birthDate: Date | string, refDate: string): number {
    const birth = birthDate instanceof Date ? birthDate : new Date(birthDate);
    const ref = new Date(refDate);
    let age = ref.getFullYear() - birth.getFullYear();
    const m = ref.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
    return age;
  }

  private getAgeGroup(age: number): string {
    if (age < 18) return 'under18';
    if (age <= 30) return 'age18to30';
    if (age <= 45) return 'age30to45';
    if (age <= 60) return 'age45to60';
    if (age > 60) return 'over60';
    return 'unknown';
  }
} 