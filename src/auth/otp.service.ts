import { Injectable, BadRequestException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
@Injectable()
export class OtpService {
  private readonly prefix = 'login:otp:';
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.ttlSeconds = this.config.get<number>('OTP_TTL_SECONDS', 300);
  }

  private genCode(): string {
    // 6 dígitos aleatorios
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  async sendCode(identifier: string): Promise<void> {
    const code = this.genCode();
    const key = this.prefix + identifier;
    // almacena código en Redis con TTL
    await this.redis.set(key, code, this.ttlSeconds);
    // TODO: enviar por email/SMS
    const ttlMinutes = Math.floor(this.ttlSeconds / 60);
    await this.emailService.sendOtpCode(identifier, code, ttlMinutes);
  }

  async verifyCode(identifier: string, code: string): Promise<void> {
    const key = this.prefix + identifier;
    const stored = await this.redis.get<string>(key);
    if (!stored || stored !== code) {
      throw new BadRequestException('Código inválido o expirado');
    }
    await this.redis.del(key);
  }
}