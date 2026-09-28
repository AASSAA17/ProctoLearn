const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { Readable } = require('node:stream');
require('reflect-metadata');
const { ConfigService } = require('@nestjs/config');
const { MinioService } = require('../src/minio/minio.service');

const make = (extra = {}) => new MinioService(new ConfigService({ MINIO_ROOT_USER: 'storage-test-user', MINIO_ROOT_PASSWORD: 'storage-test-password', ...extra }));

test('storage readiness aborts the actual HTTP socket when the dependency never replies', async () => {
  const sockets = new Set();
  let requestClosed;
  const closed = new Promise((resolve) => { requestClosed = resolve; });
  const server = http.createServer((request) => { request.on('close', requestClosed); });
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const service = make({ MINIO_ENDPOINT: '127.0.0.1', MINIO_PORT: String(server.address().port) });
  try {
    const start = Date.now();
    await assert.rejects(service.storageProbe(200), (error) => error.name === 'AbortError');
    assert.ok(Date.now() - start < 1500);
    await Promise.race([closed, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('aborted storage request retained its socket')), 1000); timer.unref(); })]);
  } finally {
    service.onModuleDestroy();
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('startup creates only missing buckets and does not mask readiness authentication failures', async () => {
  const service = make();
  const commands = [];
  service.client.send = async (command) => {
    commands.push(command.constructor.name);
    if (command.constructor.name === 'HeadBucketCommand') throw { $metadata: { httpStatusCode: 404 } };
    return {};
  };
  await service.onModuleInit();
  assert.deepEqual(commands, ['HeadBucketCommand', 'CreateBucketCommand']);
  service.client.send = async () => { throw { $metadata: { httpStatusCode: 403 } }; };
  await assert.rejects(service.storageProbe(2000), (error) => error.$metadata.httpStatusCode === 403);
  service.onModuleDestroy();
});

test('object body deadline closes a socket even when response headers arrived before the peer stalled', async () => {
  const sockets = new Set();
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': '1024' });
    response.write('a');
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const service = make({ MINIO_ENDPOINT: '127.0.0.1', MINIO_PORT: String(server.address().port) });
  try {
    const body = await service.getObject('stalled-object', 200);
    await assert.rejects(async () => { for await (const _chunk of body) {} }, (error) => error.name === 'TimeoutError');
    assert.equal(body.destroyed, true);
  } finally {
    service.onModuleDestroy();
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('file uploads stream from disk with a known content length and destroy the stream on request failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'proctolearn-storage-adapter-'));
  const path = join(directory, 'file.webm');
  const contents = Buffer.alloc(256 * 1024, 11);
  await writeFile(path, contents);
  const service = make();
  let body;
  try {
    service.client.send = async (command) => {
      body = command.input.Body;
      assert.ok(body instanceof Readable);
      assert.equal(command.input.ContentLength, contents.length);
      const chunks = [];
      for await (const chunk of body) chunks.push(chunk);
      assert.deepEqual(Buffer.concat(chunks), contents);
      return {};
    };
    await service.uploadFile(path, 'recording.webm', 'video/webm');
    assert.equal(body.destroyed, true);
    service.client.send = async (command) => { body = command.input.Body; throw new Error('Injected S3 failure'); };
    await assert.rejects(service.uploadFile(path, 'recording.webm', 'video/webm'), /Injected S3 failure/);
    assert.equal(body.destroyed, true);
  } finally {
    service.onModuleDestroy();
    assert.ok(directory.startsWith(join(tmpdir(), 'proctolearn-storage-adapter-')));
    await rm(directory, { recursive: true, force: true });
  }
});

test('object listing is bounded and forwards the exact continuation key', async () => {
  const service = make();
  service.client.send = async (command) => {
    assert.equal(command.constructor.name, 'ListObjectsV2Command');
    assert.equal(command.input.MaxKeys, 1000);
    assert.equal(command.input.StartAfter, 'staging/prior-key');
    return { Contents: [{ Key: 'staging/next-key', Size: 7, LastModified: new Date(0) }] };
  };
  assert.equal((await service.listObjects('staging/', 2000, 'staging/prior-key'))[0].name, 'staging/next-key');
  service.onModuleDestroy();
});
