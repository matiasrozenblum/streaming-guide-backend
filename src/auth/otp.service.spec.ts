import { BadRequestException } from '@nestjs/common';
import { OtpService } from './otp.service';

describe('OtpService', () => {
  let store: Map<string, string>;
  let redis: any;
  let emailService: any;
  let service: OtpService;

  beforeEach(() => {
    // Minimal in-memory Redis with the same JSON (de)serialization as RedisService
    store = new Map();
    redis = {
      set: jest.fn(async (key: string, value: unknown) => {
        store.set(key, JSON.stringify(value));
      }),
      get: jest.fn(async (key: string) => {
        const v = store.get(key);
        return v ? JSON.parse(v) : null;
      }),
      del: jest.fn(async (key: string | string[]) => {
        (Array.isArray(key) ? key : [key]).forEach((k) => store.delete(k));
      }),
      incr: jest.fn(async (key: string) => {
        const next = Number(store.get(key) ?? 0) + 1;
        store.set(key, String(next));
        return next;
      }),
      client: { expire: jest.fn() },
    };
    emailService = { sendOtpCode: jest.fn() };
    const config = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    } as any;
    service = new OtpService(redis, config, emailService);
  });

  const sentCode = () => emailService.sendOtpCode.mock.calls.at(-1)[1];

  it('sends a 6-digit code to the normalized identifier', async () => {
    await service.sendCode('  User@Example.com ');

    expect(emailService.sendOtpCode).toHaveBeenCalledWith(
      'user@example.com',
      expect.stringMatching(/^\d{6}$/),
      5,
    );
  });

  describe('validateCode', () => {
    it('accepts the right code without consuming it', async () => {
      await service.sendCode('user@example.com');
      const code = sentCode();

      await expect(
        service.validateCode('USER@example.com', code),
      ).resolves.toBeUndefined();
      // Still usable afterwards (e.g. by reset-password)
      await expect(
        service.verifyCode('user@example.com', code),
      ).resolves.toBeUndefined();
    });

    it('rejects a wrong code without consuming the right one', async () => {
      await service.sendCode('user@example.com');
      const code = sentCode();

      await expect(
        service.validateCode('user@example.com', '000000'),
      ).rejects.toThrow('Código inválido o expirado');
      await expect(
        service.validateCode('user@example.com', code),
      ).resolves.toBeUndefined();
    });

    it('rejects when there is no code (expired or never sent)', async () => {
      await expect(
        service.validateCode('user@example.com', '123456'),
      ).rejects.toThrow('Código inválido o expirado');
    });

    it('invalidates the code after too many wrong attempts', async () => {
      await service.sendCode('user@example.com');
      const code = sentCode();
      const wrong = code === '000000' ? '111111' : '000000';

      for (let i = 0; i < 4; i++) {
        await expect(
          service.validateCode('user@example.com', wrong),
        ).rejects.toThrow('Código inválido o expirado');
      }
      await expect(
        service.validateCode('user@example.com', wrong),
      ).rejects.toThrow('Demasiados intentos. Pedí un código nuevo.');

      // Even the right code no longer works
      await expect(
        service.validateCode('user@example.com', code),
      ).rejects.toThrow(BadRequestException);
    });

    it('expires the attempts counter together with the code', async () => {
      await service.sendCode('user@example.com');

      await expect(
        service.validateCode('user@example.com', 'nope'),
      ).rejects.toThrow();

      expect(redis.client.expire).toHaveBeenCalledWith(
        'login:otp-attempts:user@example.com',
        300,
      );
    });

    it('resets the attempts when a new code is sent', async () => {
      await service.sendCode('user@example.com');
      for (let i = 0; i < 4; i++) {
        await expect(
          service.validateCode('user@example.com', 'nope'),
        ).rejects.toThrow('Código inválido o expirado');
      }

      await service.sendCode('user@example.com');

      // A single wrong attempt on the new code is not "too many"
      await expect(
        service.validateCode('user@example.com', 'nope'),
      ).rejects.toThrow('Código inválido o expirado');
      await expect(
        service.validateCode('user@example.com', sentCode()),
      ).resolves.toBeUndefined();
    });
  });

  describe('verifyCode', () => {
    it('consumes the code (single use)', async () => {
      await service.sendCode('user@example.com');
      const code = sentCode();

      await service.verifyCode('user@example.com', code);

      await expect(
        service.verifyCode('user@example.com', code),
      ).rejects.toThrow('Código inválido o expirado');
    });

    it('counts wrong attempts too', async () => {
      await service.sendCode('user@example.com');
      const code = sentCode();
      const wrong = code === '000000' ? '111111' : '000000';

      for (let i = 0; i < 5; i++) {
        await expect(
          service.verifyCode('user@example.com', wrong),
        ).rejects.toThrow();
      }
      await expect(
        service.verifyCode('user@example.com', code),
      ).rejects.toThrow('Código inválido o expirado');
    });
  });
});
