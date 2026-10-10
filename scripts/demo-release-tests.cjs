#!/usr/bin/env node
'use strict';
// Positively identified disposable fixtures for existing guarded integration suites.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { ensureLocalEnvironment, connectionUrl, native, postgresBin, run, npmCli } = require('./local-launch.cjs');
const ROOT = path.resolve(__dirname, '..');
const DIRECTORY = path.join(ROOT, '.local', 'release-tests');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function prepare() {
  const marker = path.join(DIRECTORY, 'ownership.json');
  if (!fs.existsSync(marker)) {
    if (fs.existsSync(DIRECTORY) && fs.readdirSync(DIRECTORY).length) throw new Error('Unmarked test fixture directory is not empty.');
    fs.mkdirSync(DIRECTORY, { recursive: true });
    fs.writeFileSync(marker, JSON.stringify({ kind: 'proctolearn-disposable-tests-v1', createdAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
  }
  if (fs.lstatSync(DIRECTORY).isSymbolicLink() || JSON.parse(fs.readFileSync(marker)).kind !== 'proctolearn-disposable-tests-v1') throw new Error('Test fixture ownership mismatch.');
  const env = ensureLocalEnvironment(DIRECTORY);
  return { ...env, POSTGRES_DB: 'proctolearn_security_test', MINIO_BUCKET: 'proctolearn-test', MINIO_PORT: '19000', MINIO_PUBLIC_URL: 'http://127.0.0.1:19000' };
}
function environment(env) {
  const database = connectionUrl(env, 55432);
  return { ...process.env, ...env, NODE_ENV: 'test', DATABASE_URL: database, TEST_DATABASE_URL: database,
    TEST_MINIO_ENDPOINT: '127.0.0.1', TEST_MINIO_PORT: '19000', TEST_MINIO_ROOT_USER: env.MINIO_ROOT_USER,
    TEST_MINIO_ROOT_PASSWORD: env.MINIO_ROOT_PASSWORD, TEST_MINIO_BUCKET: env.MINIO_BUCKET,
    TEST_PG_BIN: postgresBin(), TEST_STORAGE_ENABLED: 'true',
    BACKUP_S3_ACCESS_KEY_ID: env.MINIO_ROOT_USER, BACKUP_S3_SECRET_ACCESS_KEY: env.MINIO_ROOT_PASSWORD,
    JWT_ACCESS_SECRET: env.JWT_ACCESS_SECRET, JWT_REFRESH_SECRET: env.JWT_REFRESH_SECRET,
    SMTP_HOST: '', SMTP_USER: '', SMTP_PASS: '', GRAPHITE_ENABLED: 'false', N8N_EXAM_SUBMIT_WEBHOOK_URL: '',
    npm_config_cache: path.join(ROOT, '.local/npm-cache') };
}
const stateFile = path.join(DIRECTORY, 'running.json');
function state() { return fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile)) : null; }
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
async function main(args = process.argv.slice(2)) {
  const [command, project, ...parameters] = args;
  if (!['prepare', 'start', 'stop', 'run', 'exec'].includes(command)) throw new Error('Use prepare|start|stop|run backend SCRIPT|exec backend NODE_ARGS...');
  const env = prepare();
  if (command === 'prepare') { console.log('Disposable integration fixture configured in .local/release-tests.'); return; }
  if (command === 'stop') {
    const active = state();
    if (!active || !alive(active.pid)) return;
    fs.writeFileSync(path.join(DIRECTORY, 'stop-request'), 'stop\n');
    const until = Date.now() + 30000;
    while (state()?.pid === active.pid && alive(active.pid) && Date.now() < until) await wait(250);
    if (state()?.pid === active.pid && alive(active.pid)) throw new Error('Test supervisor stop timed out.');
    return;
  }
  if (command === 'start') {
    const active = state(); if (active && alive(active.pid)) throw new Error('Test supervisor is already running.');
    const stopFile = path.join(DIRECTORY, 'stop-request'); if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
    fs.writeFileSync(stateFile, JSON.stringify({ pid: process.pid, ready: false }));
    try {
      await native(env, { localDir: DIRECTORY, controlDir: DIRECTORY, infrastructureOnly: true, pgPort: 55432, noStorageAdmin: true,
        storagePorts: { s3: 19000, s3grpc: 39000, master: 19335, volume: 19342, filer: 18890 },
        onReady: async () => {
          await run(process.execPath, [path.join(ROOT, 'backend/node_modules/prisma/build/index.js'), 'migrate', 'deploy'], { cwd: path.join(ROOT, 'backend'), env: environment(env) });
          fs.writeFileSync(stateFile, JSON.stringify({ pid: process.pid, ready: true }));
          console.log('Guarded test fixtures ready: PostgreSQL 55432, S3 19000. Dedicated disposable data only.');
        },
      });
    } finally { if (state()?.pid === process.pid) fs.unlinkSync(stateFile); }
    return;
  }
  if (!['backend', 'frontend'].includes(project) || !parameters.length) throw new Error('Specify backend/frontend and a package script or Node arguments.');
  if (!state()?.ready || !alive(state().pid)) throw new Error('Start the disposable test fixture before running its suites.');
  // One suite group at a time: existing integration tests intentionally clear this disposable DB.
  const lock = path.join(DIRECTORY, 'suite.lock');
  const token = randomBytes(16).toString('hex');
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, token, command: parameters[0] }), { flag: 'wx', mode: 0o600 });
  try {
    const nodeArgs = command === 'run' ? [await npmCli(), 'run', ...parameters] : parameters;
    await run(process.execPath, nodeArgs, { cwd: path.join(ROOT, project), env: environment(env) });
  } finally {
    if (JSON.parse(fs.readFileSync(lock)).token === token) fs.unlinkSync(lock);
  }
}
module.exports = { prepare, environment, main };
if (require.main === module) main().catch(error => {
  console.error(error.code === 'EEXIST' ? 'Another integration suite owns the fixture. Wait until it finishes; do not run destructive suites concurrently.' : error.constructor === Error ? error.message : 'Fixture operation failed; inspect private logs.');
  process.exitCode = 1;
});
