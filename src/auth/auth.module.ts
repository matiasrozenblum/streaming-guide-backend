import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RedisService } from '../redis/redis.service';
import { UsersModule } from '../users/users.module';
import { User } from '../users/users.entity';
import { EmailModule } from '../email/email.module';
import { JwtService } from './jwt.service';
import { SentryModule } from '../sentry/sentry.module';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    TypeOrmModule.forFeature([User]),
    forwardRef(() => UsersModule),
    EmailModule,
    SentryModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cs: ConfigService) => ({
        secret: cs.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '24h', algorithm: 'HS256' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    JwtStrategy,
    RedisService,
    {
      provide: JwtService,
      useClass: JwtService,
    },
  ],
  exports: [AuthService, OtpService],
})
export class AuthModule {}
