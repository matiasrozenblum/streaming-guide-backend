import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle('Streaming Guide API')  // Título de la API
    .setDescription('API para gestionar canales de streaming y programación')  // Descripción
    .setVersion('1.0')  // Versión de la API
    .addTag('channels')  // Etiqueta para los canales
    .addTag('programs')  // Etiqueta para los programas
    .addTag('schedules')  // Etiqueta para los horarios
    .addTag('panelists')  // Etiqueta para los panelistas
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);  // El endpoint donde estará la documentación

  app.useGlobalPipes(new ValidationPipe());
  app.enableCors();

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Application is running on: http://0.0.0.0:${port}`);
}
bootstrap();
