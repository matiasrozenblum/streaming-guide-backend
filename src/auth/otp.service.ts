import { Injectable, BadRequestException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
@Injectable()
export class OtpService {
  private readonly prefix = 'login:otp:';
  private readonly attemptsPrefix = 'login:otp-attempts:';
  private readonly ttlSeconds: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.ttlSeconds = Number(this.config.get('OTP_TTL_SECONDS', 300));
    this.maxAttempts = Number(this.config.get('OTP_MAX_ATTEMPTS', 5));
  }

  private genCode(): string {
    // 6 dígitos aleatorios
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private normalize(identifier: string): string {
    return identifier.toLowerCase().trim();
  }

  async sendCode(identifier: string): Promise<void> {
    identifier = this.normalize(identifier);
    const code = this.genCode();
    const key = this.prefix + identifier;
    // almacena código en Redis con TTL; un código nuevo resetea los intentos
    await this.redis.set(key, code, this.ttlSeconds);
    await this.redis.del(this.attemptsPrefix + identifier);
    const ttlMinutes = Math.floor(this.ttlSeconds / 60);
    await this.emailService.sendOtpCode(identifier, code, ttlMinutes);
  }

  /**
   * Checks the code WITHOUT consuming it, so a later step (e.g. reset-password)
   * can still use it. Wrong attempts are counted: after `maxAttempts` failures
   * the code is invalidated, which keeps the 6-digit space from being
   * brute-forced through this or any other endpoint that checks codes.
   */
  async validateCode(identifier: string, code: string): Promise<void> {
    identifier = this.normalize(identifier);
    const key = this.prefix + identifier;
    const attemptsKey = this.attemptsPrefix + identifier;
    const stored = await this.redis.get<string>(key);
    if (!stored) {
      throw new BadRequestException('Código inválido o expirado');
    }
    if (stored !== String(code ?? '').trim()) {
      const attempts = await this.redis.incr(attemptsKey);
      if (attempts === 1) {
        await this.redis.client.expire(attemptsKey, this.ttlSeconds);
      }
      if (attempts >= this.maxAttempts) {
        await this.redis.del([key, attemptsKey]);
        throw new BadRequestException(
          'Demasiados intentos. Pedí un código nuevo.',
        );
      }
      throw new BadRequestException('Código inválido o expirado');
    }
  }

  /** Checks the code and consumes it (single use). */
  async verifyCode(identifier: string, code: string): Promise<void> {
    await this.validateCode(identifier, code);
    identifier = this.normalize(identifier);
    await this.redis.del([
      this.prefix + identifier,
      this.attemptsPrefix + identifier,
    ]);
  }
}
