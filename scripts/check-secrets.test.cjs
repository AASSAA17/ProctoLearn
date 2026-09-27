const { test } = require('node:test');
const assert = require('node:assert/strict');
const { forbiddenPath } = require('./check-secrets.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

function fixture(work) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proctolearn-scan-test-'));
  try {
    execFileSync('git', ['init', '-q', dir]);
    fs.copyFileSync(path.join(__dirname, '../.gitleaks.toml'), path.join(dir, '.gitleaks.toml'));
    fs.writeFileSync(path.join(dir, '.env.example'), 'POSTGRES_PASSWORD=\n');
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
    git('add', '.gitleaks.toml', '.env.example');
    const scan = (...args) => spawnSync(process.execPath, [path.join(__dirname, 'check-secrets.cjs'), ...args], { cwd: dir, encoding: 'utf8' });
    work({ dir, git, scan });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('blocks private configuration, raw evidence and generated credential exports', () => {
  for (const file of ['.env', '.env.production', 'backend/.env.test', 'root.env', 'root.env.local',
    'backups/db.sql', 'evidence/05-containerization/config.txt', 'evidence/config.yml',
    'private-evidence/report.md', 'infra/state.tfstate.backup', 'private.pem', 'id_ed25519',
    'db.sql.gz', 'backend/prisma/seed-users.sql', 'frontend/tsconfig.tsbuildinfo']) {
    assert.equal(forbiddenPath(file), true, file);
  }
});

test('allows templates, migrations, reviewed guides and scanner configuration', () => {
  for (const file of ['.env.example', 'monitoring-project/.env.example', '.gitleaks.toml',
    'backend/prisma/migrations/20260926000000_baseline/migration.sql',
    'backend/prisma/seed-exams.sql', 'evidence/README.md', 'docs/SECURITY_PHASE_2.md']) {
    assert.equal(forbiddenPath(file), false, file);
  }
});

test('scanner accepts empty templates but rejects a literal runtime password without printing it', () => {
  fixture(({ dir, scan }) => {
    assert.equal(scan().status, 0);
    const fakePassword = 'fixed-fixture-password';
    fs.writeFileSync(path.join(dir, '.env.example'), `POSTGRES_PASSWORD=${fakePassword}\n`);
    const result = scan();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /runtime-hardcoded-credential/);
    assert.ok(!(result.stdout + result.stderr).includes(fakePassword));
  });
});

test('staged scan catches credentials even when the working copy has been cleaned', () => {
  fixture(({ dir, git, scan }) => {
    fs.writeFileSync(path.join(dir, '.env.example'), 'POSTGRES_PASSWORD=fixed-fixture-password\n');
    git('add', '.env.example');
    fs.writeFileSync(path.join(dir, '.env.example'), 'POSTGRES_PASSWORD=\n');
    assert.equal(scan().status, 0);
    assert.equal(scan('--staged').status, 1);
  });
});

test('staged scan rejects force-added raw evidence even when the file contains no recognized token', () => {
  fixture(({ dir, git, scan }) => {
    fs.mkdirSync(path.join(dir, 'evidence'));
    fs.writeFileSync(path.join(dir, 'evidence/private.txt'), 'private report');
    git('add', '-f', 'evidence/private.txt');
    const result = scan('--staged');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /evidence\/private.txt/);
  });
});
