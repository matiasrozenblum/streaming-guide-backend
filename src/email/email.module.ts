import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SentryModule } from '../sentry/sentry.module';

@Module({
  imports: [
    ConfigModule,
    SentryModule,
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get('SMTP_HOST'),
          port: Number(configService.get('SMTP_PORT')),
          secure: false,
          requireTLS: true, // Required by Gmail for port 587
          auth: {
            user: configService.get('SMTP_USER'),
            pass: configService.get('SMTP_PASS'),
          },
          connectionTimeout: 60000, // 60 seconds
          greetingTimeout: 30000,   // 30 seconds
          socketTimeout: 60000,     // 60 seconds
        },
        defaults: {
          from: `"La Guía del Streaming" <${configService.get('SMTP_USER')}>`,
        },
      }),
    }),
  ],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
