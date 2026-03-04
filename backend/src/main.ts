import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as path from 'path';
import * as fs from 'fs';

function checkEnv() {
  const logger = new Logger('Bootstrap');
  const REQUIRED = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
  const INSECURE_DEFAULTS: Record<string, string> = {
    JWT_ACCESS_SECRET: 'access_secret',
    JWT_REFRESH_SECRET: 'refresh_secret',
  };
  for (const key of REQUIRED) {
    if (!process.env[key]) {
      logger.error(`⛔  Missing env var ${key} — server will use an INSECURE default!`);
    } else if (process.env[key] === INSECURE_DEFAULTS[key]) {
      logger.warn(`⚠️  ${key} is set to the insecure default value — change it in production!`);
    }
  }
}

async function bootstrap() {
  checkEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Serve uploaded recordings statically
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: '/uploads' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const allowedOrigins = [
    'http://localhost:3000',
    ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3001'] : []),
    ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map((s) => s.trim()) : []),
  ].filter(Boolean);

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
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  // Lightweight health check endpoint (used by Docker healthcheck)
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: any, res: any) => res.status(200).json({ status: 'ok' }));

  const port = process.env.API_PORT || 4000;
  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(`🚀 ProctoLearn API is running on: http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
