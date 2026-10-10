'use strict';
// Reads private author bundles only; outputs counts, never question text or keys.
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { ValidationPipe } = require('@nestjs/common');
const { StepsService } = require('../src/steps/steps.service');
const { validatedQuestion } = require('../src/exams/question-policy');
const { normalizedAnswer } = require('../src/attempts/attempt-state');
const { AnswerDto } = require('../src/attempts/dto/attempt.dto');
const { ImportDraftDto } = require('../src/content-import/content-import.dto');
const { payload } = require('../../scripts/curriculum-import.cjs');
(async () => {
  const directory = path.resolve(__dirname, '../../.local/pilot-author');
  const ids = process.argv.slice(2);
  if (ids.some(id => !/^C(?:0[1-9]|1[0-5])$/.test(id))) throw new Error('Known course IDs required');
  const files = ids.length ? ids.map(id => `${id}.json`) : fs.readdirSync(path.join(directory, 'courses')).filter(file => /^C\d{2}\.json$/.test(file));
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const grader = new StepsService({}); const counts = { courses: files.length, formative: 0, final: 0, scoringChecks: 0, malformedChecks: 0 };
  for (const file of files) {
    const bundle = JSON.parse(fs.readFileSync(path.join(directory, 'courses', file)));
    const mapped = payload(bundle);
    const transformed = await pipe.transform(mapped, { type: 'body', metatype: ImportDraftDto });
    assert.deepEqual(JSON.parse(JSON.stringify(transformed)), mapped, 'Import transform must not silently change hashed fields');
    for (const module of bundle.modules) for (const lesson of module.lessons) for (const step of lesson.steps) {
      if (step.type !== 'TASK') continue;
      grader.validateTask(step.type, step.content);
      const task = step.content; let good, bad, malformed;
      if (task.taskType === 'single_choice') { good = { selected: task.correctAnswer }; bad = { selected: task.options.find(option => option !== task.correctAnswer) }; malformed = { selected: [] }; }
      if (task.taskType === 'multiple_choice') { good = { selected: task.correctAnswer }; bad = { selected: [] }; malformed = { selected: [1] }; }
      if (task.taskType === 'text_input') { good = { text: task.correctAnswer }; bad = { text: '__definitely_wrong__' }; malformed = { text: {} }; }
      if (task.taskType === 'number_input') { good = { value: task.correctAnswer }; bad = { value: Number(task.correctAnswer) + 1 }; malformed = { value: [] }; }
      assert.equal(grader.checkAnswer(task, good).score, 100); assert.equal(grader.checkAnswer(task, bad).score, 0); assert.throws(() => grader.checkAnswer(task, malformed));
      counts.formative++; counts.scoringChecks += 2; counts.malformedChecks++;
    }
    for (const raw of bundle.exam.questions) {
      const question = validatedQuestion(raw); const key = normalizedAnswer(question.answer, question.type);
      assert.equal(normalizedAnswer(question.answer, question.type), key);
      assert.notEqual(normalizedAnswer('__definitely_wrong__', question.type), key);
      await assert.rejects(pipe.transform({ questionId: 'synthetic-id', answer: {} }, { type: 'body', metatype: AnswerDto }));
      counts.final++; counts.scoringChecks += 2; counts.malformedChecks++;
    }
  }
  fs.writeFileSync(path.join(directory, 'scoring-report.json'), JSON.stringify({ status: 'PASS', at: new Date().toISOString(), counts, scope: 'Actual deterministic grader functions and request DTOs; no exam bypass or semantic/code execution claim' }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ status: 'PASS', counts }));
})().catch(error => { console.error(`${error.name}: scoring/DTO assertion failed; review locally without publishing private bank. ${error.message.includes('hashed fields') ? 'Import hash normalization differs.' : ''}`); process.exitCode = 1; });
