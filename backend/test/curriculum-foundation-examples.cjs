'use strict';
// Local author QA only. No participant code is accepted by this tool or server.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const ROOT = path.resolve(__dirname, '../..');
const directory = path.join(ROOT, '.local/pilot-author');
const python = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const bundle = id => JSON.parse(fs.readFileSync(path.join(directory, 'courses', id + '.json')));
async function main() {
  const url = new URL(process.env.TEST_DATABASE_URL || 'http://invalid');
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '55432' && url.pathname === '/proctolearn_security_test', 'Identified disposable database required');
  const report = { at: new Date().toISOString(), checks: [], humanReview: 'PENDING' };
  const expected = ['2300', 'Айша: 4 кітап', '13', 'Шекке жетті', '6', '1\n2\n3', '13', 'A 8', 'OK'];
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'proctolearn-author-python-'));
  try {
    for (const [i, lesson] of bundle('C02').modules.flatMap(m => m.lessons).entries()) {
      const code = lesson.example.code;
      // These nine reviewed examples only contain bounded arithmetic, loops,
      // functions and collections. Reject newly introduced IO/import/escape APIs.
      assert.ok(!/\b(?:import|open|exec|eval|compile|__\w+|input)\b/.test(code) && code.length < 5000);
      const result = spawnSync(python, ['-I', '-S', '-X', 'utf8', '-c', code], { cwd: temporary, timeout: 3000, maxBuffer: 65536, encoding: 'utf8', windowsHide: true });
      assert.equal(result.status, 0, lesson.authoringId + ' execution');
      assert.equal(result.stdout.trim().replaceAll('\r\n', '\n'), expected[i], lesson.authoringId + ' expected result');
      report.checks.push({ lesson: lesson.authoringId, result: 'PASS', environment: spawnSync(python, ['--version'], { encoding: 'utf8', windowsHide: true }).stdout.trim() });
    }
  } finally { fs.rmdirSync(temporary); }
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  try {
    for (const [i, lesson] of bundle('C03').modules.flatMap(m => m.lessons).entries()) {
      await db.$transaction(async tx => {
        await tx.$executeRawUnsafe('SET LOCAL statement_timeout = 3000');
        if (i >= 3) {
          await tx.$executeRawUnsafe('CREATE TEMP TABLE books(id integer PRIMARY KEY, title text, pages integer) ON COMMIT DROP');
          await tx.$executeRawUnsafe("INSERT INTO books VALUES (1,'Оқу',120),(2,'Талдау',300),(3,'Шолу',80)");
          await tx.$executeRawUnsafe('CREATE TEMP TABLE loans(id integer PRIMARY KEY, book_id integer REFERENCES books(id)) ON COMMIT DROP');
          await tx.$executeRawUnsafe('INSERT INTO loans VALUES (11,1),(12,1),(13,2)');
        }
        const statements = lesson.example.code.split(';').map(s => s.trim()).filter(Boolean);
        const rows = [];
        for (const statement of statements) {
          assert.ok(!/\b(?:COPY|PROGRAM|ALTER|DROP|DELETE|UPDATE|pg_read|dblink)\b/i.test(statement), 'Only reviewed temporary educational SQL allowed');
          if (/\bSELECT\b/i.test(statement)) rows.push(await tx.$queryRawUnsafe(statement, ...(statement.includes('$1') ? [1] : [])));
          else await tx.$executeRawUnsafe(statement);
        }
        if (i === 0) { assert.equal(rows[0][0].title, 'Оқу'); assert.equal(rows[0][0].pages, 120); }
        if (i === 1) {
          await tx.$executeRawUnsafe("DO $$ BEGIN BEGIN INSERT INTO clubs VALUES (1,'Қайта'); RAISE EXCEPTION 'missing unique rejection'; EXCEPTION WHEN unique_violation THEN NULL; END; BEGIN INSERT INTO clubs VALUES (2,NULL); RAISE EXCEPTION 'missing null rejection'; EXCEPTION WHEN not_null_violation THEN NULL; END; END $$");
        }
        if (i === 2) await tx.$executeRawUnsafe("DO $$ BEGIN BEGIN INSERT INTO loans VALUES (2,99); RAISE EXCEPTION 'missing FK rejection'; EXCEPTION WHEN foreign_key_violation THEN NULL; END; END $$");
        if (i === 3) assert.equal(rows[0][0].estimated_pages, 130);
        if (i === 4) assert.equal(rows[0].length, 2);
        if (i === 5) assert.deepEqual(rows[0].map(r => r.id), [2, 1]);
        if (i === 6) assert.equal(rows[0].length, 3);
        if (i === 7) assert.deepEqual(rows[0].map(r => Number(r.loan_count)), [2, 1, 0]);
        if (i === 8) { assert.equal(Number(rows[0][0].n), 2); assert.equal(rows[1][0].title, 'Оқу'); }
        // Temp tables in first three snippets do not declare ON COMMIT DROP.
        // Explicitly remove only those session-local fixtures before pooling.
        if (i === 0) await tx.$executeRawUnsafe('DROP TABLE pg_temp.books');
        if (i === 1) await tx.$executeRawUnsafe('DROP TABLE pg_temp.clubs');
        if (i === 2) { await tx.$executeRawUnsafe('DROP TABLE pg_temp.loans'); await tx.$executeRawUnsafe('DROP TABLE pg_temp.titles'); }
      });
      report.checks.push({ lesson: lesson.authoringId, result: 'PASS', environment: 'PostgreSQL 18, temporary educational tables, actual bound $1 parameter where needed' });
    }
  } finally { await db.$disconnect(); }
  report.result = 'PASS';
  fs.writeFileSync(path.join(directory, 'foundation-examples.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: report.result, examples: report.checks.length, courses: ['C02', 'C03'] }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
