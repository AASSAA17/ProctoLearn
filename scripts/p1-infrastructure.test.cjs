const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const root = resolve(__dirname, '..');
const read = (file) => readFileSync(join(root, file), 'utf8');

test('Telegram templates have no literal bot credential and both compose stacks inject private values', () => {
  const alertmanager = read('monitoring-project/alertmanager/alertmanager.yml');
  const grafana = read('monitoring-project/grafana/provisioning/alerting/telegram.yml');
  for (const template of [alertmanager, grafana]) assert.doesNotMatch(template, /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/);
  assert.match(alertmanager, /bot_token: "__TELEGRAM_BOT_TOKEN__"/);
  assert.match(grafana, /bottoken: "\$TELEGRAM_BOT_TOKEN"/);
  assert.match(grafana, /chatid: "\$TELEGRAM_CHAT_ID"/);
  for (const file of ['docker-compose.monitoring.yml', 'monitoring-project/docker-compose.yml']) {
    const compose = read(file);
    assert.equal((compose.match(/TELEGRAM_BOT_TOKEN:\?Set a rotated Telegram token/g) || []).length, 2);
    assert.match(compose, /set -eu\n\s+\/bin\/sh \/etc\/alertmanager\/render-config.sh/);
    assert.match(compose, /render-config.sh:\/etc\/alertmanager\/render-config.sh:ro/);
    assert.doesNotMatch(compose, /demo-token/);
  }
});

test('renderer substitutes private values without logging them and rejects missing or injectable values', () => {
  const directory = mkdtempSync(join(tmpdir(), 'proctolearn-telegram-test-'));
  const target = join(directory, 'rendered.yml');
  const token = '123456:' + 'x'.repeat(32);
  const run = (values) => spawnSync('sh', [join(root, 'monitoring-project/alertmanager/render-config.sh'), join(root, 'monitoring-project/alertmanager/alertmanager.yml'), target], {
    env: { PATH: process.env.PATH, ...values }, encoding: 'utf8',
  });
  try {
    writeFileSync(target, 'old config', { mode: 0o644 });
    const valid = run({ TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: '-100123456' });
    assert.equal(valid.status, 0, valid.stderr);
    assert.equal(valid.stdout + valid.stderr, '');
    const rendered = readFileSync(target, 'utf8');
    assert.ok(rendered.includes(`bot_token: "${token}"`));
    assert.match(rendered, /chat_id: -100123456/);
    assert.doesNotMatch(rendered, /__TELEGRAM_/);
    assert.equal(statSync(target).mode & 0o777, 0o600);
    for (const values of [{}, { TELEGRAM_BOT_TOKEN: token },
      { TELEGRAM_BOT_TOKEN: token + '\nmalicious: value', TELEGRAM_CHAT_ID: '1' },
      { TELEGRAM_BOT_TOKEN: token + '|&', TELEGRAM_CHAT_ID: '1' },
      { TELEGRAM_BOT_TOKEN: token + '\r', TELEGRAM_CHAT_ID: '1' },
      { TELEGRAM_BOT_TOKEN: token + '\t', TELEGRAM_CHAT_ID: '1' },
      { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: '0' },
      { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: '1\nfoo: bar' },
    ]) {
      const result = run(values);
      assert.notEqual(result.status, 0);
      assert.equal((result.stdout + result.stderr).includes(token), false);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Terraform Redis port publication binds loopback explicitly', () => {
  const redis = read('infra/terraform/main.tf').match(/resource "docker_container" "redis" \{([\s\S]*?)(?=\nresource|$)/);
  assert.ok(redis, 'Redis container resource must exist');
  const ports = [...redis[1].matchAll(/ports\s*\{([^}]+)\}/g)];
  assert.equal(ports.length, 1);
  const block = ports[0][1];
  assert.match(block, /internal\s*=\s*6379/);
  assert.match(block, /ip\s*=\s*"127\.0\.0\.1"/);
  assert.equal((block.match(/ip\s*=/g) || []).length, 1);
});
