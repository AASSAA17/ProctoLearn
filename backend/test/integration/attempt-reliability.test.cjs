const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('reflect-metadata');
const { PrismaClient } = require('@prisma/client');
const { ConfigService } = require('@nestjs/config');
const { AttemptsService } = require('../../src/attempts/attempts.service');
const { ExamsService } = require('../../src/exams/exams.service');
const url = process.env.TEST_DATABASE_URL;
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname) || new URL(url).pathname !== '/proctolearn_security_test') throw new Error('Dedicated local test database required');
const code = (value) => (error) => error.getResponse?.().code === value;

test('PostgreSQL immutable exams, draft races, retries and admission regressions', async (t) => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const [teacherId, studentId, intruderId, courseId, flatId, moduleId, moduleLessonId, taskId] = Array.from({ length: 8 }, () => randomUUID());
  const service = new AttemptsService(db, { issue: () => assert.fail('No certificate before review') }, new ConfigService({}));
  const exams = new ExamsService(db);
  const createExam = async () => {
    const [id, q1, q2] = Array.from({ length: 3 }, () => randomUUID());
    await db.exam.create({ data: { id, courseId, title: 'Original fixture exam', duration: 30, passScore: 60, questions: { create: [
      { id: q1, text: 'Original question', type: 'SINGLE_CHOICE', answer: 'A', options: ['A', 'B'] },
      { id: q2, text: 'Select two', type: 'MULTIPLE_CHOICE', answer: 'B,C', options: ['B', 'C', 'D'] },
    ] } } });
    return { id, q1, q2, correct: { answers: [{ questionId: q1, answer: 'A' }, { questionId: q2, answer: 'B,C' }] }, wrong: { answers: [{ questionId: q1, answer: 'B' }, { questionId: q2, answer: 'D' }] } };
  };
  const start = async () => {
    const exam = await createExam();
    return { exam, attempt: await service.startAttempt(exam.id, studentId) };
  };
  try {
    await db.user.createMany({ data: [teacherId, studentId, intruderId].map((id, index) => ({ id, name: 'Reliability fixture', email: `${id}@example.invalid`, password: 'not-a-login-hash', role: index ? 'STUDENT' : 'TEACHER' })) });
    await db.course.create({ data: { id: courseId, title: 'Reliability fixture', teacherId } });
    await db.enrollment.create({ data: { userId: studentId, courseId } });
    await db.lesson.create({ data: { id: flatId, courseId, title: 'Material', content: 'Text', order: 1 } });
    await db.courseModule.create({ data: { id: moduleId, courseId, title: 'Module', order: 1 } });
    await db.lesson.create({ data: { id: moduleLessonId, moduleId, title: 'Verified assignment', content: 'Assignment', assignmentAnswer: 'yes', order: 1 } });
    await db.step.create({ data: { id: taskId, lessonId: moduleLessonId, type: 'TASK', order: 1, content: { question: 'Task', correctAnswer: 'yes' } } });

    await t.test('both flat/module lessons require completed material, verified written assignment and successful task submission', async () => {
      const exam = await createExam();
      await assert.rejects(service.startAttempt(exam.id, studentId), code('COURSE_INCOMPLETE'));
      await db.lessonProgress.createMany({ data: [{ userId: studentId, courseId, lessonId: flatId, completionSource: 'MATERIAL' }, { userId: studentId, courseId, lessonId: moduleLessonId, completionSource: 'LEGACY' }] });
      await assert.rejects(service.startAttempt(exam.id, studentId), code('COURSE_INCOMPLETE'));
      await db.lessonProgress.update({ where: { userId_lessonId: { userId: studentId, lessonId: moduleLessonId } }, data: { completionSource: 'ASSIGNMENT' } });
      await assert.rejects(service.startAttempt(exam.id, studentId), code('COURSE_INCOMPLETE'));
      await db.submission.create({ data: { userId: studentId, stepId: taskId, answer: 'yes', isCorrect: true, score: 100 } });
      const attempt = await service.startAttempt(exam.id, studentId);
      assert.equal(attempt.status, 'IN_PROGRESS');
    });

    await t.test('concurrent additions at 999 commit exactly 1000 questions, with full-size draft/submission and legacy rejection', async () => {
      const viewer = { id: teacherId, role: 'TEACHER' };
      const question = { text: 'Maximum fixture', type: 'SINGLE_CHOICE', options: ['A', 'B'], answer: 'A' };
      const exam = await exams.create(courseId, { title: 'Maximum fixture', duration: 30, questions: Array(999).fill(question) }, viewer);
      // Force both first transactions to read 999 before either can insert.
      // Retries bypass the barrier and must observe the winner's committed row.
      let arrivals = 0;
      let release;
      const bothRead = new Promise((resolve) => { release = resolve; });
      const racingDb = {
        $transaction: (work, options) => db.$transaction(async (tx) => {
          const wrapped = new Proxy(tx, { get(target, property) {
            if (property !== 'exam') return target[property];
            return new Proxy(tx.exam, { get(model, method) {
              if (method !== 'findUnique') return model[method];
              return async (query) => {
                const result = await model.findUnique(query);
                if (arrivals < 2) {
                  arrivals += 1;
                  if (arrivals === 2) release();
                  await bothRead;
                }
                return result;
              };
            } });
          } });
          return work(wrapped);
        }, options),
      };
      const racingExams = new ExamsService(racingDb);
      const results = await Promise.allSettled([
        racingExams.addQuestion(courseId, exam.id, question, viewer),
        racingExams.addQuestion(courseId, exam.id, question, viewer),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.find((result) => result.status === 'rejected').reason.getResponse().code, 'EXAM_QUESTION_LIMIT');
      assert.equal(await db.question.count({ where: { examId: exam.id } }), 1000);
      const attempt = await service.startAttempt(exam.id, studentId);
      const answers = attempt.exam.questions.map(({ id }) => ({ questionId: id, answer: 'A' }));
      assert.equal((await service.saveDraft(attempt.id, { revision: 0, answers }, studentId)).answers.length, 1000);
      // Simulate an oversized legacy exam without touching the active snapshot.
      await db.question.create({ data: { examId: exam.id, ...question } });
      assert.equal((await service.startAttempt(exam.id, studentId)).exam.questions.length, 1000);
      const result = await service.submitAnswers(attempt.id, { answers }, studentId);
      assert.equal(result.score, 100);
      assert.equal(await db.answer.count({ where: { attemptId: attempt.id } }), 1000);
      await assert.rejects(service.startAttempt(exam.id, studentId), code('EXAM_QUESTION_LIMIT'));
    });

    await t.test('concurrent draft writes have one winner and cannot silently overwrite a newer revision', async () => {
      const { exam, attempt } = await start();
      const results = await Promise.allSettled([
        service.saveDraft(attempt.id, { revision: 0, ...exam.correct }, studentId),
        service.saveDraft(attempt.id, { revision: 0, ...exam.wrong }, studentId),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      const loser = results.find((result) => result.status === 'rejected');
      assert.equal(loser.reason.getResponse().code, 'DRAFT_CONFLICT');
      const winner = results.find((result) => result.status === 'fulfilled').value;
      assert.deepEqual((await service.getDraft(attempt.id, studentId)).answers, winner.answers);
      const resumed = await service.startAttempt(exam.id, studentId);
      assert.deepEqual(resumed.draft.answers, winner.answers);
      assert.equal(resumed.draft.revision, 1);
    });

    await t.test('immutable snapshot preserves grading, question text, pass score and deadline after direct exam edits', async () => {
      const { exam, attempt } = await start();
      await db.exam.update({ where: { id: exam.id }, data: { title: 'Edited fixture exam', duration: 1, passScore: 100 } });
      await db.question.update({ where: { id: exam.q1 }, data: { answer: 'B', text: 'Changed question' } });
      await db.attempt.update({ where: { id: attempt.id }, data: { startedAt: new Date(Date.now() - 10 * 60_000) } });
      const resumed = await service.startAttempt(exam.id, studentId);
      assert.equal(resumed.exam.title, 'Original fixture exam');
      assert.equal(resumed.exam.duration, 30);
      assert.equal(resumed.exam.passScore, 60);
      assert.equal(resumed.exam.questions.find((question) => question.id === exam.q1).text, 'Original question');
      assert.equal((await service.submitAnswers(attempt.id, exam.correct, studentId)).score, 100);
    });

    await t.test('concurrent identical submits persist one result and return it successfully to both clients', async () => {
      const { exam, attempt } = await start();
      const results = await Promise.all([service.submitAnswers(attempt.id, exam.correct, studentId), service.submitAnswers(attempt.id, exam.correct, studentId)]);
      assert.deepEqual(results[0], results[1]);
      assert.equal(results[0].certificatePending, true);
      assert.equal(await db.answer.count({ where: { attemptId: attempt.id } }), 2);
      assert.equal(await db.certificate.count({ where: { userId: studentId, courseId } }), 0);
      assert.equal((await db.enrollment.findUnique({ where: { userId_courseId: { userId: studentId, courseId } } })).completedAt, null);
    });

    await t.test('concurrent different submits preserve one answer set and reject the conflicting result', async () => {
      const { exam, attempt } = await start();
      const results = await Promise.allSettled([service.submitAnswers(attempt.id, exam.correct, studentId), service.submitAnswers(attempt.id, exam.wrong, studentId)]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(results.find((result) => result.status === 'rejected').reason.getResponse().code, 'SUBMISSION_CONFLICT');
      assert.equal(await db.answer.count({ where: { attemptId: attempt.id } }), 2);
    });

    await t.test('a draft racing final submission cannot reopen or overwrite the final answer set', async () => {
      const { exam, attempt } = await start();
      const [saved, submitted] = await Promise.allSettled([
        service.saveDraft(attempt.id, { revision: 0, ...exam.wrong }, studentId),
        service.submitAnswers(attempt.id, exam.correct, studentId),
      ]);
      assert.equal(submitted.status, 'fulfilled');
      if (saved.status === 'rejected') assert.equal(saved.reason.getResponse().code, 'ATTEMPT_CLOSED');
      const persisted = await db.attempt.findUnique({ where: { id: attempt.id } });
      assert.equal(persisted.score, 100);
      assert.deepEqual(persisted.draftAnswers, []);
      assert.equal(await db.answer.count({ where: { attemptId: attempt.id, isCorrect: true } }), 2);
    });

    await t.test('late requests finalize saved draft and never grade the late payload', async () => {
      const { exam, attempt } = await start();
      await service.saveDraft(attempt.id, { revision: 0, ...exam.correct }, studentId);
      await db.attempt.update({ where: { id: attempt.id }, data: { startedAt: new Date(0) } });
      await assert.rejects(service.submitAnswers(attempt.id, exam.wrong, studentId), code('EXAM_EXPIRED'));
      const persisted = await db.attempt.findUnique({ where: { id: attempt.id } });
      assert.equal(persisted.score, 100);
      assert.equal(persisted.status, 'FINISHED');
      assert.equal(persisted.reviewStatus, 'PENDING');
      assert.equal(await db.certificate.count({ where: { courseId } }), 0);
    });

    await t.test('exam editing closes expired attempts from saved draft without changing their snapshot', async () => {
      const { exam, attempt } = await start();
      await service.saveDraft(attempt.id, { revision: 0, ...exam.correct }, studentId);
      await assert.rejects(exams.update(courseId, exam.id, { duration: 1 }, { id: teacherId, role: 'TEACHER' }), (error) => error.getStatus() === 409);
      await db.attempt.update({ where: { id: attempt.id }, data: { startedAt: new Date(0) } });
      await exams.update(courseId, exam.id, { duration: 1 }, { id: teacherId, role: 'TEACHER' });
      const persisted = await db.attempt.findUnique({ where: { id: attempt.id } });
      assert.equal(persisted.score, 100);
      assert.equal(persisted.examSnapshot.duration, 30);
    });

    await t.test('foreign draft access fails and public attempt data contains no private persistence fields', async () => {
      const { exam, attempt } = await start();
      await assert.rejects(service.getDraft(attempt.id, intruderId), (error) => error.getStatus() === 403);
      await assert.rejects(service.saveDraft(attempt.id, { revision: 0, ...exam.correct }, intruderId), (error) => error.getStatus() === 403);
      await assert.rejects(service.submitAnswers(attempt.id, exam.correct, intruderId), (error) => error.getStatus() === 403);
      await service.saveDraft(attempt.id, { revision: 0, answers: [{ questionId: exam.q1, answer: 'private-draft-marker' }] }, studentId);
      for (const result of [await service.getAttempt(attempt.id, studentId), await service.getUserAttempts(studentId), await service.getAllAttempts({ id: teacherId, role: 'TEACHER' })]) {
        const text = JSON.stringify(result);
        for (const field of ['examSnapshot', 'draftAnswers', 'submissionDigest', 'private-draft-marker']) assert.equal(text.includes(field), false);
      }
    });

    await t.test('concurrent history reads finalize an expired saved draft once and return its result', async () => {
      const { exam, attempt } = await start();
      await service.saveDraft(attempt.id, { revision: 0, ...exam.correct }, studentId);
      await db.attempt.update({ where: { id: attempt.id }, data: { startedAt: new Date(0) } });
      await assert.rejects(service.getAttempt(attempt.id, intruderId), (error) => error.getStatus() === 403);
      assert.equal((await db.attempt.findUnique({ where: { id: attempt.id } })).status, 'IN_PROGRESS');
      const [detail, history] = await Promise.all([service.getAttempt(attempt.id, studentId), service.getUserAttempts(studentId)]);
      assert.equal(detail.score, 100);
      assert.equal(detail.status, 'FINISHED');
      assert.equal(detail.answers.length, 2);
      assert.equal(history.find((row) => row.id === attempt.id).status, 'FINISHED');
      assert.equal(await db.answer.count({ where: { attemptId: attempt.id } }), 2);
    });
  } finally {
    await db.attempt.deleteMany({ where: { exam: { courseId } } });
    await db.certificate.deleteMany({ where: { courseId } });
    await db.course.deleteMany({ where: { id: courseId } });
    await db.user.deleteMany({ where: { id: { in: [teacherId, studentId, intruderId] } } });
    await db.$disconnect();
  }
});
