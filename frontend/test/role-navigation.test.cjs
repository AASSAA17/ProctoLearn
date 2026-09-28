const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/lib/role-navigation.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { dashboardLinks, staffHome, studentOnlyPath, canVisitDashboardPath } = compiled.exports;

test('staff navigation contains only role workspaces and common pages', () => {
  const expected = {
    TEACHER: ['/dashboard', '/dashboard/notifications', '/dashboard/teacher/courses'],
    PROCTOR: ['/dashboard', '/dashboard/notifications', '/dashboard/proctor'],
    ADMIN: ['/dashboard', '/dashboard/notifications', '/dashboard/teacher/courses', '/dashboard/proctor', '/dashboard/admin'],
  };
  for (const [role, links] of Object.entries(expected)) {
    assert.deepEqual(dashboardLinks(role).map(link => link.href), links);
    assert.ok(staffHome[role].every(item => links.includes(item.href)));
  }
  assert.deepEqual(dashboardLinks('STUDENT').map(link => link.href), [
    '/dashboard', '/dashboard/courses', '/dashboard/my-attempts', '/dashboard/certificates', '/dashboard/notifications',
  ]);
});

test('student-only paths do not capture staff workspaces or common pages', () => {
  for (const path of ['/dashboard/courses', '/dashboard/courses/id', '/dashboard/my-attempts', '/dashboard/my-attempts/id', '/dashboard/certificates', '/dashboard/exam/id']) {
    assert.equal(studentOnlyPath(path), true, path);
  }
  for (const path of ['/dashboard', '/dashboard/teacher/courses', '/dashboard/admin/courses', '/dashboard/proctor', '/dashboard/notifications', '/dashboard/profile']) {
    assert.equal(studentOnlyPath(path), false, path);
  }
});

test('direct workspace URLs honor the actor role', () => {
  for (const role of ['STUDENT', 'TEACHER', 'PROCTOR', 'ADMIN']) {
    assert.equal(canVisitDashboardPath(role, '/dashboard'), true);
    assert.equal(canVisitDashboardPath(role, '/dashboard/profile'), true);
    assert.equal(canVisitDashboardPath(role, '/dashboard/courses/id'), role === 'STUDENT');
    assert.equal(canVisitDashboardPath(role, '/dashboard/teacher/courses/new'), role === 'TEACHER' || role === 'ADMIN');
    assert.equal(canVisitDashboardPath(role, '/dashboard/proctor/evidence/id'), role === 'PROCTOR' || role === 'ADMIN');
    assert.equal(canVisitDashboardPath(role, '/dashboard/admin/users'), role === 'ADMIN');
  }
});
