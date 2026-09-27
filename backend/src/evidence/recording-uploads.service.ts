import { BadRequestException, ConflictException, ForbiddenException, GoneException, HttpException, Injectable, Logger, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { createReadStream, createWriteStream } from 'fs';
import { lstat, mkdir, readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { PrismaService } from '../prisma/prisma.service';
import { serializable } from '../prisma/serializable';
import { MinioService } from '../minio/minio.service';
import { recordingFormat } from './recording-format';
import { CompleteRecordingUploadDto, CreateRecordingUploadDto } from './recording-upload.dto';
import { assertRecordingWindow, ATTEMPT_BYTE_LIMIT, CHUNK_COUNT_LIMIT, CHUNK_LIMIT, FINALIZE_LEASE_MS, normalizeRecordingMime, recordingByteLimit, recordingDeadline, recordingManifest, SESSION_LIMIT, UPLOAD_GRACE_MS } from './recording-upload-policy';

type Db = Prisma.TransactionClient;
const attemptInclude = { exam: { select: { duration: true } }, appeal: true } as const;
const uploadInclude = { attempt: { include: attemptInclude }, chunks: { orderBy: { index: 'asc' as const } } } as const;
const ASSEMBLY_DIRECTORY = join(tmpdir(), 'proctolearn-recording-assembly');

@Injectable()
export class RecordingUploadsService {
  private readonly logger = new Logger(RecordingUploadsService.name);
  constructor(private prisma: PrismaService, private minio: MinioService) {}

  private async ownerAttempt(db: Db, attemptId: string, userId: string) {
    const attempt = await db.attempt.findUnique({ where: { id: attemptId }, include: attemptInclude });
    if (!attempt) throw new NotFoundException('Талпыныс табылмады');
    if (attempt.userId !== userId) throw new ForbiddenException('Рұқсат жоқ');
    return attempt;
  }

  private async ownedUpload(db: Db, id: string, userId: string) {
    const upload = await db.recordingUpload.findUnique({ where: { id }, include: uploadInclude });
    if (!upload) throw new NotFoundException('Жүктеу табылмады');
    if (upload.attempt.userId !== userId) throw new ForbiddenException('Рұқсат жоқ');
    return upload;
  }

  private assertOpen(upload: any) {
    assertRecordingWindow(upload.attempt);
    if (Date.now() > upload.expiresAt.getTime()) throw new GoneException({ code: 'UPLOAD_EXPIRED', message: 'Жүктеу мерзімі аяқталды' });
    if (upload.state !== 'OPEN') throw new ConflictException({ code: upload.state === 'FINALIZING' ? 'UPLOAD_FINALIZING' : 'UPLOAD_CLOSED', message: 'Жүктеу жабық немесе жинақталуда' });
  }

  async assertWritableUpload(id: string, userId: string) {
    const upload = await this.ownedUpload(this.prisma, id, userId);
    this.assertOpen(upload);
    return upload;
  }

  async create(attemptId: string, dto: CreateRecordingUploadDto, userId: string) {
    const mimeType = normalizeRecordingMime(dto.mimeType);
    const result = await serializable(this.prisma, async (db) => {
      const attempt = await this.ownerAttempt(db, attemptId, userId);
      const existing = await db.recordingUpload.findUnique({ where: { attemptId_kind_clientSessionId: { attemptId, kind: dto.kind, clientSessionId: dto.clientSessionId } }, include: uploadInclude });
      if (existing) {
        if (existing.mimeType !== mimeType) throw new ConflictException({ code: 'UPLOAD_CONFLICT', message: 'Жазба түрі өзгертілген' });
        if (existing.state === 'OPEN' && existing.expiresAt.getTime() < Date.now()) {
          const expiresAt = assertRecordingWindow(attempt);
          if (attempt.appeal?.state === 'OPEN' && attempt.reviewStatus === 'REJECTED') {
            await db.recordingUpload.update({ where: { id: existing.id }, data: { expiresAt } });
            return { ...existing, expiresAt };
          }
        }
        return existing;
      }
      const expiresAt = assertRecordingWindow(attempt);
      if (await db.recordingUpload.count({ where: { attemptId } }) >= SESSION_LIMIT) throw new ConflictException({ code: 'SESSION_LIMIT', message: 'Жазба сессияларының шегі орындалды' });
      return db.recordingUpload.create({ data: { attemptId, kind: dto.kind, clientSessionId: dto.clientSessionId, mimeType, expiresAt }, include: uploadInclude });
    });
    return recordingManifest(result);
  }

  async get(id: string, userId: string) {
    return recordingManifest(await this.ownedUpload(this.prisma, id, userId));
  }

  async list(attemptId: string, userId: string) {
    await this.ownerAttempt(this.prisma, attemptId, userId);
    const uploads = await this.prisma.recordingUpload.findMany({ where: { attemptId }, include: { chunks: { orderBy: { index: 'asc' } } }, orderBy: { createdAt: 'asc' } });
    return uploads.map(recordingManifest);
  }

  private async hashFile(filePath: string) {
    const info = await stat(filePath);
    if (!info.isFile() || info.size < 1 || info.size > CHUNK_LIMIT) throw new PayloadTooLargeException({ code: 'CHUNK_SIZE', message: 'Бөлік өлшемі 1 байт пен 8 MiB аралығында болуы тиіс' });
    const hash = createHash('sha256');
    let size = 0;
    for await (const part of createReadStream(filePath)) {
      size += part.length;
      if (size > CHUNK_LIMIT) throw new PayloadTooLargeException();
      hash.update(part);
    }
    return { size, sha256: hash.digest('hex') };
  }

  private assertMatchingChunk(chunk: any, hash: { size: number; sha256: string }) {
    if (chunk.size !== hash.size || chunk.sha256 !== hash.sha256) throw new ConflictException({ code: 'CHUNK_CONFLICT', message: 'Бұл нөмірге басқа бөлік сақталған' });
  }

  // Call only after a resolved transaction, a known application rejection, or the orphan age floor.
  // An unreferenced read alone cannot exclude an unknown transaction that commits later.
  private async removeUnreferenced(objectKey: string) {
    try {
      const [chunk, evidence] = await Promise.all([
        this.prisma.recordingChunk.findUnique({ where: { objectKey }, select: { uploadId: true } }),
        this.prisma.evidenceFile.findFirst({ where: { url: objectKey }, select: { id: true } }),
      ]);
      if (!chunk && !evidence) { await this.minio.removeObject(objectKey); return true; }
      return false;
    } catch {
      this.logger.warn('Unreferenced recording object retained for scheduled cleanup');
      return false;
    }
  }

  async putChunk(id: string, index: number, filePath: string, userId: string) {
    if (!Number.isInteger(index) || index < 0 || index >= CHUNK_COUNT_LIMIT) throw new BadRequestException('Бөлік нөмірі жарамсыз');
    const initial = await this.assertWritableUpload(id, userId);
    const hash = await this.hashFile(filePath);
    const existing = initial.chunks.find((chunk) => chunk.index === index);
    if (existing) {
      this.assertMatchingChunk(existing, hash);
      return recordingManifest(initial);
    }
    const objectKey = `staging/${initial.attemptId}/${id}/${index}/${randomUUID()}`;
    let uploaded = false;
    try {
      await this.minio.uploadFile(filePath, objectKey, 'application/octet-stream');
      uploaded = true;
      const result = await serializable(this.prisma, async (db) => {
        const upload = await this.ownedUpload(db, id, userId);
        this.assertOpen(upload);
        const prior = upload.chunks.find((chunk) => chunk.index === index);
        if (prior) { this.assertMatchingChunk(prior, hash); return upload; }
        const aggregate = await db.recordingUpload.aggregate({ where: { attemptId: upload.attemptId }, _sum: { bytes: true } });
        const byteLimit = recordingByteLimit(upload.attempt);
        if ((aggregate._sum.bytes ?? 0) + hash.size > byteLimit) throw new PayloadTooLargeException({
          code: 'RECORDING_QUOTA',
          message: byteLimit === ATTEMPT_BYTE_LIMIT
            ? 'Талпыныс жазбаларының 512 MiB шегі орындалды'
            : 'Апелляцияны қоса есептегендегі барлық жазбалардың 1 GiB шегі орындалды',
        });
        await db.recordingChunk.create({ data: { uploadId: id, index, objectKey, ...hash } });
        return db.recordingUpload.update({ where: { id }, data: { bytes: { increment: hash.size } }, include: uploadInclude });
      });
      if (!result.chunks.some((chunk) => chunk.objectKey === objectKey)) await this.removeUnreferenced(objectKey);
      return recordingManifest(result);
    } catch (error) {
      if (uploaded && error instanceof HttpException && error.getStatus() < 500) {
        await this.removeUnreferenced(objectKey);
      } else {
        // A network/database failure can precede a late commit. The 24h orphan sweep decides later.
        this.logger.warn('Recording chunk object retained after an uncertain write; retry is safe');
      }
      throw error;
    }
  }

  private async renewLease(id: string, token: string) {
    const renewed = await this.prisma.recordingUpload.updateMany({
      where: { id, state: 'FINALIZING', finalizeToken: token },
      data: { finalizeLeaseUntil: new Date(Date.now() + FINALIZE_LEASE_MS) },
    });
    if (renewed.count !== 1) throw new ConflictException({ code: 'UPLOAD_LEASE_LOST', message: 'Жүктеу өзгертілген. Мәртебесін қайта тексеріңіз' });
  }

  private async assemble(upload: any, path: string) {
    const minio = this.minio;
    const byteLimit = recordingByteLimit(upload.attempt);
    async function* content() {
      let total = 0;
      for (const chunk of upload.chunks) {
        const stream = await minio.getObject(chunk.objectKey);
        const hash = createHash('sha256');
        let size = 0;
        try {
          for await (const part of stream) {
            const bytes = Buffer.isBuffer(part) ? part : Buffer.from(part);
            size += bytes.length; total += bytes.length;
            if (size > chunk.size || total > byteLimit) throw new BadRequestException({ code: 'CHUNK_CORRUPT', message: 'Жазба бөлігі бүлінген' });
            hash.update(bytes);
            yield bytes;
          }
        } finally { stream.destroy(); }
        if (size !== chunk.size || hash.digest('hex') !== chunk.sha256) throw new BadRequestException({ code: 'CHUNK_CORRUPT', message: 'Жазба бөлігі бүлінген' });
      }
      if (total !== upload.bytes) throw new BadRequestException({ code: 'CHUNK_CORRUPT', message: 'Жазба өлшемі сәйкес емес' });
    }
    await pipeline(Readable.from(content()), createWriteStream(path, { flags: 'wx', mode: 0o600 }));
  }

  async complete(id: string, dto: CompleteRecordingUploadDto, userId: string) {
    const token = randomUUID();
    const claimed = await serializable(this.prisma, async (db) => {
      const upload = await this.ownedUpload(db, id, userId);
      if (upload.state === 'COMPLETE') {
        if (upload.expectedChunks !== dto.expectedChunks || upload.interrupted !== !!dto.interrupted) throw new ConflictException({ code: 'UPLOAD_CONFLICT', message: 'Жазба бұрын басқа параметрлермен аяқталған' });
        return upload;
      }
      assertRecordingWindow(upload.attempt);
      if (upload.expiresAt.getTime() < Date.now()) throw new GoneException({ code: 'UPLOAD_EXPIRED', message: 'Жүктеу мерзімі аяқталды' });
      if (upload.state === 'ABORTED') throw new ConflictException({ code: 'UPLOAD_CLOSED', message: 'Жүктеу тоқтатылған' });
      if (upload.state === 'FINALIZING' && upload.finalizeLeaseUntil && upload.finalizeLeaseUntil.getTime() > Date.now()) throw new ConflictException({ code: 'UPLOAD_FINALIZING', message: 'Жазба жинақталуда. Қайта тексеріңіз' });
      if (upload.state === 'FINALIZING' && (upload.expectedChunks !== dto.expectedChunks || upload.interrupted !== !!dto.interrupted)) throw new ConflictException({ code: 'UPLOAD_CONFLICT', message: 'Жинақтау параметрлері өзгерген' });
      if (!Number.isInteger(dto.expectedChunks) || dto.expectedChunks < 1 || dto.expectedChunks > CHUNK_COUNT_LIMIT) throw new BadRequestException('Бөліктер саны жарамсыз');
      if (upload.chunks.length !== dto.expectedChunks || upload.chunks.some((chunk, index) => chunk.index !== index)) throw new ConflictException({ code: 'CHUNKS_MISSING', message: 'Жазбаның барлық бөліктерін жүктеңіз' });
      return db.recordingUpload.update({
        where: { id }, data: { state: 'FINALIZING', expectedChunks: dto.expectedChunks, interrupted: !!dto.interrupted, finalizeToken: token, finalizeLeaseUntil: new Date(Date.now() + FINALIZE_LEASE_MS) }, include: uploadInclude,
      });
    });
    if (claimed.state === 'COMPLETE') return recordingManifest(claimed);
    const path = join(ASSEMBLY_DIRECTORY, `assembled-${token}.tmp`);
    let outputKey: string | undefined;
    let renewalError: unknown;
    let pendingRenewal: Promise<void> | undefined;
    const heartbeat = setInterval(() => {
      if (!pendingRenewal) pendingRenewal = this.renewLease(id, token).catch((error) => { renewalError = error; }).finally(() => { pendingRenewal = undefined; });
    }, 30_000);
    heartbeat.unref();
    try {
      await mkdir(ASSEMBLY_DIRECTORY, { recursive: true, mode: 0o700 });
      await this.assemble(claimed, path);
      if (renewalError) throw renewalError;
      const format = await recordingFormat(path, claimed.mimeType);
      outputKey = `recordings/${claimed.attemptId}/${claimed.kind}-${id}-${token}.${format.extension}`;
      await this.renewLease(id, token);
      await this.minio.uploadFile(path, outputKey, format.mime);
      if (pendingRenewal) await pendingRenewal;
      if (renewalError) throw renewalError;
      const result = await serializable(this.prisma, async (db) => {
        const current = await this.ownedUpload(db, id, userId);
        assertRecordingWindow(current.attempt);
        if (current.state !== 'FINALIZING' || current.finalizeToken !== token || !current.finalizeLeaseUntil || current.finalizeLeaseUntil.getTime() < Date.now()) throw new ConflictException({ code: 'UPLOAD_LEASE_LOST', message: 'Жинақтау рұқсаты аяқталған' });
        const evidence = await db.evidenceFile.create({ data: { attemptId: current.attemptId, type: `recording_${current.kind}`, url: outputKey! } });
        return db.recordingUpload.update({ where: { id }, data: { state: 'COMPLETE', evidenceId: evidence.id, finalizeToken: null, finalizeLeaseUntil: null }, include: uploadInclude });
      });
      return recordingManifest(result);
    } catch (error) {
      // A commit may have succeeded despite a transport error. Its evidence object must survive.
      const committed = await this.prisma.recordingUpload.findUnique({ where: { id }, include: uploadInclude }).catch(() => null);
      if (committed?.state === 'COMPLETE') {
        if (committed.expectedChunks !== dto.expectedChunks || committed.interrupted !== !!dto.interrupted) throw new ConflictException({ code: 'UPLOAD_CONFLICT', message: 'Жазба басқа параметрлермен аяқталған' });
        return recordingManifest(committed);
      }
      await this.prisma.recordingUpload.updateMany({ where: { id, state: 'FINALIZING', finalizeToken: token }, data: { state: 'OPEN', expectedChunks: null, finalizeToken: null, finalizeLeaseUntil: null } }).catch(() => undefined);
      // Even a failed lookup/reset is not a rollback confirmation. Retain the uniquely named final
      // object until the age-bounded GC can recheck references and any active finalization token.
      if (outputKey) this.logger.warn('Final recording object retained after an uncertain write; retry is safe');
      throw error;
    } finally {
      clearInterval(heartbeat);
      if (pendingRenewal) await pendingRenewal;
      await unlink(path).catch(() => undefined);
    }
  }

  async abort(id: string, userId: string) {
    const result = await serializable(this.prisma, async (db) => {
      const upload = await this.ownedUpload(db, id, userId);
      if (upload.state === 'ABORTED') return upload;
      assertRecordingWindow(upload.attempt);
      if (upload.state === 'COMPLETE') throw new ConflictException({ code: 'UPLOAD_CLOSED', message: 'Аяқталған жазбаны жоюға болмайды' });
      return db.recordingUpload.update({ where: { id }, data: { state: 'ABORTED', finalizeToken: null, finalizeLeaseUntil: null }, include: uploadInclude });
    });
    return recordingManifest(result);
  }

  /** Operator-only, dry-run by default; never deletes evidence objects or referenced live chunks. */
  async cleanupStaged(apply = false, limit = 100, cursors: { uploads?: string; staging?: string; finals?: string } = {}) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - UPLOAD_GRACE_MS);
    const uploads = await this.prisma.recordingUpload.findMany({
      where: { ...(cursors.uploads ? { id: { gt: cursors.uploads } } : {}), OR: [{ state: 'ABORTED', chunks: { some: {} } }, { state: 'COMPLETE', expiresAt: { lt: now }, chunks: { some: {} } }, { expiresAt: { lt: now }, OR: [{ state: 'OPEN' }, { state: 'FINALIZING', finalizeLeaseUntil: { lt: now } }] }] },
      include: uploadInclude, orderBy: { id: 'asc' }, take: Math.min(1000, Math.max(1, limit)),
    });
    const report: { action: string; uploadId?: string; objectCount: number; applied: boolean }[] = [];
    for (const upload of uploads) {
      let eligible = true;
      if (['OPEN', 'FINALIZING'].includes(upload.state) && upload.attempt.reviewStatus === 'REJECTED' && upload.attempt.appeal?.state === 'OPEN' && recordingDeadline(upload.attempt) > now) {
        report.push({ action: 'retain-during-appeal-window', uploadId: upload.id, objectCount: upload.chunks.length, applied: false });
        continue;
      }
      if (apply && !['COMPLETE', 'ABORTED'].includes(upload.state)) {
        const closed = await this.prisma.recordingUpload.updateMany({
          where: { id: upload.id, expiresAt: { lt: now }, OR: [{ state: 'OPEN' }, { state: 'FINALIZING', finalizeLeaseUntil: { lt: now } }] },
          data: { state: 'ABORTED', finalizeToken: null, finalizeLeaseUntil: null },
        });
        eligible = closed.count === 1;
      }
      if (apply && eligible) {
        for (const chunk of upload.chunks) await this.minio.removeObject(chunk.objectKey);
        await this.prisma.recordingChunk.deleteMany({ where: { uploadId: upload.id, upload: { state: { in: ['COMPLETE', 'ABORTED'] } } } });
      }
      report.push({ action: 'remove-staged-chunks', uploadId: upload.id, objectCount: upload.chunks.length, applied: apply && eligible });
    }
    // Crash orphans are uniquely named request objects. A 24h age floor excludes in-flight writes.
    const candidates = await this.minio.listObjects('staging/', Math.min(1000, Math.max(1, limit)), cursors.staging);
    for (const object of candidates) {
      if (!/^staging\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/\d+\/[0-9a-f-]{36}$/i.test(object.name) || !object.lastModified || object.lastModified >= cutoff) continue;
      if (await this.prisma.recordingChunk.findUnique({ where: { objectKey: object.name } })) continue;
      const applied = apply ? await this.removeUnreferenced(object.name) : false;
      report.push({ action: 'remove-orphan-staging-object', objectCount: 1, applied });
    }
    const finals = await this.minio.listObjects('recordings/', Math.min(1000, Math.max(1, limit)), cursors.finals);
    for (const object of finals) {
      const match = /^recordings\/[0-9a-f-]{36}\/(?:camera|screen)-([0-9a-f-]{36})-([0-9a-f-]{36})\.(?:webm|mp4|mkv|ogv)$/i.exec(object.name);
      if (!match || !object.lastModified || object.lastModified >= cutoff) continue;
      const upload = await this.prisma.recordingUpload.findUnique({ where: { id: match[1] } });
      if (upload?.state === 'FINALIZING' && upload.finalizeToken === match[2]) continue;
      if (await this.prisma.evidenceFile.findFirst({ where: { url: object.name } })) continue;
      const applied = apply ? await this.removeUnreferenced(object.name) : false;
      report.push({ action: 'remove-orphan-final-object', objectCount: 1, applied });
    }
    // Only age-bounded files in the two private staging folders, never recursive directory removal.
    for (const [directory, pattern] of [
      [ASSEMBLY_DIRECTORY, /^assembled-[0-9a-f-]{36}\.tmp$/i],
      [join(tmpdir(), 'proctolearn-recording-chunks'), /^[0-9a-f]{32}$/i],
    ] as const) {
      const files = await readdir(directory).catch(() => [] as string[]);
      for (const filename of files.slice(0, Math.min(1000, Math.max(1, limit)))) {
        if (!pattern.test(filename)) continue;
        const path = join(directory, filename);
        const info = await lstat(path).catch(() => null);
        if (!info?.isFile() || info.isSymbolicLink() || info.mtime >= cutoff) continue;
        if (apply) await unlink(path);
        report.push({ action: 'remove-stale-local-temp', objectCount: 1, applied: apply });
      }
    }
    const pageSize = Math.min(1000, Math.max(1, limit));
    return { dryRun: !apply, actions: report, continuation: {
      uploads: uploads.length === pageSize ? uploads.at(-1)!.id : null,
      staging: candidates.length === pageSize ? candidates.at(-1)!.name : null,
      finals: finals.length === pageSize ? finals.at(-1)!.name : null,
    } };
  }
}
