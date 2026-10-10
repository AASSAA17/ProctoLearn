'use strict';
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { ContentImportService, revision } = require('../../src/content-import/content-import.service');
const { StepsService } = require('../../src/steps/steps.service');
const { CoursesService } = require('../../src/courses/courses.service');
const { fixture, config } = require('../content-import.test.cjs');
const url = process.env.TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/proctolearn_security_test') throw new Error('Owned disposable test DB required');

test('atomic import, replay race, DTO snapshots and teacher edits preserve records in actual PostgreSQL', async () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const owner = { id: randomUUID(), role: 'TEACHER' };
  let courseId;
  try {
    assert.equal(await db.contentImportReceipt.count({ where: { id: 'pilot-curriculum-v1:C02' } }), 0, 'Do not adopt existing receipt');
    await db.user.create({ data: { ...owner, name: 'Synthetic import teacher', email: `${owner.id}@example.invalid`, password: 'not-a-login' } });
    // Service config is a test adapter; the actual connection above is guarded
    // disposable storage. No running demo/pilot data is accessed by this suite.
    const service = new ContentImportService(db, config, new StepsService(db));
    const input = fixture();
    const results = await Promise.all(Array.from({ length: 3 }, () => service.importDraft(input, owner)));
    courseId = results[0].courseId;
    assert.equal(new Set(results.map(result => result.courseId)).size, 1);
    assert.equal(results.filter(result => result.replay === false).length, 1);
    const course = await db.course.findUnique({ where: { id: courseId }, include: { modules: { include: { lessons: { include: { steps: true } } } }, exams: { include: { questions: true } } } });
    assert.equal(course.status, 'DRAFT'); assert.equal(course.modules.length, 3);
    assert.equal(course.modules.flatMap(module => module.lessons).length, 9);
    assert.equal(course.modules.flatMap(module => module.lessons.flatMap(lesson => lesson.steps)).length, 36);
    assert.equal(course.exams[0].questions.length, 12);
    await assert.rejects(new CoursesService(db).findById(courseId), error => error.getStatus() === 404);
    const changed = fixture(); changed.course.description += ' revised'; changed.revisionHash = revision(changed.course);
    await assert.rejects(service.importDraft(changed, owner), error => error.getStatus() === 409);
    await db.lesson.update({ where: { id: course.modules[0].lessons[0].id }, data: { content: 'Teacher correction' } });
    await assert.rejects(service.importDraft(input, owner), error => error.getStatus() === 409);
    assert.equal((await db.lesson.findUnique({ where: { id: course.modules[0].lessons[0].id } })).content, 'Teacher correction');
    assert.equal(await db.course.count({ where: { teacherId: owner.id } }), 1);
  } finally {
    // Remove only this suite's receipts and graph, never unrelated content.
    await db.contentImportReceipt.deleteMany({ where: { ownerId: owner.id } });
    await db.course.deleteMany({ where: { teacherId: owner.id } });
    await db.user.deleteMany({ where: { id: owner.id } });
    await db.$disconnect();
  }
});

test('a mid-import failure rolls back the entire new graph and receipt', async () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const owner = { id: randomUUID(), role: 'TEACHER' };
  try {
    await db.user.create({ data: { ...owner, name: 'Synthetic rollback teacher', email: `${owner.id}@example.invalid`, password: 'not-a-login' } });
    const adapter = { $transaction: (work, options) => db.$transaction(async tx => {
      let writes = 0;
      const original = tx.lesson.create.bind(tx.lesson);
      tx.lesson.create = async (...args) => { if (++writes === 2) throw new Error('Synthetic interruption'); return original(...args); };
      return work(tx);
    }, options) };
    const service = new ContentImportService(adapter, config, new StepsService(adapter));
    const input = fixture(); input.authoringKey = 'pilot-curriculum-v1:C03';
    await assert.rejects(service.importDraft(input, owner), /Synthetic interruption/);
    assert.equal(await db.course.count({ where: { teacherId: owner.id } }), 0);
    assert.equal(await db.contentImportReceipt.count({ where: { ownerId: owner.id } }), 0);
  } finally {
    await db.contentImportReceipt.deleteMany({ where: { ownerId: owner.id } });
    await db.course.deleteMany({ where: { teacherId: owner.id } });
    await db.user.deleteMany({ where: { id: owner.id } }); await db.$disconnect();
  }
});
