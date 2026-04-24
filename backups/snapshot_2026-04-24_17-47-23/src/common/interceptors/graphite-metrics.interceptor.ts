import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { GraphiteService } from '../services/graphite.service';

@Injectable()
export class GraphiteMetricsInterceptor implements NestInterceptor {
  constructor(private readonly graphite: GraphiteService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const startedAt = Date.now();
    const method = this.normalizeSegment((req.method || 'unknown').toLowerCase());
    const route = this.buildRouteMetricName(req);

    this.graphite.increment('api.requests.total');
    this.graphite.increment(`api.requests.${method}.total`);
    this.graphite.increment(`api.requests.${method}.${route}.total`);

    return next.handle().pipe(
      finalize(() => {
        const durationMs = Date.now() - startedAt;
        const statusCode = Number(res?.statusCode || 0);
        const statusClass = Math.floor(statusCode / 100);

        this.graphite.timing('api.latency_ms', durationMs);
        this.graphite.timing(`api.latency_ms.${method}.${route}`, durationMs);

        if (statusClass >= 1 && statusClass <= 5) {
          this.graphite.increment(`api.responses.${statusClass}xx.total`);
        }

        if (statusCode >= 400) {
          this.graphite.increment('api.requests.error.total');
          this.graphite.increment(`api.requests.error.${statusClass}xx.total`);
        }
      }),
    );
  }

  private buildRouteMetricName(req: any): string {
    const baseUrl = req?.baseUrl || '';
    const routePath = req?.route?.path || req?.path || 'unknown';
    const raw = `${baseUrl}${routePath}`;
    const trimmed = String(raw).replace(/^\/+|\/+$/g, '');
    if (!trimmed) return 'root';

    return trimmed
      .split('/')
      .map((segment) => this.normalizeSegment(segment.replace(/^:/, 'param_')))
      .join('.');
  }

  private normalizeSegment(value: string): string {
    const normalized = String(value)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    return normalized || 'unknown';
  }
}
