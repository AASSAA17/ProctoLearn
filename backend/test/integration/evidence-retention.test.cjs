const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { ConfigService } = require('@nestjs/config');
const { recordingFixture } = require('./recording-fixture.cjs');
const { EvidenceRetentionService } = require('../../src/evidence/evidence-retention.service');
const { CertificatesService } = require('../../src/certificates/certificates.service');
const { ProctorService } = require('../../src/proctor/proctor.service');
const old = new Date(Date.now() - 90 * 86_400_000);

test('retention durable tombstones, policy transitions and hold races on PostgreSQL', async (t) => {
  const f = await recordingFixture();
  const service = new EvidenceRetentionService(f.db, f.storage, new ConfigService({ EVIDENCE_RETENTION_DAYS: '30' }));
  const fixture = async (data = {}) => {
    const attempt = await f.newAttempt({ status: 'FINISHED', finishedAt: old, reviewStatus: 'APPROVED', reviewedAt: old, ...data });
    const key = `recordings/${attempt.id}/camera-${randomUUID()}.webm`;
    f.storage.objects.set(key, Buffer.from('fixture only'));
    const file = await f.db.evidenceFile.create({ data: { attemptId: attempt.id, type: 'recording_camera', url: key, createdAt: old } });
    return { attempt, file, key };
  };
  const admin = { id: f.teacherId, role: 'ADMIN' };
  try {
    await t.test('dry run leaves files, audit, jobs and storage unchanged', async () => {
      const x = await fixture();
      const result = await service.run({ attemptId: x.attempt.id });
      assert.equal(result.results[0].state, 'WOULD_DELETE');
      assert.equal(await f.db.evidenceDeletionJob.count({ where: { evidenceId: x.file.id } }), 0);
      assert.equal(await f.db.auditEvent.count({ where: { targetId: x.file.id } }), 0);
      assert.ok(f.storage.objects.has(x.key));
    });
    await t.test('storage failure keeps durable metadata; retry deletes exactly once and preserves decisions', async () => {
      const x = await fixture();
      const broken = { ...f.storage, removeObject: async () => { throw new Error('secret storage diagnostic'); } };
      const result = await new EvidenceRetentionService(f.db, broken, new ConfigService({ EVIDENCE_RETENTION_DAYS: '30' })).run({ apply: true, attemptId: x.attempt.id });
      assert.equal(result.results[0].state, 'RETRY');
      const pending = await f.db.evidenceFile.findUnique({ where: { id: x.file.id }, include: { deletionJob: true } });
      assert.ok(pending.deletionRequestedAt); assert.equal(pending.deletedAt, null); assert.equal(pending.url, x.key);
      assert.equal(pending.deletionJob.lastError, 'STORAGE_OR_DATABASE_FAILURE');
      assert.ok(pending.deletionJob.leaseToken);
      assert.equal((await service.run({ apply: true, attemptId: x.attempt.id })).results[0].state, 'PROTECTED_OR_BUSY');
      await f.db.evidenceDeletionJob.update({ where: { evidenceId: x.file.id }, data: { leaseUntil: new Date(0) } });
      assert.equal((await service.run({ apply: true, attemptId: x.attempt.id })).results[0].state, 'DELETED');
      assert.ok(!f.storage.objects.has(x.key));
      assert.equal((await f.db.attempt.findUnique({ where: { id: x.attempt.id } })).reviewStatus, 'APPROVED');
      assert.equal((await service.run({ apply: true, attemptId: x.attempt.id })).scanned, 0);
      assert.equal(await f.db.auditEvent.count({ where: { targetId: x.file.id, action: 'EVIDENCE_RETENTION_DELETED' } }), 1);
    });
    await t.test('a hold cancels an undispatched tombstone and prevents deletion', async () => {
      const x = await fixture();
      await service.request(x.file.id, 30);
      await service.setHold(x.attempt.id, admin, true, 'Investigation in progress');
      assert.equal((await service.run({ apply: true, attemptId: x.attempt.id })).results[0].state, 'LEGAL_HOLD');
      assert.equal((await f.db.evidenceFile.findUnique({ where: { id: x.file.id } })).deletionRequestedAt, null);
      assert.equal(await f.db.evidenceDeletionJob.count({ where: { evidenceId: x.file.id } }), 0);
      assert.ok(f.storage.objects.has(x.key));
      await service.setHold(x.attempt.id, admin, false, 'Investigation completed');
      assert.equal((await service.run({ apply: true, attemptId: x.attempt.id })).results[0].state, 'DELETED');
    });
    await t.test('concurrent hold after deletion dispatch returns conflict, never false preservation', async () => {
      const x = await fixture();
      let release; let started;
      const gate = new Promise((resolve) => { release = resolve; });
      const entered = new Promise((resolve) => { started = resolve; });
      const delayed = { ...f.storage, removeObject: async (key) => { started(); await gate; await f.storage.removeObject(key); } };
      const running = new EvidenceRetentionService(f.db, delayed, new ConfigService({ EVIDENCE_RETENTION_DAYS: '30' })).run({ apply: true, attemptId: x.attempt.id });
      await entered;
      try { await assert.rejects(service.setHold(x.attempt.id, admin, true, 'Concurrent investigation'), (error) => error.getResponse?.().code === 'RETENTION_ALREADY_STARTED'); }
      finally { release(); }
      assert.equal((await running).results[0].state, 'DELETED');
      assert.equal((await f.db.attempt.findUnique({ where: { id: x.attempt.id } })).evidenceLegalHold, false);
    });
    await t.test('concurrent appeal creation on rejected attempts preserves all evidence', async () => {
      const x = await fixture({ reviewStatus: 'REJECTED' });
      const proctor = new ProctorService(f.db, new CertificatesService(f.db));
      const [result] = await Promise.all([service.run({ apply: true, attemptId: x.attempt.id }), proctor.createAppeal(x.attempt.id, { id: f.studentId, role: 'STUDENT' }, { reason: 'Please review recording again' })]);
      assert.ok(['APPEAL_POSSIBLE', 'OPEN_APPEAL'].includes(result.results[0].state));
      assert.ok(f.storage.objects.has(x.key));
      assert.equal(await f.db.evidenceDeletionJob.count({ where: { evidenceId: x.file.id } }), 0);
    });
    await t.test('new certificate issuance cannot rely on deleted evidence', async () => {
      const x = await fixture({ score: 100 });
      const exam = await f.db.exam.findUnique({ where: { id: x.attempt.examId } });
      await f.db.attempt.update({ where: { id: x.attempt.id }, data: { examSnapshot: { courseId: exam.courseId, passScore: 60 } } });
      await f.db.evidenceFile.create({ data: { attemptId: x.attempt.id, type: 'recording_screen', url: `recordings/${x.attempt.id}/screen.webm`, createdAt: old } });
      await service.run({ apply: true, attemptId: x.attempt.id });
      await assert.rejects(new CertificatesService(f.db).issueForAttempt(x.attempt.id), (error) => error.getStatus?.() === 409);
      assert.equal(await f.db.certificate.count({ where: { userId: f.studentId, courseId: exam.courseId } }), 0);
    });
    await t.test('expired deletion lease is reclaimed and concurrent workers publish only one deletion event', async () => {
      const x = await fixture();
      await service.request(x.file.id, 30);
      await f.db.evidenceDeletionJob.update({ where: { evidenceId: x.file.id }, data: { state: 'RUNNING', attempts: 1, leaseToken: randomUUID(), leaseUntil: new Date(0) } });
      await Promise.all([service.run({ apply: true, attemptId: x.attempt.id }), service.run({ apply: true, attemptId: x.attempt.id })]);
      const job = await f.db.evidenceDeletionJob.findUnique({ where: { evidenceId: x.file.id } });
      assert.equal(job.state, 'DONE'); assert.equal(job.attempts, 2);
      assert.equal(f.storage.removed.filter((key) => key === x.key).length, 1);
      assert.equal(await f.db.auditEvent.count({ where: { targetId: x.file.id, action: 'EVIDENCE_RETENTION_DELETED' } }), 1);
    });
    await t.test('existing certificate remains valid after media deletion', async () => {
      const x = await fixture();
      const exam = await f.db.exam.findUnique({ where: { id: x.attempt.examId } });
      const certificate = await f.db.certificate.create({ data: { userId: f.studentId, courseId: exam.courseId, qrCode: randomUUID(), issuedVia: 'PROCTORED_EXAM' } });
      try {
        await service.run({ apply: true, attemptId: x.attempt.id });
        assert.equal((await new CertificatesService(f.db).verify(certificate.qrCode)).valid, true);
        assert.ok(await f.db.certificate.findUnique({ where: { id: certificate.id } }));
      } finally { await f.db.certificate.delete({ where: { id: certificate.id } }); }
    });
    await t.test('operator backup advisory lock blocks deletion admission until released', async () => {
      const x = await fixture();
      let release; let locked;
      const gate = new Promise((resolve) => { release = resolve; });
      const entered = new Promise((resolve) => { locked = resolve; });
      const backup = f.db.$transaction(async (tx) => { await tx.$executeRaw`SELECT pg_advisory_xact_lock(71083208::bigint)`; locked(); await gate; });
      await entered;
      const running = service.run({ apply: true, attemptId: x.attempt.id });
      try {
        await new Promise((resolve) => setTimeout(resolve, 80));
        assert.ok(f.storage.objects.has(x.key));
        assert.equal(await f.db.evidenceDeletionJob.count({ where: { evidenceId: x.file.id } }), 0);
      } finally { release(); await backup; }
      assert.equal((await running).results[0].state, 'DELETED');
    });
    await t.test('bounded pages use stable cursors and can traverse protected entries', async () => {
      const x = await fixture({ evidenceLegalHold: true });
      for (let index = 0; index < 2; index++) await f.db.evidenceFile.create({ data: { attemptId: x.attempt.id, type: 'recording_screen', url: `recordings/${x.attempt.id}/${index}.webm`, createdAt: old } });
      const seen = [];
      let cursor;
      do {
        const page = await service.run({ attemptId: x.attempt.id, limit: 1, cursor });
        seen.push(...page.results.map((entry) => entry.id));
        cursor = page.nextCursor;
      } while (cursor);
      assert.equal(seen.length, 3); assert.equal(new Set(seen).size, 3);
    });
    await t.test('staged copies must be cleaned before finalized media can be deleted', async () => {
      const x = await fixture();
      const upload = await f.db.recordingUpload.create({ data: { attemptId: x.attempt.id, kind: 'camera', clientSessionId: randomUUID(), mimeType: 'video/webm', state: 'COMPLETE', bytes: 3, expectedChunks: 1, evidenceId: x.file.id, expiresAt: old } });
      const chunkKey = `staging/${x.attempt.id}/${upload.id}/0/${randomUUID()}`;
      f.storage.objects.set(chunkKey, Buffer.from('abc'));
      await f.db.recordingChunk.create({ data: { uploadId: upload.id, index: 0, size: 3, sha256: 'fixture', objectKey: chunkKey } });
      assert.equal((await service.run({ apply: true, attemptId: x.attempt.id })).results[0].state, 'STAGED_CHUNKS_REMAIN');
      assert.ok(f.storage.objects.has(x.key));
      // Scoped equivalent of the pre-existing staged cleanup's successful operations.
      await f.storage.removeObject(chunkKey);
      await f.db.recordingChunk.deleteMany({ where: { uploadId: upload.id } });
      assert.equal((await service.run({ apply: true, attemptId: x.attempt.id })).results[0].state, 'DELETED');
    });
    await t.test('late transaction completion after transport failure keeps its lease and publishes once', async () => {
      const x = await fixture();
      let release; let entered; let lateTransaction;
      const gate = new Promise((resolve) => { release = resolve; });
      const ready = new Promise((resolve) => { entered = resolve; });
      const delayedStorage = { ...f.storage, removeObject: async (key) => { entered(); await gate; await f.storage.removeObject(key); } };
      const delayedDb = new Proxy(f.db, { get(target, key) {
        if (key !== '$transaction') return target[key];
        return (work, options) => {
          if (options?.timeout !== 45000) return target.$transaction(work, options);
          lateTransaction = target.$transaction(work, options);
          void lateTransaction.catch(() => {});
          return ready.then(() => { throw new Error('Transport failed before the database transaction finished'); });
        };
      } });
      try {
        const result = await new EvidenceRetentionService(delayedDb, delayedStorage, new ConfigService({ EVIDENCE_RETENTION_DAYS: '30' })).run({ apply: true, attemptId: x.attempt.id });
        assert.equal(result.results[0].state, 'RETRY');
        const pending = await f.db.evidenceDeletionJob.findUnique({ where: { evidenceId: x.file.id } });
        assert.equal(pending.state, 'RETRY'); assert.ok(pending.leaseToken); assert.ok(pending.leaseUntil > new Date());
        assert.ok(f.storage.objects.has(x.key));
        release(); await lateTransaction;
        assert.equal((await f.db.evidenceDeletionJob.findUnique({ where: { evidenceId: x.file.id } })).state, 'DONE');
        assert.equal(await f.db.auditEvent.count({ where: { targetId: x.file.id, action: 'EVIDENCE_RETENTION_DELETED' } }), 1);
        assert.ok((await f.db.evidenceFile.findUnique({ where: { id: x.file.id } })).deletedAt);
        assert.equal((await service.run({ apply: true, attemptId: x.attempt.id })).scanned, 0);
      } finally { release(); if (lateTransaction) await lateTransaction; }
    });
  } finally {
    const ids = (await f.db.attempt.findMany({ where: { userId: f.studentId }, select: { id: true } })).map((item) => item.id);
    const files = (await f.db.evidenceFile.findMany({ where: { attemptId: { in: ids } }, select: { id: true } })).map((item) => item.id);
    await f.db.auditEvent.deleteMany({ where: { targetId: { in: [...ids, ...files] } } });
    await f.db.userNotification.deleteMany({ where: { userId: { in: [f.studentId, f.teacherId, f.otherId] } } });
    await f.close();
  }
});
