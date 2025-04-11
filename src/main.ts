import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Swagger Configuration
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

  app.useGlobalPipes(new ValidationPipe());
  
  // Configure CORS for Railway
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Get port from Railway's PORT environment variable
  const port = process.env.PORT || 3000;
  
  try {
    await app.listen(port, '0.0.0.0');
    console.log(`Application is running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Database URL: ${process.env.DATABASE_URL ? 'Configured' : 'Not configured'}`);
    console.log(`JWT Secret: ${process.env.JWT_SECRET ? 'Configured' : 'Not configured'}`);
    console.log(`CORS enabled for all origins`);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}
bootstrap();
