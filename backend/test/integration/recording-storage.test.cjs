const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
require('reflect-metadata');
const Minio = require('minio');
const { ConfigService } = require('@nestjs/config');
const { MinioService } = require('../../src/minio/minio.service');
const { RecordingUploadsService } = require('../../src/evidence/recording-uploads.service');
const { recordingFixture, webm } = require('./recording-fixture.cjs');

const host = process.env.TEST_MINIO_ENDPOINT;
const port = Number(process.env.TEST_MINIO_PORT);
const user = process.env.TEST_MINIO_ROOT_USER;
const password = process.env.TEST_MINIO_ROOT_PASSWORD;
if (!['localhost', '127.0.0.1'].includes(host) || port !== 19000 || !user || !password) {
  throw new Error('Actual storage tests require the isolated localhost:19000 TEST_MINIO_* configuration');
}

test('actual MinIO object storage streams, checksums, retries and failed-finalization cleanup', async (t) => {
  const bucket = `proctolearn-test-${randomUUID()}`;
  const client = new Minio.Client({ endPoint: host, port, useSSL: false, accessKey: user, secretKey: password, region: 'us-east-1' });
  const storage = new MinioService(new ConfigService({ MINIO_ENDPOINT: host, MINIO_PORT: String(port), MINIO_ROOT_USER: user, MINIO_ROOT_PASSWORD: password, MINIO_BUCKET: bucket, MINIO_REGION: 'us-east-1' }));
  await client.makeBucket(bucket, 'us-east-1');
  let fixture;
  const bytes = async (key) => { const result = []; for await (const chunk of await storage.getObject(key)) result.push(chunk); return Buffer.concat(result); };
  try {
    fixture = await recordingFixture(storage);
    const f = fixture;
    await t.test('out-of-order HTTP-sized chunks form the exact original bytes and one idempotent evidence object', async () => {
      const upload = await f.init((await f.newAttempt()).id);
      const parts = [Buffer.concat([webm, Buffer.alloc(170_000, 3)]), Buffer.alloc(140_000, 5), Buffer.alloc(37_123, 9)];
      for (const index of [2, 0, 1]) await f.service.putChunk(upload.id, index, await f.file(parts[index]), f.studentId);
      const completed = await f.service.complete(upload.id, { expectedChunks: 3 }, f.studentId);
      assert.equal((await f.service.complete(upload.id, { expectedChunks: 3 }, f.studentId)).evidenceId, completed.evidenceId);
      const evidence = await f.db.evidenceFile.findUnique({ where: { id: completed.evidenceId } });
      const final = await bytes(evidence.url);
      assert.equal(final.length, parts.reduce((sum, part) => sum + part.length, 0));
      assert.equal(createHash('sha256').update(final).digest('hex'), createHash('sha256').update(Buffer.concat(parts)).digest('hex'));
      assert.equal((await storage.listObjects(`recordings/${upload.attemptId}/`)).length, 1);
      await f.db.recordingUpload.update({ where: { id: upload.id }, data: { expiresAt: new Date(0) } });
      await f.service.cleanupStaged(true);
      assert.equal((await storage.listObjects(`staging/${upload.attemptId}/`)).length, 0);
      assert.deepEqual(await bytes(evidence.url), final);
      assert.equal((await f.service.get(upload.id, f.studentId)).bytes, final.length);
    });

    await t.test('an actual stored chunk checksum mismatch prevents publication', async () => {
      const upload = await f.init((await f.newAttempt()).id);
      await f.service.putChunk(upload.id, 0, await f.file(), f.studentId);
      const chunk = await f.db.recordingChunk.findUnique({ where: { uploadId_index: { uploadId: upload.id, index: 0 } } });
      await client.putObject(bucket, chunk.objectKey, Buffer.alloc(webm.length, 9));
      await assert.rejects(f.service.complete(upload.id, { expectedChunks: 1 }, f.studentId), (error) => error.getResponse?.().code === 'CHUNK_CORRUPT');
      assert.equal(await f.db.evidenceFile.count({ where: { attemptId: upload.attemptId } }), 0);
      assert.equal((await storage.listObjects(`recordings/${upload.attemptId}/`)).length, 0);
    });

    await t.test('uncertain final object is retained until aged orphan cleanup, while staged bytes survive retry', async () => {
      const upload = await f.init((await f.newAttempt()).id);
      await f.service.putChunk(upload.id, 0, await f.file(), f.studentId);
      const broken = new Proxy(f.db, { get(target, key) {
        if (key !== '$transaction') return target[key];
        return (work, options) => target.$transaction((tx) => work(new Proxy(tx, { get(transaction, field) { return field === 'evidenceFile' ? { create: async () => { throw new Error('Injected evidence failure'); } } : transaction[field]; } })), options);
      } });
      await assert.rejects(new RecordingUploadsService(broken, storage).complete(upload.id, { expectedChunks: 1 }, f.studentId), /Injected evidence failure/);
      const objects = await storage.listObjects(`recordings/${upload.attemptId}/`);
      assert.equal(objects.length, 1);
      const orphan = objects[0].name;
      assert.deepEqual(await bytes(orphan), webm);
      assert.equal(await f.db.evidenceFile.count({ where: { attemptId: upload.attemptId } }), 0);
      await f.service.cleanupStaged(true);
      assert.deepEqual(await bytes(orphan), webm, 'fresh ambiguous object remains until the age floor');
      // Advance only this object's observed age; reads, reference checks and deletion still use real MinIO.
      const agedStorage = new Proxy(storage, { get(target, key) {
        if (key !== 'listObjects') return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
        return async (...args) => (await target.listObjects(...args)).map((item) => item.name === orphan
          ? { ...item, lastModified: new Date(Date.now() - 25 * 60 * 60 * 1000) } : item);
      } });
      await new RecordingUploadsService(f.db, agedStorage).cleanupStaged(true);
      assert.equal((await storage.listObjects(`recordings/${upload.attemptId}/`)).length, 0);
      assert.equal((await storage.listObjects(`staging/${upload.attemptId}/`)).length, 1);
      const complete = await f.service.complete(upload.id, { expectedChunks: 1 }, f.studentId);
      const evidence = await f.db.evidenceFile.findUnique({ where: { id: complete.evidenceId } });
      assert.deepEqual(await bytes(evidence.url), webm);
    });
  } finally {
    if (fixture) await fixture.close();
    // This bucket is created exclusively by this test run with an unguessable UUID.
    assert.match(bucket, /^proctolearn-test-[0-9a-f-]{36}$/);
    for await (const object of client.listObjectsV2(bucket, '', true)) if (object.name) await client.removeObject(bucket, object.name);
    await client.removeBucket(bucket);
  }
});
