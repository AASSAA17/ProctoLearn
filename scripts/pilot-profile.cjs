#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const { parseEnv } = require('node:util');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { once } = require('node:events');
const { native, connectionUrl, npmCli, postgresBin, run } = require('./local-launch.cjs');
const { createPilotProxy } = require('./pilot-proxy.cjs');

const ROOT = path.resolve(__dirname, '..');
const DIRECTORY = path.join(ROOT, '.local', 'pilot');
const MARKER = 'proctolearn-controlled-pilot-v1';
const PORTS = Object.freeze({ proxy: 3200, web: 3100, api: 4100, postgres: 5434, s3: 9100, s3grpc: 29100, master: 19433, volume: 19440, filer: 18988 });
const backendRequire = createRequire(path.join(ROOT, 'backend/package.json'));
const privateWrite = (file, value) => fs.writeFileSync(file, value, { flag: 'wx', mode: 0o600 });
const secret = () => randomBytes(32).toString('base64url');

function ngrokTrafficPolicy(gatewaySecret) {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(gatewaySecret || '')) throw new Error('Gateway secret is invalid.');
  return [
    '# PRIVATE generated policy. It contains the pilot gateway secret.',
    'on_http_request:',
    '  - actions:',
    '      - type: remove-headers',
    '        config:',
    '          headers:',
    '            - x-proctolearn-gateway',
    '            - x-proctolearn-client-ip',
    '      - type: add-headers',
    '        config:',
    '          headers:',
    `            x-proctolearn-gateway: "${gatewaySecret}"`,
    '            x-proctolearn-client-ip: "${conn.client_ip}"',
    '',
  ].join('\n');
}

function ownedDirectory() {
  const markerFile = path.join(DIRECTORY, 'ownership.json');
  if (!fs.existsSync(markerFile)) return false;
  const stat = fs.lstatSync(DIRECTORY);
  return !stat.isSymbolicLink() && JSON.parse(fs.readFileSync(markerFile, 'utf8')).kind === MARKER;
}

function validateEnvironment(env) {
  const exact = { POSTGRES_USER: 'proctolearn_pilot', POSTGRES_DB: 'proctolearn_pilot', MINIO_ROOT_USER: 'proctolearn-pilot', MINIO_BUCKET: 'proctolearn-pilot' };
  for (const [key, value] of Object.entries(exact)) if (env[key] !== value) throw new Error(`Private pilot ${key} identity mismatch.`);
  for (const key of ['POSTGRES_PASSWORD', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'MINIO_ROOT_PASSWORD', 'PILOT_GATEWAY_SECRET']) if ((env[key] || '').length < 43) throw new Error(`Private pilot ${key} is missing or too short.`);
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) throw new Error('Pilot JWT keys must differ.');
  return env;
}

function prepare() {
  const markerFile = path.join(DIRECTORY, 'ownership.json');
  if (!fs.existsSync(markerFile)) {
    if (fs.existsSync(DIRECTORY) && fs.readdirSync(DIRECTORY).length) throw new Error('Unmarked pilot directory is not empty; refusing to adopt it.');
    fs.mkdirSync(DIRECTORY, { recursive: true });
    privateWrite(markerFile, JSON.stringify({ kind: MARKER, id: randomUUID(), createdAt: new Date().toISOString() }) + '\n');
  }
  if (!ownedDirectory()) throw new Error('Pilot ownership marker mismatch.');
  const envFile = path.join(DIRECTORY, '.env.local');
  if (!fs.existsSync(envFile)) privateWrite(envFile, [
    '# Private isolated controlled-pilot environment. Never commit or share.',
    'POSTGRES_USER=proctolearn_pilot', 'POSTGRES_DB=proctolearn_pilot', `POSTGRES_PASSWORD=${secret()}`,
    `JWT_ACCESS_SECRET=${secret()}`, `JWT_REFRESH_SECRET=${secret()}`, 'JWT_ACCESS_EXPIRES_IN=15m', 'JWT_REFRESH_EXPIRES_IN=7d',
    'MINIO_ROOT_USER=proctolearn-pilot', `MINIO_ROOT_PASSWORD=${secret()}`, 'MINIO_BUCKET=proctolearn-pilot',
    'MINIO_ENDPOINT=127.0.0.1', `MINIO_PORT=${PORTS.s3}`, 'MINIO_USE_SSL=false', 'MINIO_REGION=us-east-1', `MINIO_PUBLIC_URL=http://127.0.0.1:${PORTS.s3}`,
    `API_PORT=${PORTS.api}`, 'PILOT_MODE=true', 'PILOT_MAX_PARTICIPANTS=10', 'PILOT_DEFAULT_COURSE_SEATS=10', 'PILOT_PUBLIC_SIGNUP=false',
    `PILOT_GATEWAY_SECRET=${secret()}`, 'ALLOW_DEMO_SEED=false', '',
  ].join('\n'));
  const env = validateEnvironment(parseEnv(fs.readFileSync(envFile, 'utf8')));
  fs.writeFileSync(path.join(DIRECTORY, 'ngrok-traffic-policy.yml'), ngrokTrafficPolicy(env.PILOT_GATEWAY_SECRET), { mode: 0o600 });
  const accountsFile = path.join(DIRECTORY, 'accounts.json');
  if (!fs.existsSync(accountsFile)) privateWrite(accountsFile, JSON.stringify([{
    id: 'pilot-owner', email: 'owner@pilot.proctolearn.test', name: 'Arsen · Pilot owner', role: 'ADMIN', password: `Pilot!9${randomBytes(32).toString('base64url')}`,
  }], null, 2) + '\n');
  const accounts = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
  if (accounts.length !== 1 || accounts[0].id !== 'pilot-owner' || accounts[0].email !== 'owner@pilot.proctolearn.test' || accounts[0].role !== 'ADMIN' || accounts[0].password.length < 40) throw new Error('Private pilot owner account file is invalid; it was preserved.');
  const access = path.join(DIRECTORY, 'PILOT_ACCESS.txt');
  if (!fs.existsSync(access)) privateWrite(access, `PRIVATE pilot owner account. Never commit or send in chat.\n${accounts[0].email} : ${accounts[0].password}\n`);
  return env;
}

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('Cannot establish the source revision.');
  return result.stdout;
}

function sourceRevision() {
  const head = git(['rev-parse', 'HEAD']).trim();
  const status = git(['status', '--porcelain=v1', '--untracked-files=all']);
  const diff = git(['diff', '--binary', 'HEAD', '--', 'backend', 'frontend', 'scripts', 'package.json']);
  const untracked = status.split(/\r?\n/).filter(line => line.startsWith('?? ')).map(line => line.slice(3)).filter(file => /^(?:backend|frontend|scripts)\//.test(file)).sort();
  const hash = createHash('sha256').update(head).update('\0').update(diff);
  for (const file of untracked) hash.update('\0').update(file).update('\0').update(fs.readFileSync(path.join(ROOT, file)));
  return { head, dirty: Boolean(diff || untracked.length), fingerprint: hash.digest('hex') };
}

function unresolvedCompiledAliases(directory) {
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (entry.isFile() && entry.name.endsWith('.js') && /require\(["']@\//.test(fs.readFileSync(file, 'utf8'))) return file;
    }
  }
  return null;
}

function candidateFile() { return path.join(DIRECTORY, 'candidate.json'); }
function activeFile() { return path.join(DIRECTORY, 'active-build.json'); }
function readRecord(file, label) {
  if (!fs.existsSync(file)) throw new Error(`${label} is absent. Run validate-update first.`);
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!/^[a-f0-9]{16}$/.test(record.id || '') || record.status !== 'validated') throw new Error(`${label} record is invalid.`);
  return record;
}

function promotionBackupEligible(backup, release, lastRun) {
  if (!backup || backup.status !== 'backup_verified' || backup.release !== release || !Number.isFinite(Date.parse(backup.createdAt || ''))) return false;
  if (!lastRun || lastRun.release !== release) return true;
  const boundary = Date.parse(lastRun.stoppedAt || lastRun.startedAt || '');
  return Number.isFinite(boundary) && Date.parse(backup.createdAt) > boundary;
}

async function validateUpdate(env = prepare()) {
  if (running()?.pid && alive(running().pid)) throw new Error('Stop the pilot before validating a new build.');
  const revision = sourceRevision();
  const id = revision.fingerprint.slice(0, 16);
  const buildRoot = path.join(DIRECTORY, 'builds', id);
  const frontendDist = path.join(ROOT, 'frontend', '.next-pilot', id);
  // Keep the executable below backend so ordinary Node module resolution can
  // reach backend/node_modules without changing the accepted backend/dist.
  const backendDist = path.join(ROOT, 'backend', '.dist-pilot', id);
  const manifest = path.join(buildRoot, 'manifest.json');
  if (fs.existsSync(manifest)) {
    const existing = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    if (existing.status !== 'validated' || existing.fingerprint !== revision.fingerprint) throw new Error('Existing candidate directory does not match its source fingerprint.');
    if (!fs.existsSync(existing.backendEntry) || !fs.existsSync(path.join(ROOT, 'frontend', existing.frontendDist, 'BUILD_ID'))) {
      throw new Error('Validated candidate artifacts are incomplete. Preserve the record and validate a new source revision.');
    }
    fs.writeFileSync(candidateFile(), JSON.stringify(existing, null, 2) + '\n', { mode: 0o600 });
    console.log(`Candidate ${id} was already validated; no running release was changed.`); return existing;
  }
  fs.mkdirSync(buildRoot, { recursive: true });
  const cli = await npmCli();
  const buildEnv = { ...process.env, ...env, DATABASE_URL: connectionUrl(env, PORTS.postgres), NODE_ENV: 'production', INTERNAL_API_ORIGIN: `http://127.0.0.1:${PORTS.api}` };
  // A running accepted demo can hold Prisma's Windows query engine DLL open.
  // Reuse only a generated client that demonstrably contains the current pilot
  // models; otherwise fail before touching the known-good backend/dist.
  const generatedTypes = path.join(ROOT, 'backend', 'node_modules', '.prisma', 'client', 'index.d.ts');
  const generated = fs.existsSync(generatedTypes) ? fs.readFileSync(generatedTypes, 'utf8') : '';
  if (!generated.includes('PilotInvitation') || !generated.includes('PilotMembership')) throw new Error('Prisma client is stale. Stop the accepted demo during maintenance, run prisma:generate, then retry validation.');
  const allowedBuildRoot = path.join(ROOT, 'backend', '.dist-pilot') + path.sep;
  if (!path.resolve(backendDist).startsWith(allowedBuildRoot)) throw new Error('Pilot backend output escaped its owned build directory.');
  fs.rmSync(backendDist, { recursive: true, force: true });
  await run(process.execPath, [path.join(ROOT, 'backend', 'node_modules', 'typescript', 'bin', 'tsc'),
    '--project', path.join(ROOT, 'backend', 'tsconfig.json'), '--outDir', backendDist, '--rootDir', path.join(ROOT, 'backend'),
    '--incremental', 'false', '--sourceMap', 'false'], { cwd: path.join(ROOT, 'backend'), env: buildEnv });
  const backendEntry = path.join(backendDist, 'src', 'main.js');
  if (!fs.existsSync(backendEntry)) throw new Error('Pilot backend build did not produce its isolated entrypoint.');
  const unresolvedAlias = unresolvedCompiledAliases(backendDist);
  if (unresolvedAlias) throw new Error(`Pilot backend build contains a runtime-unresolved path alias in ${path.relative(ROOT, unresolvedAlias)}.`);
  const relativeFrontendDist = path.relative(path.join(ROOT, 'frontend'), frontendDist).replaceAll('\\', '/');
  const generatedConfigFiles = ['next-env.d.ts', 'tsconfig.json'].map(file => ({ file: path.join(ROOT, 'frontend', file), bytes: fs.readFileSync(path.join(ROOT, 'frontend', file)) }));
  try {
    await run(process.execPath, [cli, 'run', 'build'], { cwd: path.join(ROOT, 'frontend'), env: { ...buildEnv, NEXT_DIST_DIR: relativeFrontendDist,
      NEXT_PUBLIC_API_URL: '/api', NEXT_PUBLIC_WS_URL: '', NEXT_PUBLIC_PILOT_MODE: 'true', NEXT_PUBLIC_RELEASE_LABEL: `pilot-${id}` } });
  } finally {
    // Next rewrites these tracked helper files for a custom distDir. Restore the
    // exact pre-build bytes so validation cannot alter the working source tree.
    for (const entry of generatedConfigFiles) fs.writeFileSync(entry.file, entry.bytes);
  }
  const record = { kind: 'proctolearn-pilot-build-v1', id, status: 'validated', head: revision.head, dirty: revision.dirty,
    fingerprint: revision.fingerprint, createdAt: new Date().toISOString(), backendEntry, frontendDist: relativeFrontendDist };
  privateWrite(manifest, JSON.stringify(record, null, 2) + '\n');
  fs.writeFileSync(candidateFile(), JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
  console.log(`Candidate ${id} built and validated locally. Run promote explicitly; the active pilot was not changed.`);
  return record;
}

function running() {
  const file = path.join(DIRECTORY, 'running.json');
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }

function promote() {
  prepare();
  const state = running();
  if (state && alive(state.pid)) throw new Error('Stop the pilot before promotion.');
  const candidate = readRecord(candidateFile(), 'Candidate');
  const previous = fs.existsSync(activeFile()) ? readRecord(activeFile(), 'Active build') : null;
  const hasData = fs.existsSync(path.join(DIRECTORY, 'postgres', 'PG_VERSION'));
  if (hasData && previous && previous.id !== candidate.id) {
    const backup = path.join(DIRECTORY, 'last-backup.json');
    const record = fs.existsSync(backup) ? JSON.parse(fs.readFileSync(backup, 'utf8')) : null;
    const lastRunFile = path.join(DIRECTORY, 'last-run.json');
    const lastRun = fs.existsSync(lastRunFile) ? JSON.parse(fs.readFileSync(lastRunFile, 'utf8')) : null;
    if (!promotionBackupEligible(record, previous.id, lastRun)) throw new Error('Create a verified pilot backup after the latest stopped session before promotion.');
  }
  fs.writeFileSync(activeFile(), JSON.stringify(candidate, null, 2) + '\n', { mode: 0o600 });
  console.log(`Promoted pilot build ${candidate.id}. Start is still an explicit separate action.`);
}

function publicOrigin(settings = process.env) {
  const raw = settings.PILOT_PUBLIC_APP_URL || `http://127.0.0.1:${PORTS.proxy}`;
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('PILOT_PUBLIC_APP_URL must be one exact HTTP(S) origin.');
  if (url.protocol === 'http:' && url.origin !== `http://127.0.0.1:${PORTS.proxy}`) throw new Error('Non-local pilot origin must use HTTPS.');
  return url.origin;
}

function runtimeEnvironment(env, origin) {
  const production = origin.startsWith('https://');
  return { ...env, NODE_ENV: production ? 'production' : 'development', FRONTEND_URL: origin,
    CERTIFICATE_PUBLIC_ORIGIN: origin, TRUSTED_PROXIES: '127.0.0.1/32,::1/128', AI_PROVIDER: 'off',
    INTERNAL_API_ORIGIN: `http://127.0.0.1:${PORTS.api}`,
    SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '', SMTP_PASS: '', SMTP_FROM: '',
    MINIO_PUBLIC_URL: `http://127.0.0.1:${PORTS.s3}`, PILOT_MODE: 'true', PILOT_MAX_PARTICIPANTS: '10', PILOT_DEFAULT_COURSE_SEATS: '10', PILOT_PUBLIC_SIGNUP: 'false' };
}

async function start(env = prepare()) {
  const active = readRecord(activeFile(), 'Active build');
  const current = running();
  if (current && alive(current.pid)) throw new Error('Pilot supervisor is already running. Use status or stop.');
  const origin = publicOrigin();
  const startedAt = new Date().toISOString();
  const state = { kind: MARKER, pid: process.pid, startedAt, ready: false, release: active.id, origin, database: env.POSTGRES_DB, bucket: env.MINIO_BUCKET };
  const stateFile = path.join(DIRECTORY, 'running.json');
  const stopFile = path.join(DIRECTORY, 'stop-request');
  if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
  const lastRunFile = path.join(DIRECTORY, 'last-run.json');
  fs.writeFileSync(lastRunFile, JSON.stringify({ release: active.id, startedAt, status: 'starting' }, null, 2) + '\n', { mode: 0o600 });
  let proxy;
  try {
    await native(runtimeEnvironment(env, origin), { localDir: DIRECTORY, controlDir: DIRECTORY, controlToken: `${process.pid}@${startedAt}`,
      pgPort: PORTS.postgres, apiPort: PORTS.api, webPort: PORTS.web, storagePorts: { s3: PORTS.s3, s3grpc: PORTS.s3grpc, master: PORTS.master, volume: PORTS.volume, filer: PORTS.filer },
      extraPorts: [PORTS.proxy], noStorageAdmin: true, skipBuild: true, backendEntry: active.backendEntry,
      frontendRuntimeEnv: { NEXT_DIST_DIR: active.frontendDist, NEXT_PUBLIC_API_URL: '/api', NEXT_PUBLIC_WS_URL: '', NEXT_PUBLIC_PILOT_MODE: 'true', NEXT_PUBLIC_RELEASE_LABEL: `pilot-${active.id}` },
      storageAllowedOrigin: origin, seedScript: path.join(__dirname, 'pilot-seed.cjs'), seedEnv: { PILOT_PROFILE_DIR: DIRECTORY },
      onReady: async () => {
        proxy = createPilotProxy({ publicOrigin: origin, gatewaySecret: env.PILOT_GATEWAY_SECRET });
        proxy.listen(PORTS.proxy, '127.0.0.1'); await once(proxy, 'listening');
        const response = await fetch(`${origin.startsWith('https:') ? `http://127.0.0.1:${PORTS.proxy}` : origin}/`, { headers: origin.startsWith('https:') ? { 'x-proctolearn-gateway': env.PILOT_GATEWAY_SECRET, 'x-proctolearn-client-ip': '127.0.0.1' } : {}, signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error('Pilot proxy readiness failed.'); await response.body?.cancel();
        state.ready = true; fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
        console.log(`Controlled pilot ${active.id} is ready on ${origin}. Public forwarding is not started by this command.`);
      } });
  } finally {
    fs.writeFileSync(lastRunFile, JSON.stringify({ release: active.id, startedAt, stoppedAt: new Date().toISOString(), status: 'stopped' }, null, 2) + '\n', { mode: 0o600 });
    if (proxy) { proxy.closeAllConnections?.(); await new Promise(resolve => proxy.close(resolve)); }
    if (running()?.pid === process.pid) fs.unlinkSync(stateFile);
    if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
  }
}

async function stop(expected) {
  prepare(); const state = running();
  if (!state || !alive(state.pid)) { console.log('Pilot is stopped; persistent data was preserved.'); return; }
  const identity = `${state.pid}@${state.startedAt}`;
  if (expected && expected !== identity) throw new Error('Pilot session changed; conditional stop refused.');
  fs.writeFileSync(path.join(DIRECTORY, 'stop-request'), identity + '\n', { mode: 0o600 });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && running()?.pid === state.pid && alive(state.pid)) await new Promise(resolve => setTimeout(resolve, 250));
  if (running()?.pid === state.pid && alive(state.pid)) throw new Error('Pilot did not stop in 30 seconds; no process was force-killed.');
  console.log('Pilot stopped. Database, storage, invitations and progress were preserved.');
}

async function status(env = prepare()) {
  const state = running();
  if (!state || !alive(state.pid) || !state.ready) throw new Error('Pilot is not ready.');
  const headers = state.origin.startsWith('https:') ? { 'x-proctolearn-gateway': env.PILOT_GATEWAY_SECRET, 'x-proctolearn-client-ip': '127.0.0.1' } : {};
  for (const url of [`http://127.0.0.1:${PORTS.api}/ready`, `http://127.0.0.1:${PORTS.proxy}/`]) {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Pilot readiness failed with HTTP ${response.status}.`); await response.body?.cancel();
  }
  console.log(JSON.stringify({ status: 'ready', release: state.release, origin: state.origin, database: state.database, bucket: state.bucket }));
}

function safeName(value) {
  if (!/^[a-z][a-z0-9_-]{0,48}$/.test(value || '')) throw new Error('Backup name must use lowercase letters, digits, underscore or hyphen.');
  return value;
}

async function withMaintenance(env, work) {
  const state = running(); if (state && alive(state.pid)) throw new Error('Stop the pilot before backup or restore check.');
  const startedAt = new Date().toISOString();
  const controlDir = path.join(DIRECTORY, 'maintenance'); fs.mkdirSync(controlDir, { recursive: true });
  const token = `${process.pid}@${startedAt}`; const stopFile = path.join(controlDir, 'stop-request'); if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
  let result;
  await native(runtimeEnvironment(env, `http://127.0.0.1:${PORTS.proxy}`), { localDir: DIRECTORY, controlDir, controlToken: token,
    infrastructureOnly: true, skipBuild: true, pgPort: PORTS.postgres, storagePorts: { s3: PORTS.s3, s3grpc: PORTS.s3grpc, master: PORTS.master, volume: PORTS.volume, filer: PORTS.filer }, noStorageAdmin: true,
    onReady: async () => { try { result = await work(); } finally { fs.writeFileSync(stopFile, token + '\n', { mode: 0o600 }); } } });
  if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
  return result;
}

async function backup(env, name) {
  safeName(name); const active = readRecord(activeFile(), 'Active build');
  return withMaintenance(env, async () => {
    const output = path.join(DIRECTORY, 'backups', name); fs.mkdirSync(path.dirname(output), { recursive: true });
    const result = await require('./backup-cli.cjs').backup({ output, 'source-database': env.POSTGRES_DB, 'source-bucket': env.MINIO_BUCKET,
      'source-s3-endpoint': `http://127.0.0.1:${PORTS.s3}`, region: 'us-east-1', 'pg-bin': postgresBin(), 'confirm-quiescent': true },
    { ...process.env, BACKUP_DATABASE_URL: connectionUrl(env, PORTS.postgres), BACKUP_S3_ACCESS_KEY_ID: env.MINIO_ROOT_USER, BACKUP_S3_SECRET_ACCESS_KEY: env.MINIO_ROOT_PASSWORD });
    const operator = `${output}-operator`; fs.mkdirSync(operator, { mode: 0o700 });
    for (const file of ['ownership.json', '.env.local', 'accounts.json', 'PILOT_ACCESS.txt', 'active-build.json']) await fsp.copyFile(path.join(DIRECTORY, file), path.join(operator, file), fs.constants.COPYFILE_EXCL);
    const record = { status: 'backup_verified', release: active.id, name, createdAt: new Date().toISOString(), tables: result.tables, objects: result.objects };
    fs.writeFileSync(path.join(DIRECTORY, 'last-backup.json'), JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(record)); return record;
  });
}

async function restoreCheck(env, name) {
  safeName(name);
  return withMaintenance(env, async () => {
    const source = path.join(DIRECTORY, 'backups', name);
    const suffix = randomBytes(6).toString('hex'); const database = `pilot_restore_${suffix}`, bucket = `pilot-restore-${suffix}`;
    const pgEnv = { ...process.env, PGHOST: '127.0.0.1', PGPORT: String(PORTS.postgres), PGUSER: env.POSTGRES_USER, PGPASSWORD: env.POSTGRES_PASSWORD };
    await run(path.join(postgresBin(), 'createdb.exe'), [database], { env: pgEnv });
    const sdk = backendRequire('@aws-sdk/client-s3');
    const client = new sdk.S3Client({ endpoint: `http://127.0.0.1:${PORTS.s3}`, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: env.MINIO_ROOT_USER, secretAccessKey: env.MINIO_ROOT_PASSWORD } });
    try { await client.send(new sdk.CreateBucketCommand({ Bucket: bucket })); } finally { client.destroy(); }
    const result = await require('./backup-cli.cjs').restore({ backup: source, 'target-database': database, 'target-bucket': bucket,
      'target-s3-endpoint': `http://127.0.0.1:${PORTS.s3}`, region: 'us-east-1', 'pg-bin': postgresBin(), 'confirm-quiescent': true, 'confirm-private-target': true, apply: true },
    { ...process.env, RESTORE_DATABASE_URL: connectionUrl({ ...env, POSTGRES_DB: database }, PORTS.postgres), RESTORE_S3_ACCESS_KEY_ID: env.MINIO_ROOT_USER, RESTORE_S3_SECRET_ACCESS_KEY: env.MINIO_ROOT_PASSWORD });
    const record = { ...result, database, bucket, source: name, createdAt: new Date().toISOString() };
    privateWrite(path.join(DIRECTORY, `restore-${suffix}.json`), JSON.stringify(record, null, 2) + '\n');
    console.log(JSON.stringify(record)); return record;
  });
}

async function main(args = process.argv.slice(2)) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 15)) throw new Error('Use Node.js 24.15 or newer LTS.');
  const [command, value] = args;
  if (!['prepare', 'validate-update', 'promote', 'start', 'status', 'stop', 'backup', 'restore-check'].includes(command) || args.length > 2 || (value && !['backup', 'restore-check'].includes(command))) throw new Error('Usage: node scripts/pilot-profile.cjs prepare|validate-update|promote|start|status|stop|backup NAME|restore-check NAME');
  if (command === 'prepare') { prepare(); console.log('Private isolated pilot profile prepared. Owner access is in .local/pilot/PILOT_ACCESS.txt.'); return; }
  if (command === 'validate-update') return validateUpdate();
  if (command === 'promote') return promote();
  if (command === 'start') return start();
  if (command === 'status') return status();
  if (command === 'stop') return stop();
  const env = prepare();
  if (command === 'backup') return backup(env, value);
  return restoreCheck(env, value);
}

module.exports = { ROOT, DIRECTORY, MARKER, PORTS, validateEnvironment, ngrokTrafficPolicy, prepare, sourceRevision, unresolvedCompiledAliases, publicOrigin, runtimeEnvironment, promotionBackupEligible, safeName, validateUpdate, promote, start, stop, status, backup, restoreCheck, main };
if (require.main === module) main().catch((error) => { console.error(error?.constructor === Error ? error.message : 'Pilot operation failed. Private data was preserved.'); process.exitCode = 1; });
