import { YoutubeLiveService } from './youtube-live.service';
import { ConfigService } from '../config/config.service';
import { SchedulesService } from '../schedules/schedules.service';
import { RedisService } from '../redis/redis.service';
import { SentryService } from '../sentry/sentry.service';
import { TimezoneUtil } from '../utils/timezone.util';

const CHANNEL_ID = 'UCTHaNTsP7hsVgBxARZTuajw';
const HANDLE = 'luzutv';
const NOT_FOUND_KEY = `videoIdNotFound:${HANDLE}`;
const TRACKING_KEY = `notFoundAttempts:${HANDLE}`;

const ON_AIR_RETRY_TTL = 120;
const DEFAULT_TTL = 900;

/**
 * Regression tests for the Luzu TV incident (2026-08-14): "Nadie Dice Nada" (10:00-12:30) was
 * escalated to not-found at 11:00 and emailed about, while the program was demonstrably live —
 * search?eventType=live simply returned 0 results for a channel that was streaming.
 *
 * Two properties have to hold together, and they pull in opposite directions:
 *   1. While a visible program is on-air the not-found mark must be short, so the background
 *      run actually re-queries YouTube instead of being skipped by the not-found gate.
 *   2. Those fast retries must NOT advance the escalation ladder, or three of them would
 *      escalate (and email) within minutes of a program starting.
 */
describe('YoutubeLiveService not-found retry cadence', () => {
  let service: YoutubeLiveService;
  let redisService: jest.Mocked<RedisService>;
  let schedulesService: jest.Mocked<SchedulesService>;
  let channelsRepository: { findOne: jest.Mock };
  let emailService: { sendEmail: jest.Mock };

  /** 11:00, inside the 10:00-12:30 block. */
  const NOW_MINUTES = 11 * 60;

  const makeSchedule = (overrides: Record<string, any> = {}) => ({
    start_time: '10:00:00',
    end_time: '12:30:00',
    program: {
      name: 'Nadie Dice Nada',
      is_visible: true,
      channel: { youtube_channel_id: CHANNEL_ID },
      ...(overrides.program ?? {}),
    },
    ...overrides,
  });

  /** Extracts the TTL the not-found mark was written with, or undefined if never written. */
  const notFoundTTL = (): number | undefined =>
    redisService.set.mock.calls.find((call) => call[0] === NOT_FOUND_KEY)?.[2];

  /** Extracts the tracking object last persisted, or undefined if never written. */
  const persistedTracking = (): any =>
    redisService.set.mock.calls
      .filter((call) => call[0] === TRACKING_KEY)
      .map((call) => call[1])
      .pop();

  const escalate = () =>
    (service as any).handleNotFoundEscalationMain(
      CHANNEL_ID,
      HANDLE,
      NOT_FOUND_KEY,
    );

  beforeEach(() => {
    redisService = {
      get: jest.fn().mockResolvedValue(null),
      mget: jest.fn().mockResolvedValue([]),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      setNX: jest.fn().mockResolvedValue(true),
    } as any;
    schedulesService = {
      findAll: jest.fn().mockResolvedValue([makeSchedule()]),
      findByDay: jest.fn(),
      enrichSchedules: jest.fn((s) => Promise.resolve(s)),
    } as any;
    channelsRepository = {
      findOne: jest.fn().mockResolvedValue({ is_visible: true }),
    };
    emailService = { sendEmail: jest.fn() };

    jest.spyOn(TimezoneUtil, 'currentDayOfWeek').mockReturnValue('friday');
    jest
      .spyOn(TimezoneUtil, 'currentTimeInMinutes')
      .mockReturnValue(NOW_MINUTES);

    service = new YoutubeLiveService(
      { canFetchLive: jest.fn().mockResolvedValue(true) } as any,
      schedulesService,
      redisService,
      {
        captureMessage: jest.fn(),
        captureException: jest.fn(),
        setTag: jest.fn(),
        addBreadcrumb: jest.fn(),
      } as any as jest.Mocked<SentryService>,
      emailService as any,
      channelsRepository as any,
    );

    // The ladder is what is under test; the program-end lookup is incidental.
    jest
      .spyOn(service as any, 'getCurrentProgramEndTime')
      .mockResolvedValue(Date.now() + 90 * 60 * 1000);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('first attempt', () => {
    it('marks not-found briefly while a visible program is on-air', async () => {
      await escalate();

      expect(notFoundTTL()).toBe(ON_AIR_RETRY_TTL);
      expect(persistedTracking()).toMatchObject({
        attempts: 1,
        escalated: false,
      });
    });

    it('keeps the long mark when nothing is on-air', async () => {
      // Program already finished — there is nothing to retry for.
      jest
        .spyOn(TimezoneUtil, 'currentTimeInMinutes')
        .mockReturnValue(13 * 60);

      await escalate();

      expect(notFoundTTL()).toBe(DEFAULT_TTL);
    });
  });

  describe('fast retries', () => {
    it('does not count an attempt before the 15 minute window elapses', async () => {
      redisService.get.mockResolvedValue({
        attempts: 1,
        firstAttempt: Date.now() - 4 * 60 * 1000,
        lastAttempt: Date.now() - 4 * 60 * 1000,
        escalated: false,
      } as any);

      await escalate();

      expect(notFoundTTL()).toBe(ON_AIR_RETRY_TTL);
      // Tracking must be left alone: no increment, no refreshed lastAttempt.
      expect(persistedTracking()).toBeUndefined();
      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('counts an attempt once the window has elapsed', async () => {
      redisService.get.mockResolvedValue({
        attempts: 1,
        firstAttempt: Date.now() - 16 * 60 * 1000,
        lastAttempt: Date.now() - 16 * 60 * 1000,
        escalated: false,
      } as any);

      await escalate();

      expect(persistedTracking()).toMatchObject({ attempts: 2 });
      expect(notFoundTTL()).toBe(ON_AIR_RETRY_TTL);
      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('quota: which runs are allowed to spend a search', () => {
    const isUploadsOnlyRetry = (
      programName: string | null = 'Nadie Dice Nada',
      cronType: 'main' | 'back-to-back-fix' | 'manual' = 'main',
    ) =>
      (service as any).isUploadsOnlyRetry(HANDLE, programName, cronType);

    it('skips the search on an uncounted retry', async () => {
      redisService.get.mockResolvedValue({
        attempts: 1,
        firstAttempt: Date.now() - 4 * 60 * 1000,
        lastAttempt: Date.now() - 4 * 60 * 1000,
        escalated: false,
      } as any);

      await expect(isUploadsOnlyRetry()).resolves.toBe(true);
    });

    it('spends a search on a counted attempt', async () => {
      redisService.get.mockResolvedValue({
        attempts: 1,
        firstAttempt: Date.now() - 16 * 60 * 1000,
        lastAttempt: Date.now() - 16 * 60 * 1000,
        escalated: false,
      } as any);

      await expect(isUploadsOnlyRetry()).resolves.toBe(false);
    });

    it('spends a search on the first look, with no tracking yet', async () => {
      redisService.get.mockResolvedValue(null);

      await expect(isUploadsOnlyRetry()).resolves.toBe(false);
    });

    it('does not apply once escalated', async () => {
      redisService.get.mockResolvedValue({
        attempts: 3,
        firstAttempt: Date.now() - 40 * 60 * 1000,
        lastAttempt: Date.now() - 60 * 1000,
        escalated: true,
      } as any);

      await expect(isUploadsOnlyRetry()).resolves.toBe(false);
    });

    it('does not apply when no visible program is on-air', async () => {
      redisService.get.mockResolvedValue({
        attempts: 1,
        firstAttempt: Date.now() - 60 * 1000,
        lastAttempt: Date.now() - 60 * 1000,
        escalated: false,
      } as any);

      // Without a program name the uploads fallback would not run either, so skipping
      // the search would leave nothing to detect with.
      await expect(isUploadsOnlyRetry(null)).resolves.toBe(false);
    });

    it('leaves the back-to-back cron on its own ladder', async () => {
      redisService.get.mockResolvedValue({
        attempts: 1,
        firstAttempt: Date.now() - 60 * 1000,
        lastAttempt: Date.now() - 60 * 1000,
        escalated: false,
      } as any);

      await expect(
        isUploadsOnlyRetry('Nadie Dice Nada', 'back-to-back-fix'),
      ).resolves.toBe(false);
    });

    it('falls back to the search when tracking cannot be read', async () => {
      redisService.get.mockRejectedValue(new Error('redis down'));

      await expect(isUploadsOnlyRetry()).resolves.toBe(false);
    });
  });

  it('still escalates on the third counted attempt', async () => {
    redisService.get.mockResolvedValue({
      attempts: 2,
      firstAttempt: Date.now() - 32 * 60 * 1000,
      lastAttempt: Date.now() - 16 * 60 * 1000,
      escalated: false,
    } as any);

    await escalate();

    expect(persistedTracking()).toMatchObject({
      attempts: 3,
      escalated: true,
    });
    // Marked until program end, far beyond the retry TTL.
    expect(notFoundTTL()).toBeGreaterThan(ON_AIR_RETRY_TTL);
  });
});
