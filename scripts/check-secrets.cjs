#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

function forbiddenPath(file) {
  if (/(^|\/)(backups|private-evidence)\//i.test(file)) return true;
  if (/^evidence\//.test(file) && !/\.md$/i.test(file)) return true;
  if (/(^|\/)(?:\.env(?:\..*)?|[^/]+\.env(?:\..*)?)$/i.test(file) && !/\.example$/i.test(file)) return true;
  return /(?:\.tfstate(?:\..*)?|\.pem|\.key|\.p12|\.pfx|\.sql\.gz|\.dump|\.bak|\.tsbuildinfo)$/i.test(file)
    || /(^|\/)(id_rsa|id_ed25519|seed-users\.sql)$/.test(file);
}

function main() {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const staged = process.argv.includes('--staged');
  const args = staged ? ['ls-files', '-z'] : ['ls-files', '-z', '--cached', '--others', '--exclude-standard'];
  const files = [...new Set(execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))]
    .filter((file) => staged || fs.existsSync(path.join(root, file)));
  const blocked = files.filter(forbiddenPath);
  if (blocked.length) {
    console.error('Private/generated files must not be committed:\n' + blocked.join('\n'));
    return 1;
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'proctolearn-scan-'));
  try {
    for (const file of files) {
      const target = path.resolve(temp, file);
      if (!target.startsWith(temp + path.sep)) throw new Error('Invalid repository path');
      // Never follow a tracked link outside the checkout.
      if (!staged && fs.lstatSync(path.join(root, file)).isSymbolicLink()) throw new Error('Symlinks require manual review: ' + file);
      const data = staged
        ? execFileSync('git', ['show', ':' + file], { cwd: root, maxBuffer: 32 * 1024 * 1024 })
        : fs.readFileSync(path.join(root, file));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, data);
    }
    const result = spawnSync(process.env.GITLEAKS_BIN || 'gitleaks', [
      'dir', temp, '--config', path.join(temp, '.gitleaks.toml'),
      '--redact=100', '--no-banner', '--log-level', 'warn',
      '--report-format', 'json', '--report-path', path.join(temp, 'scan-report.json'),
    ], { stdio: 'inherit' });
    if (result.error) {
      console.error('Gitleaks is required. Install the pinned version described in docs/SECURITY_PHASE_2.md.');
      return 2;
    }
    if (result.status === 1 && fs.existsSync(path.join(temp, 'scan-report.json'))) {
      for (const finding of JSON.parse(fs.readFileSync(path.join(temp, 'scan-report.json'), 'utf8'))) {
        console.error(`${path.relative(temp, finding.File)}:${finding.StartLine} ${finding.RuleID}`);
      }
    }
    if (result.status === 0) console.log(`Secret scan passed (${files.length} files, ${staged ? 'index' : 'working tree'}).`);
    return result.status ?? 2;
  } finally {
    // mkdtemp created this exact path; never delete a user-supplied directory.
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

module.exports = { forbiddenPath };
if (require.main === module) process.exitCode = main();
