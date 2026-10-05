const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const root = resolve(__dirname, '..');
const yaml = (path) => JSON.parse(execFileSync('python3', ['-c',
  'import json,sys,yaml; print(json.dumps(yaml.safe_load(sys.stdin.read())))'],
{ input: readFileSync(resolve(root, path)), encoding: 'utf8', timeout: 15000 }));
const env = { ...process.env, PROCTOLEARN_API_NETWORK: 'test_private_api',
  GF_SECURITY_ADMIN_PASSWORD: 'test-only', TELEGRAM_BOT_TOKEN: 'test-only', TELEGRAM_CHAT_ID: '1',
  POSTGRES_USER: 'test', POSTGRES_DB: 'test', POSTGRES_PASSWORD: 'test-only', ZABBIX_DB_PASSWORD: 'test-only', PGADMIN_DEFAULT_PASSWORD: 'test-only', NAGIOSADMIN_PASS: 'test-only' };
const prometheus = yaml('monitoring-project/prometheus/prometheus.yml');
const job = (name) => prometheus.scrape_configs.find((entry) => entry.job_name === name);

test('API metrics and readiness are separate private targets; outages retain alert coverage', () => {
  assert.equal(job('proctolearn_api').metrics_path, '/metrics');
  assert.deepEqual(job('proctolearn_api').static_configs[0].targets, ['api:4000']);
  const ready = job('proctolearn_api_ready');
  assert.equal(ready.metrics_path, '/probe');
  assert.deepEqual(ready.params.module, ['http_2xx']);
  assert.deepEqual(ready.static_configs[0].targets, ['http://api:4000/ready']);
  assert.deepEqual(ready.relabel_configs, [
    { source_labels: ['__address__'], target_label: '__param_target' },
    { source_labels: ['__param_target'], target_label: 'instance' },
    { target_label: '__address__', replacement: 'blackbox_exporter:9115' },
  ]);
  const rules = yaml('monitoring-project/prometheus/alert.rules.yml').groups.flatMap((g) => g.rules);
  assert.match(rules.find((r) => r.alert === 'ServiceDown').expr, /proctolearn_api/);
  assert.equal(rules.find((r) => r.alert === 'ProctoLearnApiNotReady').expr,
    'probe_success{job="proctolearn_api_ready"} == 0 and on() up{job="proctolearn_api"} == 1');
});

for (const file of ['docker-compose.monitoring.yml', 'monitoring-project/docker-compose.yml']) {
  test(`${file}: explicit cross-stack connectivity without publishing API metrics`, () => {
    const config = JSON.parse(execFileSync('docker', ['compose', '--env-file', '/dev/null', '-f', file,
      '--profile', 'monitoring', 'config', '--format', 'json'], { cwd: root, env, encoding: 'utf8', timeout: 15000 }));
    assert.equal(config.networks.application.external, true);
    assert.equal(config.networks.application.name, env.PROCTOLEARN_API_NETWORK);
    for (const name of ['prometheus', 'blackbox_exporter']) {
      assert.ok(Object.hasOwn(config.services[name].networks, 'application'));
      assert.ok(Object.hasOwn(config.services[name].networks, 'monitoring'));
    }
    assert.equal(config.services.api, undefined);
    for (const service of Object.values(config.services)) {
      for (const port of service.ports || []) assert.equal(port.host_ip, '127.0.0.1');
    }
    assert.match(readFileSync(resolve(root, file), 'utf8'), /PROCTOLEARN_API_NETWORK:\?[^}]+/);
  });
  test(`${file}: filesystem exporter reads host paths, read-only and without privilege`, () => {
    const service = yaml(file).services.node_exporter;
    for (const flag of ['--path.rootfs=/host/root', '--path.procfs=/host/proc', '--path.sysfs=/host/sys'])
      assert.ok(service.command.includes(flag), flag);
    assert.ok(service.volumes.includes('/:/host/root:ro,rslave'));
    assert.ok(service.volumes.includes('/proc:/host/proc:ro'));
    assert.ok(service.volumes.includes('/sys:/host/sys:ro'));
    assert.notEqual(service.privileged, true);
    const exclude = new RegExp(service.command.find((arg) => arg.startsWith('--collector.filesystem.mount-points-exclude=')).split('=')[1].replaceAll('$$', '$'));
    for (const mount of ['/', '/home', '/var', '/mnt/data']) assert.equal(exclude.test(mount), false, mount);
    for (const mount of ['/proc', '/sys', '/dev/pts']) assert.equal(exclude.test(mount), true, mount);
    assert.equal(job('node_exporter').static_configs[0].labels.scope, 'host');
  });
}
