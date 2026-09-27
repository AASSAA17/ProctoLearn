import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MinioService } from '../minio/minio.service';
import { RecordingUploadsService } from './recording-uploads.service';

// Explicit deployment environment only. No application bootstrap, secret output or bucket creation.
async function main() {
  const arguments_ = process.argv.slice(2);
  const cursors: { uploads?: string; staging?: string; finals?: string } = {};
  for (const argument of arguments_) {
    if (argument === '--apply') continue;
    const match = /^--(uploads|staging|finals)-cursor=(.+)$/.exec(argument);
    if (!match) throw new Error('Usage: recordings:cleanup [--apply] [--uploads-cursor=...] [--staging-cursor=...] [--finals-cursor=...]');
    cursors[match[1]] = match[2];
  }
  const db = new PrismaService();
  try {
    const uploads = new RecordingUploadsService(db, new MinioService(new ConfigService(process.env)));
    process.stdout.write(`${JSON.stringify(await uploads.cleanupStaged(arguments_.includes('--apply'), 100, cursors), null, 2)}\n`);
  } finally { await db.$disconnect(); }
}

void main().catch(() => { process.stderr.write('Recording cleanup failed; inspect service connectivity and permissions.\n'); process.exitCode = 1; });
