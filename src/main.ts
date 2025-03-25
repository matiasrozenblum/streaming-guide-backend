import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  await app.listen(3000);
}
bootstrap();
