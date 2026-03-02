import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env.FRONTEND_URL || '',
    ].filter(Boolean),
    credentials: true,
  });

  app.useWebSocketAdapter(new IoAdapter(app));

  const config = new DocumentBuilder()
    .setTitle('ProctoLearn API')
    .setDescription('Онлайн оқыту платформасы API құжаттамасы')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT || 4000;
  await app.listen(port);
  console.log(`🚀 ProctoLearn API is running on: http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
