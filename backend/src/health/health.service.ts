import { Injectable } from '@nestjs/common';
import { DatabaseProbe } from './database-probe';
import { MinioService } from '../minio/minio.service';

export type Readiness = {
  status: 'ready' | 'not_ready';
  dependencies: { database: 'up' | 'down'; storage: 'up' | 'down' };
};

@Injectable()
export class HealthService {
  private pending: Promise<Readiness> | null = null;
  private cached: Readiness | null = null;
  private checkedAt = 0;

  constructor(private readonly database: DatabaseProbe, private readonly storage: MinioService) {}

  readiness(): Promise<Readiness> {
    if (this.pending) return this.pending;
    if (this.cached && Date.now() - this.checkedAt < 2000) return Promise.resolve(this.cached);
    this.pending = this.check().then((result) => {
      this.cached = result;
      this.checkedAt = Date.now();
      return result;
    }).finally(() => { this.pending = null; });
    return this.pending;
  }

  private async check(): Promise<Readiness> {
    // Both providers own genuine transport/driver deadlines. Coalescing also
    // prevents health polling from exhausting the application connection pool.
    const results = await Promise.allSettled([this.database.probe(), this.storage.storageProbe(2000)]);
    const database = results[0].status === 'fulfilled' ? 'up' : 'down';
    const storage = results[1].status === 'fulfilled' ? 'up' : 'down';
    return { status: database === 'up' && storage === 'up' ? 'ready' : 'not_ready', dependencies: { database, storage } };
  }
}
