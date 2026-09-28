#!/usr/bin/env node
'use strict';

// Operator tool: explicit environment only. Never loads dotenv, creates a target,
// drops a schema, overwrites an object, or removes an incomplete backup/restore.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const backendRequire = createRequire(path.join(__dirname, '../backend/package.json'));
const FORMAT = 'proctolearn-backup-v1';
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_MANIFEST = 32 * 1024 * 1024;
const OBJECT_TIMEOUT = 300_000;
const sha = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
const identifier = value => '"' + String(value).replaceAll('"', '""') + '"';

function parseArgs(args) {
  const command = args[0];
  const allowed = {
    backup: ['output', 'source-database', 'source-bucket', 'source-s3-endpoint', 'region', 'pg-bin', 'confirm-quiescent'],
    restore: ['backup', 'target-database', 'target-bucket', 'target-s3-endpoint', 'region', 'pg-bin', 'confirm-quiescent', 'confirm-private-target', 'apply'],
    verify: ['backup'],
  };
  if (!allowed[command]) fail('Use backup, verify, or restore. See docs/BACKUP_RESTORE.md.');
  const result = { command };
  for (let index = 1; index < args.length; index++) {
    const key = args[index].replace(/^--/, '');
    if (!args[index].startsWith('--') || !allowed[command].includes(key) || Object.hasOwn(result, key)) fail('Unknown or duplicate option. See docs/BACKUP_RESTORE.md.');
    if (['confirm-quiescent', 'confirm-private-target', 'apply'].includes(key)) result[key] = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith('--')) fail('An option value is missing.');
      result[key] = value;
    }
  }
  const required = command === 'backup' ? ['output', 'source-database', 'source-bucket', 'source-s3-endpoint']
    : command === 'restore' ? ['backup', 'target-database', 'target-bucket', 'target-s3-endpoint'] : ['backup'];
  for (const key of required) if (!result[key]) fail(`Missing --${key}.`);
  if (command !== 'verify' && !result['confirm-quiescent']) fail('Stop application writers, workers and storage cleanup first; --confirm-quiescent is required.');
  if (command === 'restore' && !result['confirm-private-target']) fail('Review target bucket IAM/policy/ACL and pass --confirm-private-target.');
  return result;
}

function databaseConfig(raw, name, pgBin, environment = process.env) {
  let url;
  try { url = new URL(raw); } catch { fail('Set the explicit BACKUP_DATABASE_URL or RESTORE_DATABASE_URL environment variable.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || url.hash
    || !/^[a-z][a-z0-9_]{0,62}$/.test(name || '') || decodeURIComponent(url.pathname.slice(1)) !== name) fail('Explicit database name must match the PostgreSQL URL.');
  // Avoid libpq service files, caller PGOPTIONS, or inherited credentials redirecting a command.
  const env = Object.fromEntries(Object.entries(environment).filter(([key]) => !key.toUpperCase().startsWith('PG') && !/^(BACKUP_|RESTORE_)/.test(key)));
  Object.assign(env, { PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: name, PGCONNECT_TIMEOUT: '5', PGAPPNAME: 'proctolearn_backup_tool', PGCLIENTENCODING: 'UTF8' });
  const sslOptions = { sslmode: 'PGSSLMODE', sslrootcert: 'PGSSLROOTCERT', sslcert: 'PGSSLCERT', sslkey: 'PGSSLKEY', channel_binding: 'PGCHANNELBINDING' };
  for (const [key, value] of url.searchParams) {
    if (sslOptions[key]) env[sslOptions[key]] = value;
    else if (!['schema', 'connection_limit', 'connect_timeout', 'pool_timeout', 'socket_timeout', 'pgbouncer', 'statement_cache_size'].includes(key)) fail('Unsupported database URL option. Use a direct PostgreSQL connection.');
    if (key === 'schema' && value !== 'public') fail('Backup is for the complete application database, not an alternate Prisma schema.');
    if (key === 'pgbouncer' && value === 'true') fail('Use a direct PostgreSQL connection for backup/restore.');
  }
  return { name, env, pgBin, fingerprint: sha(`${url.hostname.toLowerCase()}:${url.port || '5432'}/${name}`) };
}

function storageConfig(options, prefix, environment = process.env) {
  const side = prefix === 'BACKUP' ? 'source' : 'target';
  let url;
  try { url = new URL(options[`${side}-s3-endpoint`]); } catch { fail('An explicit S3 HTTP(S) origin is required.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) fail('S3 endpoint must be an origin without credentials or a path.');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) fail('Use HTTPS for storage outside loopback.');
  const bucket = options[`${side}-bucket`];
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket || '') || bucket.includes('..')) fail('Invalid explicit S3 bucket name.');
  const accessKeyId = environment[`${prefix}_S3_ACCESS_KEY_ID`];
  const secretAccessKey = environment[`${prefix}_S3_SECRET_ACCESS_KEY`];
  if (!accessKeyId || !secretAccessKey) fail(`Set ${prefix}_S3_ACCESS_KEY_ID and ${prefix}_S3_SECRET_ACCESS_KEY.`);
  return { endpoint: url.origin, bucket, region: options.region || 'us-east-1', credentials: { accessKeyId, secretAccessKey }, fingerprint: sha(`${url.origin}/${bucket}`) };
}

function pg(db, tool, args, input = '', timeout = 600_000) {
  const executable = path.isAbsolute(tool) ? tool : db.pgBin ? path.join(db.pgBin, tool + (process.platform === 'win32' ? '.exe' : '')) : tool;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env: db.env, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; let length = 0, failed = false;
    const abort = message => { if (!failed) { failed = true; child.kill(); reject(new Error(message)); } };
    const timer = setTimeout(() => abort(`${tool} timed out; no success was recorded.`), timeout);
    child.once('error', () => abort(`Cannot run ${tool}; install matching PostgreSQL client tools or specify --pg-bin.`));
    child.stdout.on('data', chunk => { length += chunk.length; if (length > MAX_MANIFEST) abort(`${tool} output limit exceeded.`); else chunks.push(chunk); });
    // Diagnostics may include private data. Never forward raw stderr to a console or manifest.
    child.stderr.resume();
    child.stdin.on('error', () => {});
    child.once('close', code => {
      clearTimeout(timer);
      if (failed) return;
      if (code !== 0) reject(new Error(`${tool} failed (exit ${code}); verify connectivity, permissions and tool/server versions.`));
      else resolve(Buffer.concat(chunks).toString('utf8').trim());
    });
    child.stdin.end(input);
  });
}

async function sql(db, query) {
  const text = await pg(db, 'psql', ['-X', '--no-password', '--no-align', '--tuples-only', '--set=ON_ERROR_STOP=1', '--quiet'], query, 60_000);
  try { return JSON.parse(text); } catch { fail('Database inspection returned an invalid result.'); }
}

async function assertQuiescent(db) {
  const count = await sql(db, `SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND pid<>${db.lockPid || 0} AND backend_type='client backend';`);
  if (count !== 0) fail('Other database clients are connected. Stop the application, workers and cleanup before continuing.');
}

// Cooperative lock also used by retention workers. Application/GC quiescence is still required.
async function acquireRetentionLock(db) {
  const executable = db.pgBin ? path.join(db.pgBin, 'psql' + (process.platform === 'win32' ? '.exe' : '')) : 'psql';
  const child = spawn(executable, ['-X', '--no-password', '--no-align', '--tuples-only', '--set=ON_ERROR_STOP=1', '--quiet'],
    { env: db.env, windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
  let closed = false;
  const close = new Promise(resolve => child.once('close', () => { closed = true; resolve(); }));
  child.stderr.resume(); child.stdin.on('error', () => {});
  try {
    await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Timed out acquiring the backup/retention lock.')), 10_000);
      const done = error => { clearTimeout(timeout); child.stdout.removeListener('data', read); error ? reject(error) : resolve(); };
      const read = chunk => {
        output += chunk.toString('utf8');
        if (output.length > 4096) return done(new Error('Invalid backup lock response.'));
        if (!output.includes('\n')) return;
        try {
          const data = JSON.parse(output.trim());
          if (!data.locked || !Number.isSafeInteger(data.pid)) return done(new Error('Retention or another backup is running. Retry after it completes.'));
          db.lockPid = data.pid; done();
        } catch { done(new Error('Invalid backup lock response.')); }
      };
      child.stdout.on('data', read);
      child.once('error', () => done(new Error('Cannot start PostgreSQL backup lock connection.')));
      child.once('close', () => done(new Error('Backup lock connection closed before acquisition.')));
      child.stdin.write('SELECT json_build_object(\'pid\',pg_backend_pid(),\'locked\',pg_try_advisory_lock(71083208::bigint));\n');
    });
  } catch (error) { child.kill(); await close; throw error; }
  return {
    assertHeld() { if (closed || child.exitCode !== null) fail('Backup retention lock was lost. No complete backup is published.'); },
    async release() { child.stdin.end(); const timer = setTimeout(() => child.kill(), 5000); await close; clearTimeout(timer); delete db.lockPid; },
  };
}

async function assertEmptyDatabase(db) {
  if (['postgres', 'template0', 'template1'].includes(db.name)) fail('System databases cannot be restore targets.');
  await assertQuiescent(db);
  const count = await sql(db, `SELECT (
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%') +
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema')) +
    (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%') +
    (SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('public','pg_catalog','information_schema') AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp%') +
    (SELECT count(*) FROM pg_largeobject_metadata)
  );`);
  if (count !== 0) fail('Restore target database is not empty. No existing schema or data will be removed.');
}

async function databaseInventory(db) {
  const tables = await sql(db, "SELECT coalesce(json_agg(json_build_object('schema',n.nspname,'table',c.relname) ORDER BY n.nspname,c.relname),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%';");
  if (!tables.some(table => table.schema === 'public' && table.table === '_prisma_migrations')) fail('Source database is missing the application migration history.');
  for (const table of tables) table.rows = String(await sql(db, `SELECT to_json(count(*)::text) FROM ${identifier(table.schema)}.${identifier(table.table)};`));
  let references = [];
  if (tables.some(table => table.schema === 'public' && table.table === 'evidence_files')) {
    const pending = await sql(db, "SELECT count(*) FROM public.evidence_files e WHERE to_jsonb(e)->>'deletionRequestedAt' IS NOT NULL AND to_jsonb(e)->>'deletedAt' IS NULL;");
    if (pending) fail('Evidence deletion is incomplete. Let retention finish before creating a complete backup.');
    references.push(...await sql(db, `SELECT coalesce(json_agg(url ORDER BY url),'[]') FROM public.evidence_files e WHERE to_jsonb(e)->>'deletedAt' IS NULL;`));
  }
  if (tables.some(table => table.schema === 'public' && table.table === 'recording_chunks')) {
    references.push(...await sql(db, 'SELECT coalesce(json_agg("objectKey" ORDER BY "objectKey"),\'[]\') FROM public.recording_chunks;'));
  }
  references = [...new Set(references)].sort();
  return { tables, references };
}

function s3(config) {
  const sdk = backendRequire('@aws-sdk/client-s3');
  const client = new sdk.S3Client({ endpoint: config.endpoint, region: config.region, credentials: config.credentials, forcePathStyle: true,
    maxAttempts: 1, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', requestHandler: { connectionTimeout: 5000, socketTimeout: OBJECT_TIMEOUT } });
  return {
    close: () => client.destroy(),
    async send(name, input, timeout = 30_000) {
      return client.send(new sdk[name]({ Bucket: config.bucket, ...input }), { abortSignal: AbortSignal.timeout(timeout) });
    },
  };
}

function validKey(key) {
  if (typeof key !== 'string' || !key || Buffer.byteLength(key) > 1024 || /[\x00-\x1f\x7f]/.test(key)) fail('Unsupported storage object key.');
  return key;
}

async function storageInventory(storage) {
  const objects = []; let token;
  const tokens = new Set();
  do {
    const page = await storage.send('ListObjectsV2Command', { MaxKeys: 1000, ...(token ? { ContinuationToken: token } : {}) });
    for (const item of page.Contents || []) {
      validKey(item.Key);
      if (!Number.isSafeInteger(item.Size) || item.Size < 0 || !item.ETag) fail('Invalid object inventory.');
      objects.push({ key: item.Key, size: item.Size, etag: item.ETag });
    }
    if (objects.length > 100_000) fail('Inventory exceeds the supported 100000-object limit.');
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && (!token || tokens.has(token))) fail('Storage pagination did not advance.');
    tokens.add(token);
  } while (token);
  objects.sort((a, b) => a.key.localeCompare(b.key, 'en'));
  if (new Set(objects.map(item => item.key)).size !== objects.length) fail('Duplicate storage object in inventory.');
  return objects;
}

async function checkedDirectory(directory) {
  const absolute = path.resolve(directory);
  for (let current = absolute; ; current = path.dirname(current)) {
    const info = await fsp.lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()) fail('Backup directories must be real directories, not symbolic links.');
    if (path.dirname(current) === current) break;
  }
  return absolute;
}

async function regularFile(file) {
  const info = await fsp.lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail('Backup entries must be regular files without links.');
  return info;
}

async function hashFile(file) {
  await regularFile(file);
  const hash = createHash('sha256'); let size = 0;
  for await (const chunk of fs.createReadStream(file)) { hash.update(chunk); size += chunk.length; }
  return { size, sha256: hash.digest('hex') };
}

async function download(storage, object, destination) {
  const response = await storage.send('GetObjectCommand', { Key: object.key, ...(object.etag ? { IfMatch: object.etag } : {}) });
  if (!response.Body || typeof response.Body.destroy !== 'function') fail('Unsupported storage response stream.');
  if (response.ContentLength !== undefined && response.ContentLength !== object.size) { response.Body.destroy(); fail('Storage Content-Length differs from the object inventory.'); }
  const hash = createHash('sha256'); let size = 0;
  const timer = setTimeout(() => response.Body.destroy(new Error('Storage body timeout.')), OBJECT_TIMEOUT);
  const measure = new Transform({ transform(chunk, encoding, callback) {
    size += chunk.length;
    if (size > object.size) return callback(new Error('Storage body exceeds the declared object size.'));
    hash.update(chunk); callback(null, chunk);
  } });
  try {
    if (destination) await pipeline(response.Body, measure, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }));
    else for await (const chunk of response.Body) { size += chunk.length; if (size > object.size) fail('Storage body exceeds the declared object size.'); hash.update(chunk); }
  } finally { clearTimeout(timer); response.Body.destroy(); }
  if (size !== object.size) fail('Stored object size changed or its download was incomplete.');
  return { size, sha256: hash.digest('hex'), contentType: response.ContentType || 'application/octet-stream' };
}

function assertReferences(inventory, objects) {
  const keys = new Set(objects.map(object => object.key));
  if (inventory.references.some(key => !keys.has(key))) fail('Database references a missing storage object. A complete backup/restore cannot be declared.');
}

async function probePrivateTarget(storage, config, objects) {
  // Probe each used namespace: a public recordings/* policy can coexist with a private bucket root.
  // This is a smoke check; the operator must also review object-specific policies and ACLs.
  const prefixes = new Set(['', ...objects.map(object => object.key.includes('/') ? object.key.slice(0, object.key.lastIndexOf('/') + 1) : '')]);
  for (const prefix of prefixes) {
    const key = `${prefix}proctolearn-private-probe-${randomUUID()}`;
    let created = false;
    try {
      await storage.send('PutObjectCommand', { Key: key, Body: Buffer.alloc(0), ContentLength: 0, ContentType: 'application/octet-stream', IfNoneMatch: '*' });
      created = true;
      const url = `${config.endpoint}/${encodeURIComponent(config.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
      const response = await fetch(url, { redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(5000) });
      await response.body?.cancel();
      if (response.status !== 403) fail('Target storage did not deny anonymous reading with HTTP 403. No private payload has been restored.');
    } finally {
      // Only the unpredictable, zero-byte object allocated in this invocation is removed.
      if (created) await storage.send('DeleteObjectCommand', { Key: key });
    }
  }
}

async function verifyBackup(directory) {
  const root = await checkedDirectory(directory);
  const manifestFile = path.join(root, 'manifest.json');
  const info = await regularFile(manifestFile);
  if (info.size > MAX_MANIFEST) fail('Backup manifest is too large.');
  const raw = await fsp.readFile(manifestFile);
  const checksumFile = path.join(root, 'manifest.sha256');
  if ((await regularFile(checksumFile)).size !== 65) fail('Invalid manifest checksum file.');
  if ((await fsp.readFile(checksumFile, 'utf8')).trim() !== sha(raw)) fail('Backup manifest checksum mismatch.');
  let manifest;
  try { manifest = JSON.parse(raw); } catch { fail('Invalid backup manifest.'); }
  if (manifest.format !== FORMAT || manifest.consistency !== 'operator-quiesced' || !DIGEST.test(manifest.sourceDatabase) || !DIGEST.test(manifest.sourceStorage)
    || !Array.isArray(manifest.objects) || manifest.objects.length > 100_000 || !manifest.database || manifest.database.file !== 'database.dump'
    || !DIGEST.test(manifest.database.sha256) || !Number.isSafeInteger(manifest.database.size) || manifest.database.size < 5
    || !manifest.inventory || !Array.isArray(manifest.inventory.tables) || !Array.isArray(manifest.inventory.references)) fail('Unsupported or incomplete backup manifest.');
  for (const table of manifest.inventory.tables) if (typeof table.schema !== 'string' || typeof table.table !== 'string' || !/^\d+$/.test(table.rows)) fail('Invalid table inventory.');
  const keys = new Set(), filenames = new Set();
  for (const object of manifest.objects) {
    validKey(object.key);
    if (object.file !== `objects/${sha(object.key)}.bin` || !DIGEST.test(object.sha256) || !Number.isSafeInteger(object.size) || object.size < 0
      || typeof object.contentType !== 'string' || object.contentType.length > 255 || /[\r\n]/.test(object.contentType)
      || keys.has(object.key) || filenames.has(object.file)) fail('Unsafe, duplicate or invalid backup object entry.');
    keys.add(object.key); filenames.add(object.file);
  }
  if (JSON.stringify((await fsp.readdir(root)).sort()) !== JSON.stringify(['database.dump', 'manifest.json', 'manifest.sha256', 'objects'].sort())) fail('Unexpected or missing backup entry.');
  await checkedDirectory(path.join(root, 'objects'));
  const objectFiles = await fsp.readdir(path.join(root, 'objects'));
  if (objectFiles.length !== manifest.objects.length || objectFiles.some(name => !filenames.has(`objects/${name}`))) fail('Unexpected or missing object file.');
  for (const item of [manifest.database, ...manifest.objects]) {
    const actual = await hashFile(path.join(root, item.file));
    if (actual.size !== item.size || actual.sha256 !== item.sha256) fail('Backup file checksum mismatch.');
  }
  const header = await fsp.open(path.join(root, 'database.dump'), 'r');
  try { const bytes = Buffer.alloc(5); await header.read(bytes, 0, 5, 0); if (bytes.toString() !== 'PGDMP') fail('Expected a PostgreSQL custom-format dump.'); } finally { await header.close(); }
  assertReferences(manifest.inventory, manifest.objects);
  return { root, manifest };
}

async function backup(options, environment = process.env) {
  if (!options['confirm-quiescent']) fail('Explicit quiescence confirmation is required.');
  const db = databaseConfig(environment.BACKUP_DATABASE_URL, options['source-database'], options['pg-bin'], environment);
  const config = storageConfig(options, 'BACKUP', environment);
  const output = path.resolve(options.output);
  await checkedDirectory(path.dirname(output));
  await fsp.mkdir(output, { mode: 0o700 }); // EEXIST fails: never overwrite a prior backup.
  await fsp.mkdir(path.join(output, 'objects'), { mode: 0o700 });
  const storage = s3(config);
  let lock;
  try {
    lock = await acquireRetentionLock(db);
    await assertQuiescent(db);
    const inventory = await databaseInventory(db);
    const objects = await storageInventory(storage);
    assertReferences(inventory, objects);
    await pg(db, 'pg_dump', ['--no-password', '--format=custom', '--no-owner', '--no-privileges', '--file', path.join(output, 'database.dump')]);
    await fsp.chmod(path.join(output, 'database.dump'), 0o600);
    await pg(db, 'pg_restore', ['--list', path.join(output, 'database.dump')]);
    const records = [];
    for (const object of objects) {
      const file = `objects/${sha(object.key)}.bin`;
      records.push({ key: object.key, file, ...await download(storage, object, path.join(output, file)) });
    }
    await assertQuiescent(db);
    if (JSON.stringify(await databaseInventory(db)) !== JSON.stringify(inventory) || JSON.stringify(await storageInventory(storage)) !== JSON.stringify(objects)) fail('Source changed during backup. Stop all writers and create a new backup.');
    lock.assertHeld();
    const manifest = { format: FORMAT, createdAt: new Date().toISOString(), consistency: 'operator-quiesced', sourceDatabase: db.fingerprint, sourceStorage: config.fingerprint,
      database: { file: 'database.dump', ...await hashFile(path.join(output, 'database.dump')) }, inventory, objects: records };
    const raw = JSON.stringify(manifest, null, 2) + '\n';
    await fsp.writeFile(path.join(output, 'manifest.json'), raw, { flag: 'wx', mode: 0o600 });
    // Published last: a partial run is never a verified backup.
    await fsp.writeFile(path.join(output, 'manifest.sha256'), sha(raw) + '\n', { flag: 'wx', mode: 0o600 });
    await verifyBackup(output);
    return { status: 'backup_verified', tables: inventory.tables.length, objects: records.length };
  } finally { storage.close(); if (lock) await lock.release(); }
}

async function restore(options, environment = process.env) {
  if (!options['confirm-quiescent']) fail('Explicit quiescence confirmation is required.');
  if (!options['confirm-private-target']) fail('Explicit target bucket privacy confirmation is required.');
  // Inspect every input byte before contacting or changing a destination.
  const { root, manifest } = await verifyBackup(options.backup);
  const db = databaseConfig(environment.RESTORE_DATABASE_URL, options['target-database'], options['pg-bin'], environment);
  const config = storageConfig(options, 'RESTORE', environment);
  if (manifest.sourceDatabase === db.fingerprint || manifest.sourceStorage === config.fingerprint) fail('Restore needs a different database and a different storage bucket.');
  const storage = s3(config);
  try {
    await assertEmptyDatabase(db);
    // Bucket must already exist and be empty; no automatic bucket creation or deletion.
    if ((await storageInventory(storage)).length) fail('Restore target bucket is not empty. No object will be overwritten.');
    await pg(db, 'pg_restore', ['--list', path.join(root, 'database.dump')]);
    if (!options.apply) return { status: 'restore_plan_verified', applyRequired: true, tables: manifest.inventory.tables.length, objects: manifest.objects.length };
    await probePrivateTarget(storage, config, manifest.objects);
    for (const object of manifest.objects) {
      const file = path.join(root, object.file);
      // Recheck bytes immediately before using them; only local, operator-owned backups are supported.
      const actual = await hashFile(file);
      if (actual.sha256 !== object.sha256 || actual.size !== object.size) fail('Backup changed during restore.');
      const body = fs.createReadStream(file);
      try { await storage.send('PutObjectCommand', { Key: object.key, Body: body, ContentLength: object.size, ContentType: object.contentType, IfNoneMatch: '*' }, OBJECT_TIMEOUT); }
      finally { body.destroy(); }
      if ((await download(storage, object)).sha256 !== object.sha256) fail('Restored object checksum mismatch.');
    }
    await assertEmptyDatabase(db);
    const dump = await hashFile(path.join(root, 'database.dump'));
    if (dump.sha256 !== manifest.database.sha256 || dump.size !== manifest.database.size) fail('Database dump changed during restore.');
    await pg(db, 'pg_restore', ['--no-password', '--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges', '--dbname', db.name, path.join(root, 'database.dump')]);
    const restored = await databaseInventory(db);
    if (JSON.stringify(restored) !== JSON.stringify(manifest.inventory)) fail('Restored database inventory differs. Keep the target offline.');
    const restoredObjects = await storageInventory(storage);
    const expected = [...manifest.objects].map(({ key, size }) => ({ key, size })).sort((a, b) => a.key.localeCompare(b.key, 'en'));
    if (JSON.stringify(restoredObjects.map(({ key, size }) => ({ key, size }))) !== JSON.stringify(expected)) fail('Restored bucket inventory differs. Keep the target offline.');
    for (const object of manifest.objects) if ((await download(storage, object)).sha256 !== object.sha256) fail('Restored object checksum differs. Keep the target offline.');
    assertReferences(restored, restoredObjects);
    return { status: 'restore_verified', tables: restored.tables.length, objects: restoredObjects.length };
  } finally { storage.close(); }
}

async function main(args = process.argv.slice(2), environment = process.env) {
  const options = parseArgs(args);
  const result = options.command === 'backup' ? await backup(options, environment)
    : options.command === 'restore' ? await restore(options, environment)
      : { status: 'backup_verified', objects: (await verifyBackup(options.backup)).manifest.objects.length };
  process.stdout.write(JSON.stringify(result) + '\n');
  return result;
}

module.exports = { parseArgs, databaseConfig, storageConfig, pg, sql, databaseInventory, storageInventory, assertEmptyDatabase, acquireRetentionLock, verifyBackup, backup, restore, download, probePrivateTarget, main, sha };
if (require.main === module) main().catch(error => {
  // AWS/OS errors may contain endpoints or paths. Known operator errors are deliberately generic.
  const message = error?.constructor === Error ? error.message : 'Backup operation failed; verify connectivity, permissions and private operator settings.';
  process.stderr.write(`${message}\n`); process.exitCode = 1;
});
