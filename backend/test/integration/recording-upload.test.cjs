const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { recordingFixture, webm } = require('./recording-fixture.cjs');
const { RecordingUploadsService } = require('../../src/evidence/recording-uploads.service');
const { ATTEMPT_BYTE_LIMIT, APPEAL_BYTE_LIMIT } = require('../../src/evidence/recording-upload-policy');
const code = (value) => (error) => error.getResponse?.().code === value;

test('PostgreSQL resumable recording transactions with deterministic object storage', async (t) => {
  const f = await recordingFixture();
  try {
    await t.test('session init and chunk retries are idempotent; changed bytes cannot overwrite prior chunks', async () => {
      const attempt = await f.newAttempt();
      const dto = { kind: 'camera', clientSessionId: randomUUID(), mimeType: 'video/webm;codecs=vp8' };
      const first = await f.service.create(attempt.id, dto, f.studentId);
      assert.equal((await f.service.create(attempt.id, dto, f.studentId)).id, first.id);
      await assert.rejects(f.service.create(attempt.id, { ...dto, mimeType: 'video/mp4' }, f.studentId), code('UPLOAD_CONFLICT'));
      const path = await f.file();
      await f.service.putChunk(first.id, 0, path, f.studentId);
      await f.service.putChunk(first.id, 0, path, f.studentId);
      await assert.rejects(f.service.putChunk(first.id, 0, await f.file(Buffer.from('different')), f.studentId), code('CHUNK_CONFLICT'));
      const manifest = await f.service.get(first.id, f.studentId);
      assert.equal(manifest.bytes, webm.length);
      assert.equal(manifest.chunks.length, 1);
      assert.equal(JSON.stringify(manifest).includes('objectKey'), false);
      assert.equal(JSON.stringify(manifest).includes('finalizeToken'), false);
      await assert.rejects(f.service.get(first.id, f.otherId), (error) => error.getStatus() === 403);
    });

    await t.test('completion requires every index and assembles/hash-checks a single stream; repeated completion creates one evidence', async () => {
      const upload = await f.init((await f.newAttempt()).id);
      const tail = Buffer.from('trailing-video-bytes');
      await f.service.putChunk(upload.id, 1, await f.file(tail), f.studentId);
      await assert.rejects(f.service.complete(upload.id, { expectedChunks: 2 }, f.studentId), code('CHUNKS_MISSING'));
      await f.service.putChunk(upload.id, 0, await f.file(webm), f.studentId);
      const completed = await f.service.complete(upload.id, { expectedChunks: 2 }, f.studentId);
      assert.equal(completed.state, 'COMPLETE');
      const evidence = await f.db.evidenceFile.findUnique({ where: { id: completed.evidenceId } });
      assert.deepEqual(f.storage.objects.get(evidence.url), Buffer.concat([webm, tail]));
      assert.deepEqual(await f.service.complete(upload.id, { expectedChunks: 2 }, f.studentId), completed);
      assert.equal(await f.db.evidenceFile.count({ where: { attemptId: upload.attemptId } }), 1);
      await assert.rejects(f.service.complete(upload.id, { expectedChunks: 1 }, f.studentId), code('UPLOAD_CONFLICT'));
      await assert.rejects(f.service.putChunk(upload.id, 2, await f.file(), f.studentId), code('UPLOAD_CLOSED'));
    });

    await t.test('concurrent completion has one lease winner and an idempotent retry', async () => {
      const upload = await f.init((await f.newAttempt()).id);
      await f.service.putChunk(upload.id, 0, await f.file(), f.studentId);
      const results = await Promise.allSettled([f.service.complete(upload.id, { expectedChunks: 1 }, f.studentId), f.service.complete(upload.id, { expectedChunks: 1 }, f.studentId)]);
      assert.ok(results.some((result) => result.status === 'fulfilled'));
      for (const result of results) if (result.status === 'rejected') assert.equal(result.reason.getResponse().code, 'UPLOAD_FINALIZING');
      await f.service.complete(upload.id, { expectedChunks: 1 }, f.studentId);
      assert.equal(await f.db.evidenceFile.count({ where: { attemptId: upload.attemptId } }), 1);
    });

    await t.test('expired finalize lease can be reclaimed after worker crash', async () => {
      const upload = await f.init((await f.newAttempt()).id);
      await f.service.putChunk(upload.id, 0, await f.file(), f.studentId);
      await f.db.recordingUpload.update({ where: { id: upload.id }, data: { state: 'FINALIZING', finalizeToken: randomUUID(), finalizeLeaseUntil: new Date(0), expectedChunks: 1 } });
      assert.equal((await f.service.complete(upload.id, { expectedChunks: 1 }, f.studentId)).state, 'COMPLETE');
    });

    await t.test('corrupt staged bytes never become evidence and the session remains recoverable', async () => {
      const upload = await f.init((await f.newAttempt()).id);
      await f.service.putChunk(upload.id, 0, await f.file(), f.studentId);
      const chunk = await f.db.recordingChunk.findUnique({ where: { uploadId_index: { uploadId: upload.id, index: 0 } } });
      f.storage.objects.set(chunk.objectKey, Buffer.from('tampered-bytes'));
      await assert.rejects(f.service.complete(upload.id, { expectedChunks: 1 }, f.studentId), code('CHUNK_CORRUPT'));
      assert.equal((await f.service.get(upload.id, f.studentId)).state, 'OPEN');
      assert.equal(await f.db.evidenceFile.count({ where: { attemptId: upload.attemptId } }), 0);
    });

    await t.test('a failed evidence transaction retains its unique object until age-bounded orphan cleanup', async () => {
      const upload = await f.init((await f.newAttempt()).id);
      await f.service.putChunk(upload.id, 0, await f.file(), f.studentId);
      const broken = new Proxy(f.db, { get(target, key) {
        if (key !== '$transaction') return target[key];
        return (work, options) => target.$transaction((tx) => work(new Proxy(tx, { get(transaction, field) { return field === 'evidenceFile' ? { create: async () => { throw new Error('Injected database failure'); } } : transaction[field]; } })), options);
      } });
      await assert.rejects(new RecordingUploadsService(broken, f.storage).complete(upload.id, { expectedChunks: 1 }, f.studentId), /Injected database failure/);
      const orphan = [...f.storage.objects.keys()].find((key) => key.startsWith(`recordings/${upload.attemptId}/`));
      assert.ok(orphan);
      assert.equal(await f.db.evidenceFile.count({ where: { attemptId: upload.attemptId } }), 0);
      assert.equal((await f.service.get(upload.id, f.studentId)).state, 'OPEN');
      await f.service.cleanupStaged(true);
      assert.ok(f.storage.objects.has(orphan), 'fresh ambiguous objects are never removed');
      f.storage.dates.set(orphan, new Date(Date.now() - 25 * 60 * 60 * 1000));
      await f.service.cleanupStaged(true);
      assert.equal(f.storage.objects.has(orphan), false);
      assert.equal((await f.service.complete(upload.id, { expectedChunks: 1 }, f.studentId)).state, 'COMPLETE');
    });

    await t.test('a chunk transaction committing after its caller sees a network failure keeps its stored bytes', async () => {
      const upload = await f.init((await f.newAttempt()).id);
      let releaseCommit;
      const gate = new Promise((resolve) => { releaseCommit = resolve; });
      let transactionReady;
      const ready = new Promise((resolve) => { transactionReady = resolve; });
      let lateCommit;
      const delayed = new Proxy(f.db, { get(target, key) {
        if (key !== '$transaction') return target[key];
        return (work, options) => {
          lateCommit = target.$transaction(async (tx) => {
            const result = await work(tx);
            transactionReady();
            await gate;
            return result;
          }, options);
          void lateCommit.catch(() => {});
          return ready.then(() => { throw new Error('Connection lost before commit acknowledgement'); });
        };
      } });
      try {
        await assert.rejects(new RecordingUploadsService(delayed, f.storage).putChunk(upload.id, 0, await f.file(), f.studentId), /Connection lost before commit/);
        assert.equal(await f.db.recordingChunk.count({ where: { uploadId: upload.id } }), 0);
        const stored = [...f.storage.objects.keys()].find((key) => key.startsWith(`staging/${upload.attemptId}/${upload.id}/`));
        assert.ok(stored, 'object must survive while its database reference remains uncommitted');
        releaseCommit();
        await lateCommit;
        const chunk = await f.db.recordingChunk.findUnique({ where: { uploadId_index: { uploadId: upload.id, index: 0 } } });
        assert.equal(chunk.objectKey, stored);
        assert.deepEqual(f.storage.objects.get(chunk.objectKey), webm);
        await f.service.putChunk(upload.id, 0, await f.file(), f.studentId);
        assert.equal((await f.service.complete(upload.id, { expectedChunks: 1 }, f.studentId)).state, 'COMPLETE');
      } finally { releaseCommit(); if (lateCommit) await lateCommit; }
    });

    await t.test('an ambiguous successful database commit keeps its evidence object and returns success', async () => {
      const upload = await f.init((await f.newAttempt()).id);
      await f.service.putChunk(upload.id, 0, await f.file(), f.studentId);
      const ambiguous = new Proxy(f.db, { get(target, key) {
        if (key !== '$transaction') return target[key];
        return async (work, options) => { const result = await target.$transaction(work, options); if (result.state === 'COMPLETE') throw new Error('Connection lost after commit'); return result; };
      } });
      const result = await new RecordingUploadsService(ambiguous, f.storage).complete(upload.id, { expectedChunks: 1 }, f.studentId);
      assert.equal(result.state, 'COMPLETE');
      const evidence = await f.db.evidenceFile.findUnique({ where: { id: result.evidenceId } });
      const chunk = await f.db.recordingChunk.findUnique({ where: { uploadId_index: { uploadId: upload.id, index: 0 } } });
      assert.deepEqual(f.storage.objects.get(evidence.url), webm);
    });

    await t.test('a finalization commit arriving after a network error keeps the final evidence object', async () => {
      const upload = await f.init((await f.newAttempt()).id);
      await f.service.putChunk(upload.id, 0, await f.file(), f.studentId);
      let finalTransaction;
      const delayed = new Proxy(f.db, { get(target, key) {
        if (key !== '$transaction') return target[key];
        return (work, options) => {
          let signalFailure;
          const lostConnection = new Promise((_, reject) => { signalFailure = reject; });
          const transaction = target.$transaction(async (tx) => {
            const result = await work(tx);
            if (result.state === 'COMPLETE') {
              signalFailure(new Error('Finalization connection lost before commit'));
              await new Promise((resolve) => setTimeout(resolve, 75));
            }
            return result;
          }, options);
          finalTransaction = transaction;
          return Promise.race([transaction, lostConnection]);
        };
      } });
      await assert.rejects(new RecordingUploadsService(delayed, f.storage).complete(upload.id, { expectedChunks: 1 }, f.studentId), /Finalization connection lost/);
      await finalTransaction;
      const completed = await f.service.get(upload.id, f.studentId);
      assert.equal(completed.state, 'COMPLETE');
      const evidence = await f.db.evidenceFile.findUnique({ where: { id: completed.evidenceId } });
      assert.deepEqual(f.storage.objects.get(evidence.url), webm);
      assert.equal((await f.service.complete(upload.id, { expectedChunks: 1 }, f.studentId)).evidenceId, evidence.id);
    });

    await t.test('assembly directory failure releases the claimed finalization lease', async () => {
      const upload = await f.init((await f.newAttempt()).id);
      await f.service.putChunk(upload.id, 0, await f.file(), f.studentId);
      const fs = require('node:fs/promises');
      const originalMkdir = fs.mkdir;
      fs.mkdir = async () => { throw new Error('Injected assembly directory failure'); };
      try {
        await assert.rejects(f.service.complete(upload.id, { expectedChunks: 1 }, f.studentId), /Injected assembly directory failure/);
      } finally { fs.mkdir = originalMkdir; }
      const restored = await f.db.recordingUpload.findUnique({ where: { id: upload.id } });
      assert.equal(restored.state, 'OPEN');
      assert.equal(restored.finalizeToken, null);
      assert.equal(restored.finalizeLeaseUntil, null);
      assert.equal((await f.service.complete(upload.id, { expectedChunks: 1 }, f.studentId)).state, 'COMPLETE');
    });

    await t.test('concurrent chunks in different sessions enforce the combined per-attempt byte quota', async () => {
      const attempt = await f.newAttempt();
      const first = await f.init(attempt.id);
      const second = await f.init(attempt.id, { kind: 'screen' });
      await f.db.recordingUpload.update({ where: { id: first.id }, data: { bytes: ATTEMPT_BYTE_LIMIT - 24 } });
      const path = await f.file(webm);
      const results = await Promise.allSettled([f.service.putChunk(first.id, 0, path, f.studentId), f.service.putChunk(second.id, 0, path, f.studentId)]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.find((result) => result.status === 'rejected').reason.getResponse().code, 'RECORDING_QUOTA');
      const sum = await f.db.recordingUpload.aggregate({ where: { attemptId: attempt.id }, _sum: { bytes: true } });
      assert.equal(sum._sum.bytes, ATTEMPT_BYTE_LIMIT - 8);
    });

    await t.test('review decisions freeze writes; an open appeal grants its own 24-hour recovery window', async () => {
      const attempt = await f.newAttempt();
      const sessionId = randomUUID();
      const upload = await f.init(attempt.id, { clientSessionId: sessionId });
      await f.db.attempt.update({ where: { id: attempt.id }, data: { reviewStatus: 'APPROVED' } });
      await assert.rejects(f.service.putChunk(upload.id, 0, await f.file(), f.studentId), code('REVIEW_LOCKED'));
      await f.db.attempt.update({ where: { id: attempt.id }, data: { reviewStatus: 'REJECTED', finishedAt: new Date(0) } });
      await assert.rejects(f.service.putChunk(upload.id, 0, await f.file(), f.studentId), code('REVIEW_LOCKED'));
      await f.db.recordingUpload.update({ where: { id: upload.id }, data: { expiresAt: new Date(0) } });
      await f.db.attemptAppeal.create({ data: { attemptId: attempt.id, reason: 'Recording retry required' } });
      await f.init(attempt.id, { clientSessionId: sessionId });
      await f.service.putChunk(upload.id, 0, await f.file(), f.studentId);
      assert.equal((await f.service.complete(upload.id, { expectedChunks: 1, interrupted: true }, f.studentId)).interrupted, true);
    });

    await t.test('one appeal permits bounded recovery of an aborted recording without resetting historical bytes', async () => {
      const attempt = await f.newAttempt();
      const original = await f.init(attempt.id);
      await f.db.recordingUpload.update({ where: { id: original.id }, data: { bytes: ATTEMPT_BYTE_LIMIT } });
      await f.service.abort(original.id, f.studentId);
      await f.db.attempt.update({ where: { id: attempt.id }, data: { reviewStatus: 'REJECTED' } });
      await f.db.attemptAppeal.create({ data: { attemptId: attempt.id, reason: 'Recover retained local recording' } });
      const replacement = await f.init(attempt.id);
      await f.service.putChunk(replacement.id, 0, await f.file(), f.studentId);
      assert.equal((await f.service.complete(replacement.id, { expectedChunks: 1, interrupted: true }, f.studentId)).state, 'COMPLETE');
      assert.equal((await f.service.get(original.id, f.studentId)).bytes, ATTEMPT_BYTE_LIMIT);
      assert.equal((await f.service.get(original.id, f.studentId)).state, 'ABORTED');
      await assert.rejects(f.db.attemptAppeal.create({ data: { attemptId: attempt.id, reason: 'Cannot add another allowance' } }), (error) => error.code === 'P2002');
    });

    await t.test('concurrent appeal chunks cannot exceed the fixed 1 GiB lifetime allowance', async () => {
      const attempt = await f.newAttempt();
      const first = await f.init(attempt.id);
      const second = await f.init(attempt.id, { kind: 'screen' });
      await f.db.attempt.update({ where: { id: attempt.id }, data: { reviewStatus: 'REJECTED' } });
      await f.db.attemptAppeal.create({ data: { attemptId: attempt.id, reason: 'Restore recording within fixed limit' } });
      await f.db.recordingUpload.update({ where: { id: first.id }, data: { bytes: APPEAL_BYTE_LIMIT - 24 } });
      const path = await f.file();
      const results = await Promise.allSettled([f.service.putChunk(first.id, 0, path, f.studentId), f.service.putChunk(second.id, 0, path, f.studentId)]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const rejected = results.find((result) => result.status === 'rejected').reason.getResponse();
      assert.equal(rejected.code, 'RECORDING_QUOTA');
      assert.match(rejected.message, /1 GiB/);
      const sum = await f.db.recordingUpload.aggregate({ where: { attemptId: attempt.id }, _sum: { bytes: true } });
      assert.equal(sum._sum.bytes, APPEAL_BYTE_LIMIT - 8);
      await assert.rejects(f.service.putChunk(first.id, 1, path, f.studentId), code('RECORDING_QUOTA'));
    });

    await t.test('session count remains bounded even after abort; cleanup dry-run never removes evidence', async () => {
      const attempt = await f.newAttempt();
      for (let index = 0; index < 12; index++) {
        const upload = await f.init(attempt.id);
        await f.service.abort(upload.id, f.studentId);
      }
      await assert.rejects(f.init(attempt.id), code('SESSION_LIMIT'));
      const upload = await f.init((await f.newAttempt()).id);
      await f.service.putChunk(upload.id, 0, await f.file(), f.studentId);
      const result = await f.service.complete(upload.id, { expectedChunks: 1 }, f.studentId);
      const evidence = await f.db.evidenceFile.findUnique({ where: { id: result.evidenceId } });
      await f.db.recordingUpload.update({ where: { id: upload.id }, data: { expiresAt: new Date(0) } });
      const before = f.storage.objects.size;
      assert.equal((await f.service.cleanupStaged()).dryRun, true);
      assert.equal(f.storage.objects.size, before);
      await f.service.cleanupStaged(true);
      assert.ok(f.storage.objects.has(evidence.url));
      assert.equal(await f.db.recordingChunk.count({ where: { uploadId: upload.id } }), 0);
      assert.equal((await f.service.get(upload.id, f.studentId)).bytes, webm.length);
    });
  } finally { await f.close(); }
});
