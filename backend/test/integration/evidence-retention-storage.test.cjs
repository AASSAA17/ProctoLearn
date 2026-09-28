const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { S3Client, CreateBucketCommand, DeleteBucketCommand } = require('@aws-sdk/client-s3');
const { ConfigService } = require('@nestjs/config');
const { MinioService } = require('../../src/minio/minio.service');
const { EvidenceRetentionService } = require('../../src/evidence/evidence-retention.service');
const { recordingFixture, webm } = require('./recording-fixture.cjs');

const host = process.env.TEST_MINIO_ENDPOINT;
const port = Number(process.env.TEST_MINIO_PORT);
const user = process.env.TEST_MINIO_ROOT_USER;
const password = process.env.TEST_MINIO_ROOT_PASSWORD;
if (!['localhost', '127.0.0.1'].includes(host) || port !== 19000 || !user || !password) throw new Error('Retention storage tests require dedicated localhost:19000 TEST_MINIO_* settings');

test('actual S3 retention deletes only a tombstoned key and recovers an ambiguous successful delete', async (t) => {
  const bucket = `proctolearn-test-${randomUUID()}`;
  const client = new S3Client({ endpoint: `http://${host}:${port}`, forcePathStyle: true, credentials: { accessKeyId: user, secretAccessKey: password }, region: 'us-east-1', requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  const config = new ConfigService({ MINIO_ENDPOINT: host, MINIO_PORT: String(port), MINIO_ROOT_USER: user, MINIO_ROOT_PASSWORD: password, MINIO_BUCKET: bucket, MINIO_REGION: 'us-east-1', EVIDENCE_RETENTION_DAYS: '30' });
  const storage = new MinioService(config);
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  let f;
  const old = new Date(Date.now() - 90 * 86_400_000);
  try {
    f = await recordingFixture(storage);
    const service = new EvidenceRetentionService(f.db, storage, config);
    const attempt = await f.newAttempt({ status: 'FINISHED', finishedAt: old, reviewStatus: 'APPROVED', reviewedAt: old });
    const key = `recordings/${attempt.id}/camera-${randomUUID()}.webm`;
    const neighbor = `recordings/${attempt.id}/camera-${randomUUID()}.webm`;
    await storage.uploadFile(await f.file(webm), key, 'video/webm');
    await storage.uploadFile(await f.file(webm), neighbor, 'video/webm');
    const evidence = await f.db.evidenceFile.create({ data: { attemptId: attempt.id, type: 'recording_camera', url: key, createdAt: old } });
    assert.equal((await service.run({ attemptId: attempt.id })).results[0].state, 'WOULD_DELETE');
    assert.equal((await storage.listObjects(`recordings/${attempt.id}/`)).length, 2);
    // Remote delete succeeds, then response/DB processing fails. Tombstone remains
    // pending even though the object is already gone; retry's DeleteObject is safe.
    const ambiguous = new Proxy(storage, { get(target, property) {
      if (property === 'removeObject') return async (objectKey) => { await target.removeObject(objectKey); throw new Error('Injected response loss'); };
      const value = target[property]; return typeof value === 'function' ? value.bind(target) : value;
    } });
    assert.equal((await new EvidenceRetentionService(f.db, ambiguous, config).run({ apply: true, attemptId: attempt.id })).results[0].state, 'RETRY');
    assert.deepEqual((await storage.listObjects(`recordings/${attempt.id}/`)).map((item) => item.name), [neighbor]);
    const pending = await f.db.evidenceFile.findUnique({ where: { id: evidence.id }, include: { deletionJob: true } });
    assert.ok(pending.deletionRequestedAt); assert.equal(pending.deletedAt, null); assert.equal(pending.deletionJob.state, 'RETRY');
    await assert.rejects(service.setHold(attempt.id, { id: f.teacherId, role: 'ADMIN' }, true, 'Too late to promise preservation'), (error) => error.getResponse?.().code === 'RETENTION_ALREADY_STARTED');
    assert.equal((await service.run({ apply: true, attemptId: attempt.id })).results[0].state, 'PROTECTED_OR_BUSY');
    await f.db.evidenceDeletionJob.update({ where: { evidenceId: evidence.id }, data: { leaseUntil: new Date(0) } });
    assert.equal((await service.run({ apply: true, attemptId: attempt.id })).results[0].state, 'DELETED');
    const completed = await f.db.evidenceFile.findUnique({ where: { id: evidence.id }, include: { deletionJob: true } });
    assert.ok(completed.deletedAt); assert.equal(completed.deletionJob.state, 'DONE'); assert.equal(completed.deletionJob.attempts, 2);
    const body = []; for await (const chunk of await storage.getObject(neighbor)) body.push(chunk);
    assert.deepEqual(Buffer.concat(body), webm);
  } finally {
    if (f) {
      const attempts = await f.db.attempt.findMany({ where: { userId: f.studentId }, select: { id: true } });
      const ids = attempts.map((item) => item.id);
      const files = await f.db.evidenceFile.findMany({ where: { attemptId: { in: ids } }, select: { id: true } });
      await f.db.auditEvent.deleteMany({ where: { targetId: { in: [...ids, ...files.map((item) => item.id)] } } });
      for (const attempt of attempts) for (const object of await storage.listObjects(`recordings/${attempt.id}/`)) await storage.removeObject(object.name);
      await f.close();
    }
    await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    storage.onModuleDestroy(); client.destroy();
  }
});
