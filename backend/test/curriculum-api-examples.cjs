'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { once } = require('node:events');
const { spawnSync } = require('node:child_process');
const express = require('express');
const ROOT = path.resolve(__dirname, '../..'); const directory = path.join(ROOT, '.local/pilot-author');
const lessons = id => JSON.parse(fs.readFileSync(path.join(directory, 'courses/' + id + '.json'))).modules.flatMap(m => m.lessons);
const report = { at: new Date().toISOString(), environment: `Node ${process.version}; Express ${require('express/package.json').version}; real ephemeral loopback HTTP; explicit fragment dependency wrappers`, checks: [] };
async function fixture(app, work) {
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await work(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); }
}
(async () => {
  for (const [i, lesson] of lessons('C10').entries()) {
    const code = lesson.example.code; const app = express();
    if (i >= 9) { report.checks.push({ lesson: lesson.authoringId, result: 'HUMAN_REVIEW_PENDING', scope: 'Project/idempotency/report protocol, not executable source; independent student project not graded' }); continue; }
    if (i === 8) {
      vm.runInNewContext(code + ';if(!canRead({id:"u1"},{ownerId:"u1"})||canRead(null,{ownerId:"u1"}))throw Error("policy");', { console: { log: value => assert.equal(value, false) } }, { timeout: 1000 });
    } else {
      if (i === 0) vm.runInNewContext(code.replace('import express from "express";', '').replace('const app=express();', '').replace('app.listen(5050,"127.0.0.1");', ''), { app }, { timeout: 1000 });
      if (i === 1 || i === 3 || i === 5 || i === 7) {
        if (i === 7) app.get('/fail', () => { throw new Error('Private synthetic implementation detail'); });
        vm.runInNewContext(code, { app, express, books: [{ id: 'b1', title: 'Оқу' }] }, { timeout: 1000 });
      }
      if ([2, 4, 6].includes(i)) {
        if (i === 6) app.use(express.json({ limit: '16kb' }));
        const handler = new Function('req', 'res', code + (i === 4 ? ';res.json({limit});' : i === 6 ? ';res.status(201).json({title});' : ''));
        app[i === 6 ? 'post' : 'get']('/', handler);
      }
      await fixture(app, async origin => {
        const request = async (route, status = 200, data) => {
          const response = await fetch(origin + route, { ...(data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }), signal: AbortSignal.timeout(3000) });
          assert.equal(response.status, status); const text = await response.text(); return text.startsWith('{') ? JSON.parse(text) : text;
        };
        if (i === 0) assert.deepEqual(await request('/health'), { ok: true });
        if (i === 1) { assert.equal((await request('/books', 201, {})).id, 'b1'); await request('/books/no', 404); }
        if (i === 2) assert.deepEqual(await request('/'), { id: 'b1', title: 'Оқу' });
        if (i === 3) { assert.equal((await request('/books/b1')).title, 'Оқу'); await request('/books/missing', 404); }
        if (i === 4) { assert.equal((await request('/')).limit, 10); assert.equal((await request('/?limit=50')).limit, 50); for (const value of ['0', '51', '1.2', 'abc', '1&limit=2']) await request('/?limit=' + value, 400); }
        if (i === 5) { assert.equal((await request('/books', 201, { title: 'Оқу' })).title, 'Оқу'); await request('/books', 413, { title: 'x'.repeat(17000) }); }
        if (i === 6) { assert.equal((await request('/', 201, { title: ' Оқу ' })).title, 'Оқу'); for (const title of ['', '  ', 2, 'x'.repeat(201)]) await request('/', 400, { title }); }
        if (i === 7) assert.deepEqual(await request('/fail', 500), { error: 'Ішкі қате' });
      });
    }
    report.checks.push({ lesson: lesson.authoringId, result: 'PASS' });
  }
  const tests = lessons('C13'); const output = path.join(directory, 'evidence/test-fixtures'); fs.mkdirSync(output, { recursive: true });
  for (const i of [3, 4, 5]) {
    const code = tests[i].example.code;
    const file = path.join(output, tests[i].authoringId + '.mjs'); fs.writeFileSync(file, (i === 3 ? '' : 'import assert from "node:assert/strict";\n') + code);
    const run = spawnSync(process.execPath, ['--test', file], { encoding: 'utf8', timeout: 5000, windowsHide: true }); assert.equal(run.status, 0, tests[i].authoringId);
    report.checks.push({ lesson: tests[i].authoringId, result: 'PASS', scope: 'Actual node --test child, original snippet + explicit assert import where required' });
  }
  const app = express(); app.get('/items', (_req, res) => res.json([]));
  await fixture(app, async base => { const fn = new Function('base', 'fetch', 'assert', 'return (async()=>{' + tests[6].example.code + '})()'); await fn(base, fetch, assert); });
  report.checks.push({ lesson: tests[6].authoringId, result: 'PASS', scope: 'Actual loopback HTTP contract []/JSON/200' });
  fs.writeFileSync(path.join(directory, 'api-examples.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ expressExamples: 9, nodeTestExamples: 3, httpContractExamples: 1, projectProtocols: 'HUMAN_REVIEW_PENDING' }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
