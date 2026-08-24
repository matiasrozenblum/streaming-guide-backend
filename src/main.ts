import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';

async function bootstrap() {
  // Body parsing is configured explicitly so that `strict: false` applies.
  // Express's default JSON parser is strict: it only accepts objects and arrays
  // at the top level, so a body of `null` is rejected with a 400 before ever
  // reaching a handler. Mobile clients call POST /auth/refresh with a null body
  // (the refresh token travels in the Authorization header, so there is nothing
  // to send), which made every token refresh fail — and with it, every logged-in
  // session once its access token expired. `null` is valid JSON; treating it as
  // such costs nothing and keeps already-released clients working.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ strict: false, limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));
  const _configService = app.get(ConfigService);

  const config = new DocumentBuilder()
    .setTitle('Streaming Guide API')
    .setDescription('API para gestionar canales de streaming y programación')
    .setVersion('1.0')
    .addTag('channels')
    .addTag('programs')
    .addTag('schedules')
    .addTag('panelists')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const port = process.env.PORT || 8080;

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Application is running on port ${port}`);
}
void bootstrap();
