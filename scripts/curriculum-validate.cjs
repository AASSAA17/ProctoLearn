#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const FOUR = new Set(['C01', 'C04', 'C07', 'C10', 'C13']);
function validateBundles(bundles, exact = true) {
  const errors = []; const warnings = [];
  const counts = { courses: bundles.length, modules: 0, lessons: 0, formative: 0, exams: 0, finalQuestions: 0, projects: 0 };
  const ids = new Set(); const titles = new Set(); const stems = new Set();
  const check = (condition, location, message) => { if (!condition) errors.push({ location, message }); };
  for (const course of bundles) {
    const id = course.authoringId; const numberModules = FOUR.has(id) ? 4 : 3;
    check(/^C(?:0[1-9]|1[0-5])$/.test(id) && !ids.has(id), id, 'Unique known course ID required'); ids.add(id);
    check(typeof course.title === 'string' && course.title.length <= 200 && course.title.trim(), id, 'Title required');
    check(typeof course.description === 'string' && course.description.length <= 20000 && /қазақ/i.test(course.description), id, 'Kazakh audience/prerequisites/outcomes description required');
    check(['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(course.level), id, 'Actual course level required');
    check(course.review === 'HUMAN_REVIEW_PENDING', id, 'Human approval must remain pending');
    check(Array.isArray(course.modules) && course.modules.length === numberModules, id, 'Wrong module count');
    for (const [mi, module] of (course.modules || []).entries()) {
      const moduleId = `${id}/M${mi + 1}`; counts.modules++;
      check(module.order === mi + 1 && module.title?.trim(), moduleId, 'Sequential module order/title');
      check(module.lessons?.length === 3, moduleId, 'Exactly three lessons required');
      for (const [li, lesson] of (module.lessons || []).entries()) {
        const lessonId = `${moduleId}/L${li + 1}`; counts.lessons++;
        check(lesson.order === li + 1 && typeof lesson.title === 'string' && !titles.has(lesson.title), lessonId, 'Distinct title and sequential order required'); titles.add(lesson.title);
        check(typeof lesson.content === 'string' && !/TODO|Lorem ipsum|PLACEHOLDER|TBD/.test(lesson.content), lessonId, 'Original usable lesson content required');
        // Section coverage is a structural gate; it is not a claim of pedagogical quality.
        const html = lesson.content || '';
        for (const [name, expression] of [['objective', /мақсат|нәтиже/i], ['prerequisites', /алғышарт|алдын ала/i], ['worked example', /мысал/i], ['practice', /практик|тәжірибе|тапсырма/i], ['self-check', /өзін.?өзі|өзіндік тексер|тексеру критерий/i], ['mistakes', /қате/i], ['recap', /қорытынды|түйін/i], ['next', /келесі/i]]) check(expression.test(html), lessonId, `Missing ${name} section`);
        check(lesson.steps?.length === 4 && lesson.steps[0]?.type === 'TEXT', lessonId, 'TEXT plus three formative TASK steps required');
        for (const [si, step] of (lesson.steps || []).entries()) {
          check(step.order === si + 1, lessonId, 'Sequential step ordering');
          if (step.type !== 'TASK') continue;
          counts.formative++;
          const task = step.content || {};
          const stem = String(task.question || '').trim().toLowerCase();
          check(stem && !stems.has(stem), lessonId, 'Formative stem duplicated or empty'); stems.add(stem);
          check(['single_choice', 'multiple_choice', 'text_input', 'number_input'].includes(task.taskType), lessonId, 'Unsupported task type');
          if (['single_choice', 'multiple_choice'].includes(task.taskType)) {
            check(Array.isArray(task.options) && task.options.length >= 2 && new Set(task.options).size === task.options.length, lessonId, 'Choice options invalid');
            const answers = Array.isArray(task.correctAnswer) ? task.correctAnswer : [task.correctAnswer];
            check(answers.length && answers.every(answer => task.options?.includes(answer)), lessonId, 'Answer not in options');
          } else check(task.correctAnswer !== undefined && String(task.correctAnswer).trim() && task.correctAnswer !== 'any', lessonId, 'Deterministic key required');
        }
      }
    }
    counts.exams += course.exam ? 1 : 0; counts.projects += course.project ? 1 : 0;
    check(course.project, id, 'Independent self-assessed practice project required');
    check(course.exam?.questions?.length === (numberModules === 4 ? 15 : 12), id, 'Wrong final question count');
    for (const [qi, question] of (course.exam?.questions || []).entries()) {
      counts.finalQuestions++;
      const location = `${id}/exam/Q${qi + 1}`;
      const stem = String(question.text || '').trim().toLowerCase();
      check(stem && !stems.has(stem), location, 'Final stem duplicated, copied from formative, or empty'); stems.add(stem);
      check(['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TEXT'].includes(question.type) && typeof question.answer === 'string' && question.answer.trim() && question.answer !== 'any', location, 'Actual question format/private key required');
      if (question.type === 'SINGLE_CHOICE') check(question.options?.includes(question.answer) && new Set(question.options).size === question.options.length, location, 'Invalid single-choice key/options');
      if (!question.objective && !question.lessonId && !question.assessmentMapping) warnings.push({ location, message: 'Review objective mapping in author bundle/manifest' });
    }
  }
  if (exact) for (const [key, expected] of Object.entries({ courses: 15, modules: 50, lessons: 150, formative: 450, exams: 15, finalQuestions: 195, projects: 15 })) check(counts[key] === expected, 'cohort', `${key}: expected ${expected}, actual ${counts[key]}`);
  return { counts, errors, warnings, humanReview: 'PENDING', at: new Date().toISOString() };
}
function main(args = process.argv.slice(2)) {
  if (args.some(value => !/^C(?:0[1-9]|1[0-5])$/.test(value))) throw new Error('Use curriculum-validate.cjs [C01 ...]');
  const directory = path.join(ROOT, '.local/pilot-author');
  const selected = args.length ? args : Array.from({ length: 15 }, (_, i) => `C${String(i + 1).padStart(2, '0')}`);
  const bundles = selected.map(id => JSON.parse(fs.readFileSync(path.join(directory, 'courses', `${id}.json`))));
  const report = validateBundles(bundles, selected.length === 15);
  fs.writeFileSync(path.join(directory, 'validation.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ counts: report.counts, errors: report.errors.length, warnings: report.warnings.length, humanReview: report.humanReview }));
  if (report.errors.length) process.exitCode = 1;
}
module.exports = { validateBundles, main };
if (require.main === module) { try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
