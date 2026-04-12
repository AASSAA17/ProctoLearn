import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import StatsDClient, { StatsD as StatsDType } from 'hot-shots';

@Injectable()
export class GraphiteService implements OnModuleDestroy {
  private readonly logger = new Logger(GraphiteService.name);
  private readonly enabled: boolean;
  private readonly client?: StatsDType;

  constructor() {
    this.enabled = process.env.GRAPHITE_ENABLED !== 'false';

    if (!this.enabled) {
      this.logger.log('Graphite metrics are disabled by GRAPHITE_ENABLED=false');
      return;
    }

    const host = process.env.GRAPHITE_HOST || 'host.docker.internal';
    const port = Number(process.env.GRAPHITE_PORT || '8125');
    const prefix = process.env.GRAPHITE_PREFIX || 'proctolearn.';

    this.client = new StatsDClient({
      host,
      port,
      prefix,
      protocol: 'udp',
      errorHandler: (error) => {
        this.logger.warn(`Graphite send error: ${error.message}`);
      },
    });

    this.logger.log(`Graphite metrics enabled: ${host}:${port}, prefix=${prefix}`);
  }

  increment(metric: string, value = 1): void {
    if (!this.client) return;
    this.client.increment(metric, value);
  }

  timing(metric: string, valueMs: number): void {
    if (!this.client) return;
    this.client.timing(metric, valueMs);
  }

  onModuleDestroy(): void {
    this.client?.close();
  }
}
