const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readdir, access, readFile } = require('node:fs/promises');
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ValidationPipe, ForbiddenException, BadRequestException } = require('@nestjs/common');
const { EvidenceController, RECORDING_DIRECTORY } = require('../src/evidence/evidence.controller');
const { EvidenceRetentionService } = require('../src/evidence/evidence-retention.service');
const { EvidenceService } = require('../src/evidence/evidence.service');
const { RecordingUploadsService } = require('../src/evidence/recording-uploads.service');
const { JwtAuthGuard } = require('../src/common/guards/jwt-auth.guard');
const { CreateRecordingUploadDto, CompleteRecordingUploadDto } = require('../src/evidence/recording-upload.dto');
const { assertRecordingWindow, normalizeRecordingMime, recordingManifest, recordingByteLimit, ATTEMPT_BYTE_LIMIT, APPEAL_BYTE_LIMIT, CHUNK_LIMIT } = require('../src/evidence/recording-upload-policy');

test('recording policy normalizes codecs and freezes reviewed or expired attempts', () => {
  assert.equal(normalizeRecordingMime('video/webm;codecs=vp8,opus'), 'video/webm');
  assert.throws(() => normalizeRecordingMime('text/html'), BadRequestException);
  const base = { startedAt: new Date(), exam: { duration: 30 }, reviewStatus: 'PENDING', finishedAt: new Date() };
  assert.doesNotThrow(() => assertRecordingWindow(base));
  assert.throws(() => assertRecordingWindow({ ...base, reviewStatus: 'APPROVED' }), (error) => error.getResponse().code === 'REVIEW_LOCKED');
  assert.throws(() => assertRecordingWindow({ ...base, finishedAt: new Date(0) }), (error) => error.getResponse().code === 'UPLOAD_EXPIRED');
  assert.doesNotThrow(() => assertRecordingWindow({ ...base, reviewStatus: 'REJECTED', finishedAt: new Date(0), appeal: { state: 'OPEN', createdAt: new Date() } }));
  assert.equal(recordingByteLimit(base), ATTEMPT_BYTE_LIMIT);
  assert.equal(recordingByteLimit({ ...base, appeal: { state: 'OPEN' } }), ATTEMPT_BYTE_LIMIT);
  assert.equal(recordingByteLimit({ ...base, reviewStatus: 'REJECTED', appeal: { state: 'OPEN' } }), APPEAL_BYTE_LIMIT);
  assert.equal(recordingByteLimit({ ...base, reviewStatus: 'REJECTED', appeal: { state: 'UPHELD' } }), ATTEMPT_BYTE_LIMIT);
});

test('recording DTOs bound manifest input and omit internal storage and lease metadata', async () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
  await pipe.transform({ kind: 'screen', clientSessionId: randomUUID(), mimeType: 'video/webm' }, { type: 'body', metatype: CreateRecordingUploadDto });
  for (const payload of [{ expectedChunks: 0 }, { expectedChunks: 8193 }, { expectedChunks: 1, interrupted: 'true' }, { expectedChunks: 1, objectKey: 'injected' }]) await assert.rejects(pipe.transform(payload, { type: 'body', metatype: CompleteRecordingUploadDto }), BadRequestException);
  const manifest = recordingManifest({ id: 'upload', finalizeToken: 'private-token', chunks: [{ index: 0, sha256: 'hash', size: 1, objectKey: 'private-key' }] });
  assert.equal(JSON.stringify(manifest).includes('private'), false);
});

test('HTTP chunk transport authorizes before parsing, caps disk writes, cleans temporary files and disables whole-video writes', async () => {
  const stored = [];
  const uploads = {
    assertWritableUpload: async (id) => { if (id !== 'own') throw new ForbiddenException(); },
    putChunk: async (_id, index, path) => { stored.push(path); return { index, bytes: (await readFile(path)).length }; },
  };
  const module = await Test.createTestingModule({
    controllers: [EvidenceController],
    providers: [
      { provide: EvidenceService, useValue: { assertOwner: async (id) => { if (id !== 'own') throw new ForbiddenException(); } } },
      { provide: RecordingUploadsService, useValue: uploads },
      { provide: EvidenceRetentionService, useValue: {} },
    ],
  }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context) { context.switchToHttp().getRequest().user = { id: 'student' }; return true; } }).compile();
  const app = module.createNestApplication({ logger: false });
  try {
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
    const origin = await app.getUrl();
    const before = new Set(await readdir(RECORDING_DIRECTORY));
    const send = async (route, bytes, method = 'PUT') => {
      const form = new FormData();
      form.append('file', new Blob([Buffer.alloc(bytes, 7)], { type: 'application/octet-stream' }), 'chunk');
      return fetch(`${origin}/evidence/${route}`, { method, body: form });
    };
    assert.equal((await send('uploads/foreign/chunks/0', 100)).status, 403);
    assert.equal((await send('uploads/own/chunks/8192', 100)).status, 400);
    assert.equal((await send('uploads/own/chunks/0', 100)).status, 200);
    assert.equal((await send('uploads/own/chunks/1', CHUNK_LIMIT + 1)).status, 413);
    assert.equal((await send('own/recording', 100, 'POST')).status, 410);
    assert.equal(stored.length, 1);
    await assert.rejects(access(stored[0]), { code: 'ENOENT' });
    assert.deepEqual(new Set(await readdir(RECORDING_DIRECTORY)), before);
  } finally { await app.close(); }
});
