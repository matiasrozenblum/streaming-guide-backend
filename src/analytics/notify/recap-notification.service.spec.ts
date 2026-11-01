import { RecapNotificationService } from './recap-notification.service';

/**
 * This service sends notifications to real phones, so the things worth pinning
 * down are the ones that decide *who* gets one: the threshold, the switch, and
 * the native-only rule.
 */
describe('RecapNotificationService', () => {
  let dailyUser: { createQueryBuilder: jest.Mock };
  let users: { find: jest.Mock };
  let subscriptions: { find: jest.Mock };
  let push: { sendNotification: jest.Mock };
  let sentry: { captureMessage: jest.Mock };
  let service: RecapNotificationService;
  /** Rows the eligibility query returns. */
  let eligibleRows: Array<{ user_id: number }>;
  let queryBuilder: Record<string, jest.Mock>;

  beforeEach(() => {
    eligibleRows = [];
    const chain = () => queryBuilder;
    queryBuilder = {
      select: jest.fn(chain),
      where: jest.fn(chain),
      andWhere: jest.fn(chain),
      groupBy: jest.fn(chain),
      having: jest.fn(chain),
      getRawMany: jest.fn(() => Promise.resolve(eligibleRows)),
    };

    dailyUser = { createQueryBuilder: jest.fn(chain) };
    users = { find: jest.fn().mockResolvedValue([]) };
    subscriptions = { find: jest.fn().mockResolvedValue([]) };
    push = { sendNotification: jest.fn().mockResolvedValue(true) };
    sentry = { captureMessage: jest.fn() };

    service = new RecapNotificationService(
      dailyUser as never,
      users as never,
      subscriptions as never,
      push as never,
      sentry as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('no manda nada cuando nadie llega al minimo', async () => {
    const result = await service.announce('week');

    expect(result.eligible).toBe(0);
    expect(users.find).not.toHaveBeenCalled();
    expect(push.sendNotification).not.toHaveBeenCalled();
  });

  it('no manda nada cuando los que llegan lo tienen apagado', async () => {
    eligibleRows = [{ user_id: 1 }, { user_id: 2 }];

    const result = await service.announce('week');

    expect(result.eligible).toBe(2);
    expect(result.optedIn).toBe(0);
    expect(subscriptions.find).not.toHaveBeenCalled();
    expect(push.sendNotification).not.toHaveBeenCalled();
  });

  it('mira el interruptor que corresponde al periodo', async () => {
    eligibleRows = [{ user_id: 1 }];

    await service.announce('week');
    expect(users.find.mock.calls[0][0].where).toMatchObject({
      recapWeeklyPush: true,
    });

    users.find.mockClear();
    await service.announce('month');
    expect(users.find.mock.calls[0][0].where).toMatchObject({
      recapMonthlyPush: true,
    });
  });

  it('solo toma las suscripciones nativas, nunca las del navegador', async () => {
    eligibleRows = [{ user_id: 1 }];
    users.find.mockResolvedValue([{ id: 1 }]);

    await service.announce('week');

    // A device's FCM token is stored as the endpoint with no web-push keys, so
    // a null p256dh is what separates a phone from a browser.
    expect(subscriptions.find.mock.calls[0][0].where).toHaveProperty('p256dh');
  });

  it('manda un aviso por suscripcion, con el destino en los datos', async () => {
    eligibleRows = [{ user_id: 1 }];
    users.find.mockResolvedValue([{ id: 1 }]);
    subscriptions.find.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

    const result = await service.announce('week');

    expect(result.devices).toBe(2);
    expect(push.sendNotification).toHaveBeenCalledTimes(2);
    expect(push.sendNotification.mock.calls[0][1]).toMatchObject({
      data: { type: 'recap', period: 'week' },
    });
  });

  it('un ensayo apuntado a una cuenta no puede alcanzar a otra', async () => {
    eligibleRows = [{ user_id: 9 }];

    await service.announce('week', 9);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'u.user_id = :onlyUserId',
      { onlyUserId: 9 },
    );
  });

  it('la semana va de lunes a hoy', async () => {
    // Viernes 2026-10-30, 18:00 en Buenos Aires.
    jest.useFakeTimers({ now: new Date('2026-10-30T21:00:00Z') });
    eligibleRows = [{ user_id: 1 }];

    const result = await service.announce('week');

    expect(result.from).toBe('2026-10-26');
    expect(result.to).toBe('2026-10-30');
  });

  it('el mes va del dia 1 a hoy', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-30T21:00:00Z') });
    eligibleRows = [{ user_id: 1 }];

    const result = await service.announce('month');

    expect(result.from).toBe('2026-10-01');
    expect(result.to).toBe('2026-10-30');
  });

  it('el aviso mensual solo sale el anteultimo dia del mes', async () => {
    const announce = jest.spyOn(service, 'announce').mockResolvedValue({
      period: 'month',
      from: '2026-10-01',
      to: '2026-10-30',
      eligible: 0,
      optedIn: 0,
      devices: 0,
    });

    // 29 de octubre: todavia no.
    jest.useFakeTimers({ now: new Date('2026-10-29T21:00:00Z') });
    await service.announceMonthly();
    expect(announce).not.toHaveBeenCalled();

    // 30 de octubre, anteultimo dia de un mes de 31.
    jest.useFakeTimers({ now: new Date('2026-10-30T21:00:00Z') });
    await service.announceMonthly();
    expect(announce).toHaveBeenCalledWith('month');

    // 31: el mes ya se anuncio, no se repite.
    announce.mockClear();
    jest.useFakeTimers({ now: new Date('2026-10-31T21:00:00Z') });
    await service.announceMonthly();
    expect(announce).not.toHaveBeenCalled();
  });

  it('un fallo del envio no tumba el cron', async () => {
    jest.spyOn(service, 'announce').mockRejectedValue(new Error('firebase'));
    jest.useFakeTimers({ now: new Date('2026-10-30T21:00:00Z') });

    await expect(service.announceMonthly()).resolves.toBeUndefined();
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      'Recap announcement failed',
      'error',
      expect.objectContaining({ error_type: 'recap_announcement_failed' }),
    );
  });
});
