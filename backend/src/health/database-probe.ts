import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

/** Keep short probe deadlines separate from normal exam/review transactions. */
@Injectable()
export class DatabaseProbe implements OnModuleDestroy {
  private readonly client: PrismaClient;

  constructor(config: ConfigService) {
    const url = new URL(config.getOrThrow<string>('DATABASE_URL'));
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('connect_timeout', '1');
    url.searchParams.set('pool_timeout', '1');
    url.searchParams.set('socket_timeout', '1');
    url.searchParams.set('options', `${url.searchParams.get('options') || ''} -c statement_timeout=1000`.trim());
    url.searchParams.set('application_name', 'proctolearn_readiness');
    this.client = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  }

  async probe(): Promise<void> {
    // The driver enforces connection/pool/query deadlines and cancels timed-out
    // work; a Promise.race alone would leave a hanging query behind.
    await this.client.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
