const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { parseArgs, databaseConfig, storageConfig, pg, verifyBackup, download, probePrivateTarget, sha } = require('./backup-cli.cjs');
const { Readable } = require('node:stream');
const http = require('node:http');

async function fixture(work) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'proctolearn-backup-unit-'));
  const root = path.join(directory, 'backup');
  await fs.mkdir(root); await fs.mkdir(path.join(root, 'objects'));
  const dump = Buffer.from('PGDMPsynthetic-unit-fixture');
  const bytes = Buffer.from('private recording fixture');
  const object = { key: 'recordings/../../cannot-escape-local-directory.webm', file: `objects/${sha('recordings/../../cannot-escape-local-directory.webm')}.bin`, size: bytes.length, sha256: sha(bytes), contentType: 'video/webm' };
  const manifest = { format: 'proctolearn-backup-v1', consistency: 'operator-quiesced', sourceDatabase: sha('database'), sourceStorage: sha('storage'),
    database: { file: 'database.dump', size: dump.length, sha256: sha(dump) }, inventory: { tables: [{ schema: 'public', table: 'audit', rows: '1' }], references: [object.key] }, objects: [object] };
  const publish = async () => {
    const raw = JSON.stringify(manifest);
    await fs.writeFile(path.join(root, 'manifest.json'), raw);
    await fs.writeFile(path.join(root, 'manifest.sha256'), sha(raw) + '\n');
  };
  try {
    await fs.writeFile(path.join(root, 'database.dump'), dump);
    await fs.writeFile(path.join(root, object.file), bytes);
    await publish(); await work({ directory, root, manifest, object, publish });
  } finally {
    const resolved = await fs.realpath(directory);
    assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('proctolearn-backup-unit-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
}

test('CLI requires explicit targets/quiescence and restore remains a plan without --apply', () => {
  const args = ['restore', '--backup', 'private', '--target-database', 'restore_new', '--target-bucket', 'restore-new', '--target-s3-endpoint', 'http://127.0.0.1:19000', '--confirm-private-target', '--confirm-quiescent'];
  assert.equal(parseArgs(args).apply, undefined);
  assert.equal(parseArgs([...args, '--apply']).apply, true);
  assert.throws(() => parseArgs(args.slice(0, -1)), /quiescence|quiescent/);
  assert.throws(() => parseArgs([...args, '--force']), /Unknown/);
  assert.throws(() => parseArgs([...args, '--target-database', 'different']), /duplicate/);
  assert.throws(() => parseArgs(['restore', '--apply']), /Missing/);
  assert.throws(() => parseArgs(args.filter(arg => arg !== '--confirm-private-target')), /confirm-private-target/);
});

test('database and storage identity are explicit and inherited PG routing is cleared', () => {
  const config = databaseConfig('postgresql://test:p%40ss%25@127.0.0.1:55432/restore_new?schema=public', 'restore_new', undefined,
    { PATH: process.env.PATH, PGHOST: 'foreign', PGSERVICE: 'production', PGOPTIONS: '-c search_path=foreign', BACKUP_DATABASE_URL: 'private-url' });
  assert.equal(config.env.PGHOST, '127.0.0.1'); assert.equal(config.env.PGPASSWORD, 'p@ss%');
  assert.equal(config.env.PGSERVICE, undefined); assert.equal(config.env.PGOPTIONS, undefined);
  assert.equal(config.env.BACKUP_DATABASE_URL, undefined);
  assert.throws(() => databaseConfig('postgresql://test@localhost/original', 'different'), /match/);
  assert.throws(() => databaseConfig('postgresql://test@localhost/original?host=foreign', 'original'), /Unsupported/);
  assert.throws(() => databaseConfig('postgresql://test@localhost/original?schema=other', 'original'), /alternate/);
  const env = { BACKUP_S3_ACCESS_KEY_ID: 'fixture', BACKUP_S3_SECRET_ACCESS_KEY: 'fixture-secret' };
  assert.throws(() => storageConfig({ 'source-s3-endpoint': 'http://foreign.example', 'source-bucket': 'fixture-bucket' }, 'BACKUP', env), /HTTPS/);
  assert.throws(() => storageConfig({ 'source-s3-endpoint': 'https://user:password@storage.example', 'source-bucket': 'fixture-bucket' }, 'BACKUP', env), /credentials/);
});

test('complete backup verifies without mapping untrusted object keys into filesystem paths', async () => fixture(async ({ root }) => {
  assert.equal((await verifyBackup(root)).manifest.objects.length, 1);
}));

test('truncated/corrupt object and dump bytes fail integrity checks', async () => {
  await fixture(async ({ root, object }) => { await fs.writeFile(path.join(root, object.file), 'corrupt'); await assert.rejects(verifyBackup(root), /checksum/); });
  await fixture(async ({ root }) => { await fs.writeFile(path.join(root, 'database.dump'), 'PGDMPcorrupt'); await assert.rejects(verifyBackup(root), /checksum/); });
});

test('partial backup, missing object and unlisted file cannot be marked verified', async () => {
  await fixture(async ({ root }) => { await fs.unlink(path.join(root, 'manifest.sha256')); await assert.rejects(verifyBackup(root)); });
  await fixture(async ({ root, object }) => { await fs.unlink(path.join(root, object.file)); await assert.rejects(verifyBackup(root), /missing object/); });
  await fixture(async ({ root }) => { await fs.writeFile(path.join(root, '.env'), 'MUST_NOT_BE_COPIED'); await assert.rejects(verifyBackup(root), /Unexpected/); });
});

test('tampered manifest, traversal paths, duplicates and missing references are refused', async () => {
  await fixture(async ({ root }) => { await fs.appendFile(path.join(root, 'manifest.json'), ' '); await assert.rejects(verifyBackup(root), /manifest checksum/); });
  await fixture(async ({ root, object, publish }) => { object.file = '../outside'; await publish(); await assert.rejects(verifyBackup(root), /Unsafe/); });
  await fixture(async ({ root, manifest, publish }) => { manifest.objects.push({ ...manifest.objects[0] }); await publish(); await assert.rejects(verifyBackup(root), /duplicate/); });
  await fixture(async ({ root, manifest, publish }) => { manifest.inventory.references.push('missing-evidence'); await publish(); await assert.rejects(verifyBackup(root), /missing storage/); });
});

test('hardlinks and directory junctions cannot redirect restore input', async () => {
  await fixture(async ({ root, directory, object }) => {
    await fs.link(path.join(root, object.file), path.join(directory, 'outside.bin'));
    await assert.rejects(verifyBackup(root), /without links/);
  });
  await fixture(async ({ root, directory }) => {
    const link = path.join(directory, 'linked-backup');
    await fs.symlink(root, link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(verifyBackup(link), /symbolic links/);
  });
});

test('subprocess failure and timeout fail closed without exposing stderr data', async () => {
  const db = { env: process.env };
  await assert.rejects(pg(db, process.execPath, ['-e', 'process.stderr.write("SECRET_FIXTURE_DO_NOT_PRINT");process.exit(7)']), error => /exit 7/.test(error.message) && !error.message.includes('SECRET_FIXTURE'));
  await assert.rejects(pg(db, process.execPath, ['-e', 'setInterval(()=>{},1000)'], '', 100), /timed out/);
});

test('storage size overflow aborts immediately instead of filling disk', async () => fixture(async ({ directory }) => {
  const stream = Readable.from([Buffer.alloc(8), Buffer.alloc(8)]);
  const storage = { send: async () => ({ Body: stream }) };
  await assert.rejects(download(storage, { key: 'fixture', size: 4 }, path.join(directory, 'too-large')), /exceeds/);
  assert.equal(stream.destroyed, true);
  assert.equal((await fs.stat(path.join(directory, 'too-large'))).size, 0);
  const mismatch = Readable.from([Buffer.alloc(8)]);
  await assert.rejects(download({ send: async () => ({ Body: mismatch, ContentLength: 8 }) }, { key: 'fixture', size: 4 }), /Content-Length/);
  assert.equal(mismatch.destroyed, true);
}));

test('private root cannot hide a public recordings prefix; only zero-byte owned probes are cleaned', async () => {
  const mutations = [], live = new Set();
  const storage = { send: async (command, value) => {
    mutations.push({ command, ...value });
    if (command === 'PutObjectCommand') live.add(value.Key);
    else if (command === 'DeleteObjectCommand') assert.equal(live.delete(value.Key), true);
  } };
  const server = http.createServer((request, response) => { response.writeHead(request.url.includes('/recordings/') ? 200 : 403); response.end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await assert.rejects(probePrivateTarget(storage, { endpoint: `http://127.0.0.1:${server.address().port}`, bucket: 'fixture' }, [{ key: 'recordings/private.webm' }]), /anonymous reading/);
    assert.equal(live.size, 0);
    assert.equal(mutations.filter(item => item.command === 'PutObjectCommand').length, 2);
    for (const item of mutations.filter(item => item.command === 'PutObjectCommand')) { assert.equal(item.Body.length, 0); assert.equal(item.IfNoneMatch, '*'); }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
