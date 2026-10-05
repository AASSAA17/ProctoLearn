import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

export const MAX_PROCTOR_EVENTS = 5000;
export const PROCTOR_EVENTS_PER_MINUTE = 60;
export const PROCTOR_METADATA_BYTES = 2048;

export function eventLimitError() {
  return new HttpException({ code: 'PROCTOR_EVENT_LIMIT', message: 'Прокторинг оқиғаларының шегі асып кетті' }, HttpStatus.TOO_MANY_REQUESTS);
}

export function validateEventMetadata(metadata: unknown) {
  if (metadata === undefined) return;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new BadRequestException({ code: 'PROCTOR_METADATA_INVALID', message: 'Оқиға мәліметтері жарамсыз' });
  }
  try {
    if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > PROCTOR_METADATA_BYTES) throw new Error('Too large');
  } catch {
    throw new BadRequestException({ code: 'PROCTOR_METADATA_INVALID', message: 'Оқиға мәліметтері тым үлкен немесе жарамсыз' });
  }
}

// Shared by all sockets on this gateway, never keyed by socket ID. This protects
// database reads locally; the transactional service limits protect persisted
// volume across replicas and process restarts. Idle entries and memory are bounded.
export class ProctorEventLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>();
  private nextCleanup = 0;

  consume(userId: string, now = Date.now()) {
    if (now >= this.nextCleanup) {
      for (const [key, bucket] of this.buckets) {
        if (now - bucket.at >= 60_000) this.buckets.delete(key);
      }
      this.nextCleanup = now + 60_000;
    }
    const previous = this.buckets.get(userId);
    if (!previous && this.buckets.size >= 10_000) throw eventLimitError();
    const tokens = previous ? Math.min(10, previous.tokens + Math.max(0, now - previous.at) / 1000) : 10;
    if (tokens < 1) throw eventLimitError();
    this.buckets.set(userId, { tokens: tokens - 1, at: now });
  }
}
