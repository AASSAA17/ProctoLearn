#!/usr/bin/env node
'use strict';
// The release profile never reads .env.local or adopts the owner's existing cluster.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { ensureLocalEnvironment, connectionUrl, native, postgresBin, run } = require('./local-launch.cjs');
const ROOT = path.resolve(__dirname, '..');
const DIRECTORY = path.join(ROOT, '.local', 'release-demo');
const MARKER = 'proctolearn-isolated-release-v1';
const backendRequire = createRequire(path.join(ROOT, 'backend/package.json'));
const roles = ['ADMIN', 'TEACHER', 'TEACHER', 'PROCTOR', 'PROCTOR', 'STUDENT', 'STUDENT', 'STUDENT'];
const handles = ['admin', 'teacher', 'teacher-other', 'proctor', 'proctor-appeal', 'student-new', 'student-progress', 'student-result'];
const privateWrite = (file, value) => fs.writeFileSync(file, value, { flag: 'wx', mode: 0o600 });

function prepare(directory = DIRECTORY) {
  const markerFile = path.join(directory, 'ownership.json');
  if (!fs.existsSync(markerFile)) {
    if (fs.existsSync(directory) && fs.readdirSync(directory).length) throw new Error('Unmarked release directory is not empty; refusing to adopt it.');
    fs.mkdirSync(directory, { recursive: true });
    privateWrite(markerFile, JSON.stringify({ kind: MARKER, id: randomUUID(), createdAt: new Date().toISOString() }) + '\n');
  }
  if (fs.lstatSync(directory).isSymbolicLink() || JSON.parse(fs.readFileSync(markerFile)).kind !== MARKER) throw new Error('Release ownership marker mismatch.');
  const hasCluster = fs.existsSync(path.join(directory, 'postgres', 'PG_VERSION'));
  if (hasCluster && (!fs.existsSync(path.join(directory, '.env.local')) || !fs.existsSync(path.join(directory, 'accounts.json')))) throw new Error('Existing release data has lost its private configuration/accounts file. Restore those files from private storage; no new credentials were generated.');
  const env = ensureLocalEnvironment(directory, 'release');
  if (env.POSTGRES_DB !== 'proctolearn_release' || env.POSTGRES_USER !== 'proctolearn_release' || env.MINIO_BUCKET !== 'proctolearn-release') throw new Error('Release database/bucket identity differs from its dedicated profile.');
  // These identities are scoped by this separate, newly initialized PostgreSQL cluster and S3 data directory.
  // Keep the shared native launcher's conservative localhost URL validation.
  const accountsFile = path.join(directory, 'accounts.json');
  if (!fs.existsSync(accountsFile)) privateWrite(accountsFile, JSON.stringify(handles.map((handle, index) => ({
    id: `demo-release-${handle}`, email: `${handle}@demo.proctolearn.test`, name: `Demo ${handle}`,
    role: roles[index], password: `Demo!9${randomBytes(24).toString('hex')}`,
  })), null, 2) + '\n');
  const accounts = JSON.parse(fs.readFileSync(accountsFile));
  if (accounts.length !== 8 || accounts.some((account, index) => account.id !== `demo-release-${handles[index]}` || account.email !== `${handles[index]}@demo.proctolearn.test` || account.role !== roles[index] || account.password.length < 16)) throw new Error('Private release account file is invalid; it was not replaced.');
  const accessFile = path.join(directory, 'DEMO_ACCESS.txt');
  if (!fs.existsSync(accessFile)) privateWrite(accessFile, 'PRIVATE fictional release accounts. Never commit or share.\nExisting account passwords are never reset by preparation.\n' + accounts.map(account => `${account.role} ${account.email} : ${account.password}`).join('\n') + '\n');
  return env;
}

function state() {
  const file = path.join(DIRECTORY, 'running.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null;
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
function requireMaintenance() {
  const active = state();
  if (!active || !alive(active.pid) || active.mode !== 'maintenance' || !active.ready) throw new Error('Stop the application, then run demo-release.cjs maintenance in another terminal first.');
}
async function start(env, maintenance, build, restored = false) {
  const active = state();
  if (active && alive(active.pid)) throw new Error('Release supervisor is already running. Use check or stop.');
  const stopFile = path.join(DIRECTORY, 'stop-request');
  if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
  const runningFile = path.join(DIRECTORY, 'running.json');
  const running = { pid: process.pid, mode: maintenance ? 'maintenance' : 'application', ready: false, restored, database: env.POSTGRES_DB, bucket: env.MINIO_BUCKET, startedAt: new Date().toISOString() };
  fs.writeFileSync(runningFile, JSON.stringify(running), { mode: 0o600 });
  try {
    await native({ ...env, ...optionalConfiguration() }, {
      localDir: DIRECTORY, controlDir: DIRECTORY, infrastructureOnly: maintenance, skipBuild: !build,
      mailCatcher: !maintenance, extraPorts: maintenance ? [] : [1025, 8025],
      noStorageAdmin: true,
      requireExistingResources: restored,
      seedScript: restored ? undefined : path.join(__dirname, 'demo-release-seed.cjs'),
      onReady: () => { running.ready = true; fs.writeFileSync(runningFile, JSON.stringify(running), { mode: 0o600 }); },
    });
  } finally {
    if (state()?.pid === process.pid) fs.unlinkSync(runningFile);
    if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
  }
}
function optionalConfiguration(settings = process.env) {
  // Explicit release settings only. No external credentials or inherited SMTP configuration.
  const aiProvider = settings.DEMO_AI_PROVIDER || 'ollama';
  if (!['ollama', 'off'].includes(aiProvider)) throw new Error('DEMO_AI_PROVIDER must be ollama or off.');
  return {
    SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025', SMTP_SECURE: 'false', SMTP_USER: '', SMTP_PASS: '',
    SMTP_FROM: 'demo@proctolearn.local',
    CERTIFICATE_PUBLIC_ORIGIN: settings.DEMO_PUBLIC_APP_URL || 'http://localhost:3000',
    AI_PROVIDER: aiProvider, OLLAMA_MODEL: 'qwen3:4b', OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
  };
}
async function stop() {
  const active = state();
  if (!active || !alive(active.pid)) { console.log('Release supervisor is not running; data was preserved.'); return; }
  fs.writeFileSync(path.join(DIRECTORY, 'stop-request'), 'stop\n', { mode: 0o600 });
  const until = Date.now() + 30000;
  while (Date.now() < until && state()?.pid === active.pid && alive(active.pid)) await new Promise(resolve => setTimeout(resolve, 250));
  if (state()?.pid === active.pid && alive(active.pid)) throw new Error('Supervisor did not stop within 30 seconds; inspect private release logs. No processes were force-killed.');
  console.log('Release services stopped. Database, storage and credentials preserved.');
}
async function check() {
  const active = state();
  if (!active || !alive(active.pid) || !active.ready) throw new Error('Release profile is not ready. Start it and inspect .local/release-demo/logs if needed.');
  const urls = active.mode === 'maintenance' ? ['http://127.0.0.1:9000/readyz'] : ['http://127.0.0.1:4000/ready', 'http://127.0.0.1:3000'];
  for (const url of urls) {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Readiness failed: HTTP ${response.status}`);
    await response.body?.cancel();
  }
  console.log(`PASS: isolated release ${active.mode} readiness. Optional AI is checked separately.`);
}
function safeName(name) {
  if (!/^[a-z][a-z0-9_-]{0,48}$/.test(name || '')) throw new Error('Use a backup name of lowercase letters, digits, underscore or hyphen (maximum 49 characters).');
  return name;
}
async function backup(env, name) {
  requireMaintenance(); safeName(name);
  const directory = path.join(DIRECTORY, 'backups'); fs.mkdirSync(directory, { recursive: true });
  const operatorDirectory = path.join(directory, `${name}-operator`);
  if (fs.existsSync(operatorDirectory)) throw new Error('Private operator backup already exists; choose a new backup name.');
  const result = await require('./backup-cli.cjs').backup({
    output: path.join(directory, name), 'source-database': env.POSTGRES_DB, 'source-bucket': env.MINIO_BUCKET,
    'source-s3-endpoint': 'http://127.0.0.1:9000', region: 'us-east-1', 'pg-bin': postgresBin(), 'confirm-quiescent': true,
  }, { ...process.env, BACKUP_DATABASE_URL: connectionUrl(env), BACKUP_S3_ACCESS_KEY_ID: env.MINIO_ROOT_USER, BACKUP_S3_SECRET_ACCESS_KEY: env.MINIO_ROOT_PASSWORD });
  operatorBackup(DIRECTORY, operatorDirectory);
  console.log(JSON.stringify({ ...result, operatorFiles: path.basename(operatorDirectory) }));
}
function operatorBackup(source, destination) {
  const required = ['ownership.json', '.env.local', 'accounts.json', 'DEMO_ACCESS.txt'];
  const optional = ['evidence/issued-certificate.pdf', 'evidence/certificate-acceptance.json', 'evidence/original-scenarios.json'];
  const files = [...required, ...optional.filter(file => fs.existsSync(path.join(source, file)))];
  const entries = files.map(file => {
    const sourceFile = path.join(source, file);
    if (!fs.lstatSync(sourceFile).isFile() || fs.lstatSync(sourceFile).nlink !== 1) throw new Error('Operator backup accepts regular private files only.');
    return { file, bytes: fs.readFileSync(sourceFile) };
  });
  fs.mkdirSync(destination, { mode: 0o700 });
  for (const entry of entries) {
    fs.mkdirSync(path.dirname(path.join(destination, entry.file)), { recursive: true, mode: 0o700 });
    privateWrite(path.join(destination, entry.file), entry.bytes);
  }
  privateWrite(path.join(destination, 'operator-manifest.json'), JSON.stringify({
    kind: 'proctolearn-private-operator-backup-v1', createdAt: new Date().toISOString(),
    files: entries.map(entry => ({ path: entry.file, size: entry.bytes.length, sha256: createHash('sha256').update(entry.bytes).digest('hex') })),
  }, null, 2) + '\n');
}
async function restore(env, name) {
  requireMaintenance(); safeName(name);
  const { verifyBackup, restore: restoreBackup } = require('./backup-cli.cjs');
  const source = path.join(DIRECTORY, 'backups', name);
  await verifyBackup(source);
  const suffix = randomBytes(6).toString('hex');
  const database = `release_restore_${suffix}`, bucket = `release-restore-${suffix}`;
  const pgEnvironment = { ...process.env, PGHOST: '127.0.0.1', PGPORT: '5433', PGUSER: env.POSTGRES_USER, PGPASSWORD: env.POSTGRES_PASSWORD };
  await run(path.join(postgresBin(), 'createdb.exe'), [database], { env: pgEnvironment });
  const sdk = backendRequire('@aws-sdk/client-s3');
  const client = new sdk.S3Client({ endpoint: 'http://127.0.0.1:9000', region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: env.MINIO_ROOT_USER, secretAccessKey: env.MINIO_ROOT_PASSWORD } });
  try { await client.send(new sdk.CreateBucketCommand({ Bucket: bucket })); } finally { client.destroy(); }
  // Preserve allocated targets on any failure for investigation; never delete or replace them.
  const targetFile = path.join(DIRECTORY, `restore-${suffix}.json`);
  privateWrite(targetFile, JSON.stringify({ database, bucket, source: name, status: 'allocated' }) + '\n');
  const result = await restoreBackup({ backup: source, 'target-database': database, 'target-bucket': bucket,
    'target-s3-endpoint': 'http://127.0.0.1:9000', region: 'us-east-1', 'pg-bin': postgresBin(),
    'confirm-quiescent': true, 'confirm-private-target': true, apply: true,
  }, { ...process.env, RESTORE_DATABASE_URL: connectionUrl({ ...env, POSTGRES_DB: database }), RESTORE_S3_ACCESS_KEY_ID: env.MINIO_ROOT_USER, RESTORE_S3_SECRET_ACCESS_KEY: env.MINIO_ROOT_PASSWORD });
  fs.writeFileSync(targetFile, JSON.stringify({ database, bucket, source: name, ...result }) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ ...result, targetRecord: path.basename(targetFile) }));
}
async function main(args = process.argv.slice(2)) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 15)) throw new Error('Use Node.js 24.15 or newer LTS.');
  const [command, value] = args;
  if (command === 'start-restored') {
    if (args.length !== 2 || !/^restore-[a-f0-9]{12}\.json$/.test(value || '')) throw new Error('Use start-restored restore-<suffix>.json from a verified restore.');
    const env = prepare();
    const target = JSON.parse(fs.readFileSync(path.join(DIRECTORY, value)));
    const suffix = value.slice(8, -5);
    if (target.status !== 'restore_verified' || target.database !== `release_restore_${suffix}` || target.bucket !== `release-restore-${suffix}`) throw new Error('Restore record does not describe a verified owned target.');
    return start({ ...env, POSTGRES_DB: target.database, MINIO_BUCKET: target.bucket }, false, false, true);
  }
  if (command === 'exec') {
    if (!['backend', 'frontend'].includes(value) || args.length < 3) throw new Error('Use exec backend|frontend NODE_ARGS...');
    const env = prepare();
    const active = state();
    if (!active?.ready || active.mode !== 'application' || !alive(active.pid)) throw new Error('Release application must be running before acceptance commands.');
    if (active.restored) throw new Error('Acceptance commands target the original demo only. Use the browser for a restored-target smoke check.');
    await run(process.execPath, args.slice(2), { cwd: path.join(ROOT, value), env: { ...process.env, ...env, ...optionalConfiguration(), DATABASE_URL: connectionUrl(env),
      E2E_ENV_FILE: path.join(DIRECTORY, '.env.local'), E2E_DISPOSABLE: 'true', TEST_PG_BIN: postgresBin() } });
    return;
  }
  if (!['prepare', 'start', 'check', 'stop', 'maintenance', 'backup', 'restore'].includes(command) || args.length > 2 || (value && !['start', 'backup', 'restore'].includes(command)) || (command === 'start' && value && value !== '--build')) throw new Error('Usage: node scripts/demo-release.cjs prepare|start [--build]|check|stop|maintenance|backup NAME|restore NAME');
  if (command === 'stop') return stop();
  if (command === 'check') return check();
  const env = prepare();
  const disk = fs.statfsSync(DIRECTORY);
  if (disk.bavail * disk.bsize < 1024 ** 3) throw new Error('Release profile needs at least 1 GiB free disk space; free space before starting or backing up.');
  if (command === 'prepare') { console.log('Private release profile prepared in .local/release-demo. Accounts: DEMO_ACCESS.txt. Existing owner data unchanged.'); return; }
  if (command === 'start' || command === 'maintenance') return start(env, command === 'maintenance', value === '--build');
  if (command === 'backup') return backup(env, value);
  if (command === 'restore') return restore(env, value);
}
module.exports = { prepare, safeName, optionalConfiguration, operatorBackup, main };
if (require.main === module) main().catch(error => { console.error(error.constructor === Error ? error.message : 'Release operation failed. Check prerequisites, command arguments and private .local/release-demo/logs. No data was reset.'); process.exitCode = 1; });
