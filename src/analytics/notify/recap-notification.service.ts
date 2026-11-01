import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { AnalyticsDailyUser } from '../entities/analytics-daily-user.entity';
import { PushSubscriptionEntity } from '../../push/push-subscription.entity';
import { User } from '../../users/users.entity';
import { PushService } from '../../push/push.service';
import { SentryService } from '../../sentry/sentry.service';
import { DEFAULT_METRIC } from '../query/analytics-admin.service';
import {
  AnalyticsRecapService,
  MIN_PLAYS_FOR_RECAP,
} from '../query/analytics-recap.service';
import { RecapPeriod } from '../dto/analytics-query.dto';

const TIMEZONE = 'America/Argentina/Buenos_Aires';

/** What the notification says. The recap itself is the content; this is a tap. */
const COPY: Record<'week' | 'month', { title: string; body: string }> = {
  week: {
    title: '¡Llegó tu resumen de la semana!',
    body: 'Mirá qué programas y streamers te acompañaron y compartilo.',
  },
  month: {
    title: '¡Llegó tu resumen del mes!',
    body: 'Un mes entero de La Guía, en placas listas para compartir.',
  },
};

export interface RecapAnnouncement {
  period: 'week' | 'month';
  from: string;
  to: string;
  /** People whose recap is worth announcing. */
  eligible: number;
  /** Of those, the ones who still want to hear about it. */
  optedIn: number;
  /** Native subscriptions the notification was handed to. */
  devices: number;
}

/**
 * Tells people, once, that their recap is ready.
 *
 * Only on the first publication of each period — Friday evening for the week,
 * the second-to-last evening for the month. The Saturday and Sunday
 * instalments add days to a recap somebody has already been told about, and a
 * second and third push for the same week would be noise.
 *
 * Native only, by decision: the notification is handed to the subscriptions
 * that carry an FCM token, which are the ones with no web-push keys.
 */
@Injectable()
export class RecapNotificationService {
  private readonly logger = new Logger(RecapNotificationService.name);

  constructor(
    @InjectRepository(AnalyticsDailyUser)
    private readonly dailyUserRepository: Repository<AnalyticsDailyUser>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(PushSubscriptionEntity)
    private readonly subscriptionRepository: Repository<PushSubscriptionEntity>,
    private readonly recapService: AnalyticsRecapService,
    private readonly pushService: PushService,
    private readonly sentryService: SentryService,
  ) {}

  /**
   * Friday at 18:00, the moment the week's recap opens. Ten minutes after the
   * rollup that gives it Friday's plays.
   */
  @Cron('0 18 * * 5', {
    name: 'recap-announce-week',
    timeZone: TIMEZONE,
  })
  async announceWeekly(): Promise<void> {
    await this.runGuarded('week');
  }

  /**
   * Daily, because the month's second-to-last day lands on whatever weekday it
   * lands on; the check inside is what makes it monthly.
   */
  @Cron('0 18 * * *', {
    name: 'recap-announce-month',
    timeZone: TIMEZONE,
  })
  async announceMonthly(): Promise<void> {
    const today = this.buenosAiresNow();
    const lastDay = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0),
    ).getUTCDate();
    if (today.getUTCDate() !== lastDay - 1) return;

    await this.runGuarded('month');
  }

  private async runGuarded(period: 'week' | 'month'): Promise<void> {
    try {
      const result = await this.announce(period);
      this.logger.log(
        `Recap ${period} announced for ${result.from}..${result.to}: ` +
          `${result.eligible} eligible, ${result.optedIn} opted in, ` +
          `${result.devices} device(s)`,
      );
    } catch (error) {
      this.logger.error(
        `Recap ${period} announcement failed: ${(error as Error).message}`,
      );
      this.sentryService.captureMessage('Recap announcement failed', 'error', {
        service: 'analytics',
        error_type: 'recap_announcement_failed',
        period,
        error_message: (error as Error).message,
      });
    }
  }

  /**
   * Send the announcement for the period that is being published right now.
   *
   * `onlyUserId` exists for testing: it runs the whole path — eligibility,
   * preference, devices, payload — against a single account, so the rehearsal
   * cannot reach anybody else.
   */
  async announce(
    period: 'week' | 'month',
    onlyUserId?: number,
  ): Promise<RecapAnnouncement> {
    /**
     * Straight from the service that publishes it, never recomputed here. On
     * the cron's own schedule the two agree anyway, but a rehearsal fired on
     * some other day used to announce a week that was not published yet.
     */
    const { from, to } = this.recapService.publishedRange(
      period === 'week' ? RecapPeriod.WEEK : RecapPeriod.MONTH,
    );

    const eligible = await this.usersWithEnoughPlays(from, to, onlyUserId);
    if (eligible.length === 0) {
      return { period, from, to, eligible: 0, optedIn: 0, devices: 0 };
    }

    const column = period === 'week' ? 'recapWeeklyPush' : 'recapMonthlyPush';
    const optedIn = await this.usersRepository.find({
      where: { id: In(eligible), [column]: true },
      select: ['id'],
    });
    if (optedIn.length === 0) {
      return {
        period,
        from,
        to,
        eligible: eligible.length,
        optedIn: 0,
        devices: 0,
      };
    }

    /**
     * Native subscriptions only: a device's FCM token is stored as the
     * endpoint with no web-push keys, so a null `p256dh` is what tells the two
     * kinds apart.
     */
    const subscriptions = await this.subscriptionRepository.find({
      where: {
        p256dh: IsNull(),
        device: { user: { id: In(optedIn.map((user) => user.id)) } },
      },
      relations: ['device'],
    });

    const payload = {
      ...COPY[period],
      data: {
        // FCM only carries strings in `data`.
        type: 'recap',
        period,
      },
    };

    await Promise.allSettled(
      subscriptions.map((subscription) =>
        this.pushService.sendNotification(subscription, payload),
      ),
    );

    return {
      period,
      from,
      to,
      eligible: eligible.length,
      optedIn: optedIn.length,
      devices: subscriptions.length,
    };
  }

  /**
   * Who has enough in this period to be worth telling. The same metric and the
   * same threshold the recap itself gates on, so nobody is sent to a screen
   * that tells them to keep watching.
   */
  private async usersWithEnoughPlays(
    from: string,
    to: string,
    onlyUserId?: number,
  ): Promise<number[]> {
    const query = this.dailyUserRepository
      .createQueryBuilder('u')
      .select('u.user_id', 'user_id')
      .where('u.date BETWEEN :from AND :to', { from, to })
      .andWhere('u.event_name = :metric', { metric: DEFAULT_METRIC })
      .groupBy('u.user_id')
      .having('SUM(u.count) >= :minimum', { minimum: MIN_PLAYS_FOR_RECAP });

    if (onlyUserId !== undefined) {
      query.andWhere('u.user_id = :onlyUserId', { onlyUserId });
    }

    const rows = await query.getRawMany<{ user_id: number }>();
    return rows.map((row) => Number(row.user_id));
  }

  /** Now, as a wall clock in Buenos Aires, held in a Date's UTC fields. */
  private buenosAiresNow(at: Date = new Date()): Date {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(at);

    const value = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? '0');

    return new Date(
      Date.UTC(
        value('year'),
        value('month') - 1,
        value('day'),
        value('hour') % 24,
      ),
    );
  }
}

/** Re-exported so the admin controller can speak the same vocabulary. */
export type RecapNotificationPeriod = Extract<
  RecapPeriod,
  RecapPeriod.WEEK | RecapPeriod.MONTH
>;
