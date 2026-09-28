// Separate local environment: never imports the old .env or adopts an existing Docker volume.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { randomBytes, createHash } = require('node:crypto');
const { parseEnv } = require('node:util');
const ROOT = path.resolve(__dirname, '..');
const LOCAL = path.join(ROOT, '.local');
const secret = () => randomBytes(32).toString('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function ensureLocalEnvironment(root = ROOT) {
  const file = path.join(root, '.env.local');
  if (!fs.existsSync(file)) {
    const values = {
      POSTGRES_USER: 'proctolearn_local', POSTGRES_DB: 'proctolearn_local', POSTGRES_PASSWORD: secret(),
      JWT_ACCESS_SECRET: secret(), JWT_REFRESH_SECRET: secret(), JWT_ACCESS_EXPIRES_IN: '15m', JWT_REFRESH_EXPIRES_IN: '7d',
      MINIO_ROOT_USER: 'proctolearn-local', MINIO_ROOT_PASSWORD: secret(), MINIO_BUCKET: 'proctolearn-local',
      MINIO_ENDPOINT: '127.0.0.1', MINIO_PORT: '9000', MINIO_USE_SSL: 'false', MINIO_REGION: 'us-east-1', MINIO_PUBLIC_URL: 'http://localhost:9000',
      API_PORT: '4000', NODE_ENV: 'development', FRONTEND_URL: 'http://localhost:3000',
      NEXT_PUBLIC_API_URL: 'http://localhost:4000', NEXT_PUBLIC_WS_URL: 'ws://localhost:4000',
      ALLOW_DEMO_SEED: 'false',
      ...Object.fromEntries(['ADMIN', 'TEACHER', 'STUDENT', 'PROCTOR'].map(role => [`DEMO_${role}_PASSWORD`, `Local!!12${secret().slice(0, 48)}`])),
    };
    fs.writeFileSync(file, '# Private isolated local environment. Do not commit or share.\n' + Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''), { flag: 'wx', mode: 0o600 });
  }
  const env = parseEnv(fs.readFileSync(file, 'utf8'));
  for (const key of ['POSTGRES_USER', 'POSTGRES_DB']) if (!/^[a-z][a-z0-9_]{0,62}$/.test(env[key] || '')) throw new Error(`Invalid ${key} in .env.local`);
  for (const key of ['POSTGRES_PASSWORD', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'MINIO_ROOT_PASSWORD']) if ((env[key] || '').length < 32) throw new Error(`Set a private random ${key} of at least 32 characters in .env.local`);
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) throw new Error('JWT keys in .env.local must be different');
  if (env.NODE_ENV !== 'development' || env.FRONTEND_URL !== 'http://localhost:3000' || env.NEXT_PUBLIC_API_URL !== 'http://localhost:4000' || env.NEXT_PUBLIC_WS_URL !== 'ws://localhost:4000' || env.MINIO_PUBLIC_URL !== 'http://localhost:9000' || !['127.0.0.1', 'localhost'].includes(env.MINIO_ENDPOINT) || env.MINIO_PORT !== '9000' || env.MINIO_USE_SSL !== 'false' || env.API_PORT !== '4000') throw new Error('This launcher requires its isolated localhost configuration; use the deployment runbook for other targets');
  return env;
}

function connectionUrl(env) {
  return `postgresql://${encodeURIComponent(env.POSTGRES_USER)}:${encodeURIComponent(env.POSTGRES_PASSWORD)}@127.0.0.1:5433/${env.POSTGRES_DB}`;
}

async function downloadVerified(url, file, algorithm, expected, encoding = 'hex') {
  if (fs.existsSync(file) && createHash(algorithm).update(fs.readFileSync(file)).digest(encoding) === expected) return;
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`Tool download failed: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash(algorithm).update(bytes).digest(encoding) !== expected) throw new Error('Tool checksum mismatch');
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, bytes, { mode: 0o600 });
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, windowsHide: true, stdio: 'inherit', ...options });
    child.once('error', () => reject(new Error(`Cannot start ${path.basename(command)}`)));
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} failed (exit ${code})`)));
  });
}

async function npmCli() {
  const tools = path.join(LOCAL, 'tools', 'npm-12.1.0');
  const cli = path.join(tools, 'package', 'bin', 'npm-cli.js');
  if (fs.existsSync(cli)) return cli;
  const archive = path.join(LOCAL, 'tools', 'npm-12.1.0.tgz');
  await downloadVerified('https://registry.npmjs.org/npm/-/npm-12.1.0.tgz', archive, 'sha512', 'Fyhu62pNx70YCs/5+dEmJQTFVmSKwvo5CA0qvBkGDRpob42MJ6G2RQ2tdxeKM4nYnIZDqkYAxEgqtoejn9QGtQ==', 'base64');
  await fsp.mkdir(tools, { recursive: true });
  await run('tar.exe', ['-xzf', archive, '-C', tools]);
  return cli;
}

async function storageBinary() {
  const tools = path.join(LOCAL, 'tools', 'seaweedfs-4.47');
  const executable = path.join(tools, 'weed.exe');
  if (fs.existsSync(executable)) return executable;
  const archive = path.join(LOCAL, 'tools', 'seaweedfs-4.47.zip');
  await downloadVerified('https://github.com/seaweedfs/seaweedfs/releases/download/4.47/windows_amd64.zip', archive, 'sha256', '8809359079e62fcd60574ff661449160899622c52072f3f569d346669079efe9');
  await fsp.mkdir(tools, { recursive: true });
  await run('tar.exe', ['-xf', archive, '-C', tools]);
  return executable;
}

function postgresBin() {
  if (process.env.POSTGRES_BIN && fs.existsSync(path.join(process.env.POSTGRES_BIN, 'pg_ctl.exe'))) return process.env.POSTGRES_BIN;
  const base = path.join(process.env.ProgramFiles || 'C:/Program Files', 'PostgreSQL');
  const versions = fs.existsSync(base) ? fs.readdirSync(base).filter(v => /^\d+$/.test(v)).sort((a, b) => Number(b) - Number(a)) : [];
  const version = versions.find(v => fs.existsSync(path.join(base, v, 'bin', 'pg_ctl.exe')));
  if (!version) throw new Error('Native launch needs PostgreSQL 16 or newer. Install PostgreSQL or use Docker Desktop.');
  if (Number(version) < 16) throw new Error('PostgreSQL 16 or newer is required');
  return path.join(base, version, 'bin');
}

async function assertPortsFree(ports) {
  for (const port of ports) await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Local port ${port} is in use. Stop that service yourself or use the existing instance.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

async function waitReady(url, child, milliseconds = 120000) {
  const until = Date.now() + milliseconds;
  while (Date.now() < until) {
    if (child && child.exitCode !== null) throw new Error('A local service exited. See .local/logs.');
    try { const response = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (response.ok) return; } catch {}
    await sleep(500);
  }
  throw new Error(`Local readiness timed out for ${new URL(url).pathname}. See .local/logs.`);
}

function demoAccess(env) {
  const output = ['Private demo account passwords. Never commit or share this file.', ...['ADMIN', 'TEACHER', 'STUDENT', 'PROCTOR'].map(role => `${role.toLowerCase()}@proctolearn.kz : ${env[`DEMO_${role}_PASSWORD`]}`)].join('\n');
  fs.writeFileSync(path.join(LOCAL, 'DEMO_ACCESS.txt'), output + '\n', { mode: 0o600 });
  console.log('Demo logins are saved privately in .local/DEMO_ACCESS.txt');
}

async function native(env, options) {
  if (process.platform !== 'win32') throw new Error('Use Docker Compose on this platform; the native helper is for Windows.');
  await assertPortsFree([3000, 4000, 5433, 9000, 18888, 19333, 19340, 23646, 28888, 29000, 29333, 29340, 33646]);
  const pgBin = postgresBin();
  const pgData = path.join(LOCAL, 'postgres');
  const storageData = path.join(LOCAL, 'storage');
  const logs = path.join(LOCAL, 'logs');
  await fsp.mkdir(logs, { recursive: true });
  await fsp.mkdir(storageData, { recursive: true });
  const cli = await npmCli();
  const weed = await storageBinary();
  const runtime = { ...process.env, ...env, API_HOST: '127.0.0.1', GRAPHITE_ENABLED: 'false', N8N_EXAM_SUBMIT_WEBHOOK_URL: '', DATABASE_URL: connectionUrl(env), PGHOST: '127.0.0.1', PGPORT: '5433', PGUSER: env.POSTGRES_USER, PGPASSWORD: env.POSTGRES_PASSWORD, PGDATABASE: env.POSTGRES_DB, npm_config_cache: path.join(LOCAL, 'npm-cache') };
  const children = [];
  let postgresProcess = null, stopping = false, resolveStopped;
  const stopped = new Promise(resolve => { resolveStopped = resolve; });
  const cleanup = async () => {
    if (stopping) return stopped;
    stopping = true;
    for (const child of children.reverse()) if (child.exitCode === null) {
      if (child === postgresProcess) await run(path.join(pgBin, 'pg_ctl.exe'), ['-D', pgData, '-m', 'fast', '-w', '-t', '10', 'stop'], { env: runtime }).catch(() => console.error('Graceful PostgreSQL stop failed; stopping the owned process.'));
      if (child.exitCode === null) child.kill();
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(5000)]);
    }
    resolveStopped();
  };
  const launch = (name, command, args, childEnv = runtime, cwd = ROOT) => {
    if (stopping) throw new Error('Local launch was stopped');
    const log = fs.openSync(path.join(logs, `${name}.log`), 'a', 0o600);
    const child = spawn(command, args, { cwd, env: childEnv, windowsHide: true, stdio: ['ignore', log, log] });
    fs.closeSync(log); children.push(child);
    child.once('error', () => { console.error(`${name} could not start. See .local/logs.`); process.exitCode = 1; void cleanup(); });
    child.once('exit', () => { if (!stopping) { console.error(`${name} stopped. See .local/logs.`); process.exitCode = 1; void cleanup(); } });
    return child;
  };
  process.once('SIGINT', cleanup); process.once('SIGTERM', cleanup);
  try {
    if (!fs.existsSync(path.join(pgData, 'PG_VERSION'))) {
      await fsp.mkdir(pgData, { recursive: true });
      const passwordFile = path.join(LOCAL, 'pg-init-password');
      await fsp.writeFile(passwordFile, env.POSTGRES_PASSWORD, { mode: 0o600 });
      try { await run(path.join(pgBin, 'initdb.exe'), ['-D', pgData, '-U', env.POSTGRES_USER, '--pwfile=' + passwordFile, '--encoding=UTF8', '--no-locale', '--auth-host=scram-sha-256', '--auth-local=trust']); }
      finally { await fsp.unlink(passwordFile); }
    }
    const installedMajor = spawnSync(path.join(pgBin, 'pg_ctl.exe'), ['--version'], { encoding: 'utf8', windowsHide: true }).stdout.match(/(\d+)\./)?.[1];
    if (fs.readFileSync(path.join(pgData, 'PG_VERSION'), 'utf8').trim() !== installedMajor) throw new Error('PostgreSQL major differs from the local cluster. Set POSTGRES_BIN to its matching version. No automatic upgrade is attempted.');
    if (stopping) throw new Error('Local launch was stopped');
    // Keep PostgreSQL as an owned foreground child, like storage and API; no detached server.
    postgresProcess = launch('postgres', path.join(pgBin, 'postgres.exe'), ['-D', pgData, '-h', '127.0.0.1', '-p', '5433']);
    const databaseDeadline = Date.now() + 30000;
    while (!stopping && postgresProcess.exitCode === null) {
      const probe = spawnSync(path.join(pgBin, 'pg_isready.exe'), ['-h', '127.0.0.1', '-p', '5433'], { env: runtime, windowsHide: true, stdio: 'ignore', timeout: 2000 });
      if (probe.status === 0) break;
      if (Date.now() >= databaseDeadline) throw new Error('Local PostgreSQL startup timed out. See .local/logs.');
      await sleep(250);
    }
    if (stopping) throw new Error('Local launch was stopped');
    const found = spawnSync(path.join(pgBin, 'psql.exe'), ['-d', 'postgres', '-tAc', `SELECT 1 FROM pg_database WHERE datname='${env.POSTGRES_DB}'`], { env: runtime, encoding: 'utf8', windowsHide: true });
    if (found.status !== 0) throw new Error('Cannot authenticate to the isolated PostgreSQL cluster. Existing passwords were not changed.');
    if (found.stdout.trim() !== '1') await run(path.join(pgBin, 'createdb.exe'), [env.POSTGRES_DB], { env: runtime });
    const storage = launch('storage', weed, ['mini', `-dir=${storageData}`, '-ip=127.0.0.1', '-ip.bind=127.0.0.1', '-s3.port=9000', '-s3.port.grpc=29000', '-master.port=19333', '-volume.port=19340', '-filer.port=18888', '-s3.port.iceberg=0', '-s3.port.lance=0', '-webdav=false', '-admin.ui=false', '-master.telemetry=false', '-s3.allowedOrigins=http://localhost:3000'], { ...runtime, AWS_ACCESS_KEY_ID: env.MINIO_ROOT_USER, AWS_SECRET_ACCESS_KEY: env.MINIO_ROOT_PASSWORD, S3_BUCKET: env.MINIO_BUCKET });
    await waitReady('http://127.0.0.1:9000/readyz', storage);
    if (!options.skipBuild) for (const project of ['backend', 'frontend']) {
      console.log(`Installing and building ${project}...`);
      const buildEnv = { ...runtime, ...(project === 'frontend' ? { NODE_ENV: 'production' } : {}) };
      await run(process.execPath, [cli, 'ci', '--include=dev'], { cwd: path.join(ROOT, project), env: buildEnv });
      if (project === 'backend') await run(process.execPath, [cli, 'run', 'prisma:generate'], { cwd: path.join(ROOT, project), env: buildEnv });
      await run(process.execPath, [cli, 'run', 'build'], { cwd: path.join(ROOT, project), env: buildEnv });
    }
    await run(process.execPath, [path.join(ROOT, 'backend/node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: path.join(ROOT, 'backend'), env: runtime });
    if (options.demo) {
      await fsp.copyFile(path.join(ROOT, 'backend/prisma/demo-seed.cjs'), path.join(ROOT, 'backend/dist/prisma/demo-seed.cjs'));
      await run(process.execPath, [path.join(ROOT, 'backend/dist/prisma/seed.js')], { cwd: path.join(ROOT, 'backend'), env: { ...runtime, ALLOW_DEMO_SEED: 'true' } });
      demoAccess(env);
    }
    const api = launch('api', process.execPath, [path.join(ROOT, 'backend/dist/src/main.js')], runtime, path.join(ROOT, 'backend'));
    await waitReady('http://127.0.0.1:4000/ready', api);
    const web = launch('web', process.execPath, [path.join(ROOT, 'frontend/node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3000'], { ...runtime, NODE_ENV: 'production' }, path.join(ROOT, 'frontend'));
    await waitReady('http://127.0.0.1:3000', web);
    console.log('ProctoLearn is ready: http://localhost:3000 (API: http://localhost:4000/ready).');
    console.log('This is the separate .local environment. Keep this window open; Ctrl+C stops its services.');
    await stopped;
  } finally { await cleanup(); process.removeListener('SIGINT', cleanup); process.removeListener('SIGTERM', cleanup); }
}

async function main() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 15)) throw new Error('Use Node.js 24.15 or newer LTS.');
  const allowed = new Set(['--native', '--demo', '--skip-build', '--prepare-only']);
  if (process.argv.slice(2).some(arg => !allowed.has(arg))) throw new Error('Unknown launcher option');
  const env = ensureLocalEnvironment();
  await fsp.mkdir(LOCAL, { recursive: true });
  if (process.argv.includes('--prepare-only')) { console.log('Private .env.local is ready. Original .env and databases were not changed.'); return; }
  const options = { demo: process.argv.includes('--demo'), skipBuild: process.argv.includes('--skip-build') };
  if (process.argv.includes('--native')) return native(env, options);
  const docker = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { windowsHide: true, stdio: 'ignore', timeout: 15000 });
  if (docker.status !== 0) throw new Error('Start Docker Desktop and wait for Engine running, or use .\\start-local.cmd --native (PostgreSQL required).');
  const compose = ['compose', '--project-name', 'proctolearn-local', '--env-file', '.env.local', '-f', 'docker-compose.local.yml'];
  // Compose's shell environment takes precedence over --env-file. Keep every service on
  // the same local credentials even if this shell was used for an older installation.
  const composeEnvironment = { ...process.env, ...env };
  await run('docker', [...compose, 'up', '-d', ...(options.skipBuild ? [] : ['--build']), '--wait', '--wait-timeout', '180'], { env: composeEnvironment });
  if (options.demo) { await run('docker', [...compose, 'exec', '-T', '-e', 'ALLOW_DEMO_SEED=true', '-e', 'RUN_MIGRATIONS=false', 'api', '/bin/sh', '/app/docker/entrypoint.sh', 'node', 'dist/prisma/seed.js'], { env: composeEnvironment }); demoAccess(env); }
  console.log('ProctoLearn is ready: http://localhost:3000. Local data uses separate proctolearn-local volumes.');
}

module.exports = { ensureLocalEnvironment, connectionUrl, downloadVerified };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
