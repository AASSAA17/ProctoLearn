import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { EvidenceRetentionService } from './evidence-retention.service';
import { retentionDays } from './evidence-retention-policy';

async function main() {
  const options: { apply?: boolean; cursor?: string; attemptId?: string; limit?: number } = {};
  for (const argument of process.argv.slice(2)) {
    if (argument === '--apply') { options.apply = true; continue; }
    const match = /^--(cursor|attempt-id|limit)=([a-zA-Z0-9-]+)$/.exec(argument);
    if (!match) throw new Error('Usage: evidence:retention [--apply] [--cursor=UUID] [--attempt-id=UUID] [--limit=100]');
    if (match[1] === 'limit') options.limit = Number(match[2]);
    else if (match[1] === 'attempt-id') options.attemptId = match[2];
    else options.cursor = match[2];
  }
  const config = new ConfigService(process.env);
  if (retentionDays(config.get('EVIDENCE_RETENTION_DAYS')) === null) {
    process.stdout.write(`${JSON.stringify({ enabled: false, apply: options.apply === true, scanned: 0, results: [], nextCursor: null })}\n`);
    return;
  }
  const db = new PrismaService();
  const storage = new MinioService(config);
  try {
    const result = await new EvidenceRetentionService(db, storage, config).run(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.results.some((entry) => ['RETRY', 'PROTECTED_OR_BUSY'].includes(entry.state))) process.exitCode = 2;
  }
  finally { storage.onModuleDestroy(); await db.$disconnect(); }
}

void main().catch(() => { process.stderr.write('Evidence retention failed; check configuration, database and storage availability.\n'); process.exitCode = 1; });
