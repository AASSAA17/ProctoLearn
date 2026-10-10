'use strict';
require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ValidationPipe } = require('@nestjs/common');
const { ContentImportService, revision } = require('../src/content-import/content-import.service');
const { ImportDraftDto } = require('../src/content-import/content-import.dto');
const { StepsService } = require('../src/steps/steps.service');
function fixture() {
  const course = { title: 'Synthetic import test', description: 'Generic disposable test only', level: 'BEGINNER',
    modules: Array.from({ length: 3 }, (_, mi) => ({ title: `Module ${mi}`, order: mi + 1, lessons: Array.from({ length: 3 }, (_, li) => ({ title: `Lesson ${li}`, order: li + 1, content: '<p>Generic test only</p>', steps: [
      { type: 'TEXT', order: 1, content: { html: '<p>Generic test only</p>' } },
      ...Array.from({ length: 3 }, (_, si) => ({ type: 'TASK', order: si + 2, content: { question: `Generic ${si}`, taskType: 'single_choice', options: ['One', 'Two'], correctAnswer: 'One' } })),
    ] })) })), exam: { title: 'Generic test exam', duration: 20, passScore: 75, questions: Array.from({ length: 12 }, (_, i) => ({ text: `Generic ${i}`, type: 'SINGLE_CHOICE', options: ['One', 'Two'], answer: 'One' })) } };
  return { authoringKey: 'pilot-curriculum-v1:C02', revisionHash: revision(course), course };
}
const config = { get: key => ({ PILOT_MODE: 'true', DATABASE_URL: 'postgresql://proctolearn_pilot@127.0.0.1:5434/proctolearn_pilot' })[key] };
test('import DTO rejects arbitrary roles/IDs, unknown authoring key, missing exam and extra root fields', async () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const input = fixture();
  assert.ok(await pipe.transform(input, { type: 'body', metatype: ImportDraftDto }));
  for (const changed of [{ ...input, role: 'ADMIN' }, { ...input, authoringKey: 'whatever' }, { ...input, course: { ...input.course, teacherId: 'attacker' } }, { ...input, course: { ...input.course, exam: undefined } }]) await assert.rejects(pipe.transform(changed, { type: 'body', metatype: ImportDraftDto }));
});
test('import cannot access demo database, publish, or use mismatched hash/task keys', async () => {
  const prisma = { $transaction: () => { throw new Error('Must not touch DB'); } };
  const service = new ContentImportService(prisma, config, new StepsService(prisma));
  await assert.rejects(service.importDraft(fixture(), { id: 'student', role: 'STUDENT' }), error => error.getStatus() === 403);
  const demo = new ContentImportService(prisma, { get: key => key === 'PILOT_MODE' ? 'true' : 'postgresql://local@127.0.0.1/proctolearn_release' }, new StepsService(prisma));
  await assert.rejects(demo.importDraft(fixture(), { id: 'owner', role: 'ADMIN' }), error => error.getStatus() === 403);
  for (const url of ['postgresql://proctolearn_pilot@remote.invalid:5434/proctolearn_pilot', 'postgresql://proctolearn_pilot@127.0.0.1:55432/proctolearn_pilot', 'http://proctolearn_pilot@127.0.0.1:5434/proctolearn_pilot', 'not-a-url']) {
    const wrong = new ContentImportService(prisma, { get: key => key === 'PILOT_MODE' ? 'true' : url }, new StepsService(prisma));
    await assert.rejects(wrong.importDraft(fixture(), { id: 'owner', role: 'ADMIN' }), error => error.getStatus() === 403);
  }
  const input = fixture(); input.course.title += ' changed';
  await assert.rejects(service.importDraft(input, { id: 'owner', role: 'ADMIN' }), error => error.getStatus() === 400);
  const invalid = fixture(); invalid.course.modules[0].lessons[0].steps[1].content.correctAnswer = 'not-option'; invalid.revisionHash = revision(invalid.course);
  await assert.rejects(service.importDraft(invalid, { id: 'owner', role: 'ADMIN' }), error => error.getStatus() === 400);
});
test('existing import cannot overwrite teacher edits, another owner or changed source', async () => {
  const input = fixture();
  const receipt = { ownerId: 'owner', courseId: 'course', revisionHash: input.revisionHash, contentHash: 'changed', course: { teacherId: 'owner', status: 'DRAFT' } };
  const db = { contentImportReceipt: { findUnique: async () => receipt }, course: { findUnique: async () => ({ title: 'Edited by teacher' }) } };
  const service = new ContentImportService({ $transaction: fn => fn(db) }, config, new StepsService({}));
  await assert.rejects(service.importDraft(input, { id: 'owner', role: 'ADMIN' }), error => error.getStatus() === 409);
  await assert.rejects(service.importDraft(input, { id: 'outsider', role: 'TEACHER' }), error => error.getStatus() === 409);
});
module.exports = { fixture, config };
