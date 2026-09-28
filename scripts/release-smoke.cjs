#!/usr/bin/env node
// Bounded read-only release check. Run against a loopback staging endpoint.
const { performance } = require('node:perf_hooks');

function target(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Expected a loopback HTTP base URL without credentials, path or query');
  }
  return url;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

async function check(base, { samples = 60, concurrency = 6, timeoutMs = 5000, p95LimitMs = 3000 } = {}) {
  if (!Number.isInteger(samples) || samples < 1 || samples > 200 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) throw new Error('Invalid bounded load settings');
  const url = target(base);
  const read = async (path) => {
    const started = performance.now();
    const response = await fetch(new URL(path, url), { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.json();
    return { status: response.status, body, elapsedMs: performance.now() - started };
  };
  const ready = await read('/ready');
  if (ready.status !== 200 || ready.body.status !== 'ready') throw new Error('Staging dependencies are not ready');
  const samplesMs = [];
  let next = 0;
  const errors = [];
  await Promise.all(Array.from({ length: Math.min(concurrency, samples) }, async () => {
    while (next < samples) {
      next++;
      try {
        const result = await read('/courses?page=1&limit=20');
        if (result.status !== 200 || !Array.isArray(result.body.data)) throw new Error(`Catalog returned HTTP ${result.status} or invalid body`);
        samplesMs.push(result.elapsedMs);
      } catch (error) { errors.push(error instanceof Error ? error.message : 'unknown error'); }
    }
  }));
  const p95Ms = samplesMs.length ? percentile(samplesMs, 0.95) : null;
  const report = { target: url.origin, samples, completed: samplesMs.length, errors: errors.length, p95Ms: p95Ms === null ? null : Math.round(p95Ms), p95LimitMs };
  if (errors.length || p95Ms === null || p95Ms > p95LimitMs) {
    throw new Error(`Release smoke failed: ${JSON.stringify({ ...report, firstError: errors[0] })}`);
  }
  return report;
}

if (require.main === module) {
  const base = process.argv[2];
  if (!base || process.argv.length !== 3) {
    process.stderr.write('Usage: node scripts/release-smoke.cjs http://127.0.0.1:4000/\n');
    process.exitCode = 2;
  } else {
    check(base).then(result => process.stdout.write(JSON.stringify(result) + '\n')).catch(error => {
      process.stderr.write(`${error.message}\n`); process.exitCode = 1;
    });
  }
}

module.exports = { target, percentile, check };
