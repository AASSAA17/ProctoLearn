const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { target, percentile, check } = require('./release-smoke.cjs');

test('release check accepts only local read-only targets', () => {
  assert.equal(target('http://127.0.0.1:4000/').origin, 'http://127.0.0.1:4000');
  for (const url of ['https://example.com/', 'http://example.com/', 'http://user:pass@localhost/', 'http://localhost/admin', 'http://localhost/?token=x']) {
    assert.throws(() => target(url));
  }
  assert.equal(percentile([3, 1, 4, 2], 0.95), 4);
});

test('release check measures catalog and fails on unhealthy service', async () => {
  let ready = true;
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/ready') {
      response.statusCode = ready ? 200 : 503;
      response.end(JSON.stringify({ status: ready ? 'ready' : 'unavailable' }));
    } else if (request.url === '/courses?page=1&limit=20') response.end(JSON.stringify({ data: [] }));
    else { response.statusCode = 404; response.end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/`;
    const report = await check(base, { samples: 12, concurrency: 3 });
    assert.equal(report.completed, 12);
    assert.equal(report.errors, 0);
    ready = false;
    await assert.rejects(check(base, { samples: 1 }), /not ready/);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
