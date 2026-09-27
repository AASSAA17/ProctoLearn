import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { NestExpressApplication } from '@nestjs/platform-express';
import { collectDefaultMetrics, register } from 'prom-client';
import { ConfigService } from '@nestjs/config';
import { getFrontendOrigins } from './common/config/origins';

let metricsInitialized = false;

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  if (!metricsInitialized) {
    collectDefaultMetrics();
    metricsInitialized = true;
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const allowedOrigins = getFrontendOrigins(app.get(ConfigService));

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useWebSocketAdapter(new IoAdapter(app));

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ProctoLearn API')
      .setDescription('Онлайн оқыту платформасы API құжаттамасы')
      .setVersion('1.0')
      .addCookieAuth('pl-access')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Lightweight health check endpoint (used by Docker healthcheck)
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: any, res: any) => res.status(200).json({ status: 'ok' }));
  httpAdapter.get('/metrics', async (_req: any, res: any) => {
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
  });

  const port = process.env.API_PORT || 4000;
  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(`🚀 ProctoLearn API is running on: http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
