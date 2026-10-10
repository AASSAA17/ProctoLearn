'use strict';
// Offline authoring fixture: private keys remain in the backend DB, never public assets.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const backendRequire = createRequire(path.join(__dirname, '../backend/package.json'));
const COURSE_ID = 'demo-release-web-foundations-v1';
const EXAM_ID = 'demo-release-web-exam-v1';
const text = html => ({ type: 'TEXT', order: 1, content: { html } });
const lessons = [
  { title: 'HTML құжатының қаңқасы', content: 'HTML мазмұнның мағынасын белгілейді. head метадеректерді, body көрінетін мазмұнды сақтайды.',
    steps: [text('<h2>Беттің құрылымы</h2><p>HTML браузерге мазмұнның мағынасын түсіндіреді. Құжат <code>&lt;!doctype html&gt;</code> жолынан басталады. <code>html</code> ішіндегі <code>head</code> бет атауы мен кодтау туралы метадеректерді сақтайды. <code>body</code> оқырман көретін мазмұнды қамтиды.</p><pre>&lt;!doctype html&gt;\n&lt;html lang="kk"&gt;\n  &lt;head&gt;&lt;meta charset="UTF-8"&gt;&lt;title&gt;Менің бетім&lt;/title&gt;&lt;/head&gt;\n  &lt;body&gt;&lt;h1&gt;Сәлем!&lt;/h1&gt;&lt;p&gt;Бұл менің алғашқы бетім.&lt;/p&gt;&lt;/body&gt;\n&lt;/html&gt;</pre><p>Мысалды өз файлыңызға сақтап, браузерде ашыңыз. title қойындының атауына, h1 беттегі негізгі тақырыпқа әсер ететінін байқаңыз.</p>')] },
  { title: 'Құрылымды көру — қысқа демонстрациялық клип', content: 'Бұл дыбыссыз түпнұсқа демонстрациялық клип head пен body айырмашылығын көрсетеді. Толық бейнелекция емес. Мәтіндік баламасы: head — метадеректер; body — көрінетін мазмұн; h1 — негізгі тақырып; p — абзац.',
    videoUrl: '/demo/html-structure.webm',
    steps: [{ type: 'VIDEO', order: 1, content: { videoUrl: '/demo/html-structure.webm', description: 'Түпнұсқа дыбыссыз демонстрациялық клип, толық лекция емес. head — метадеректер; body — көрінетін мазмұн; h1 — тақырып; p — абзац.' } },
      { ...text('<p>Клиптің мәтіндік баламасы: HTML ағашының түбірі — html. head ішінде title сияқты метадеректер болады. body ішінде h1 тақырыбы мен p абзацы көрсетіледі. Құрылым мазмұнның мағынасын сақтайды.</p>'), order: 2 }] },
  { title: 'Семантика және қолжетімділік', content: 'h1 негізгі тақырыпты, p абзацты, a сілтемені белгілейді. Суреттің alt мәтіні оның мағынасын түсіндіреді.',
    steps: [text('<h2>Мағынасы бар элементті таңдаңыз</h2><p>Негізгі тақырып үшін h1, абзац үшін p, сілтеме үшін a қолданыңыз. Сілтеменің href атрибутында мақсаттың мекенжайы сақталады. «Мұнда бас» орнына мақсатты сипаттайтын мәтін жазыңыз: «Курс бағдарламасын оқу».</p><p>Суреттің alt атрибуты маңызды көрнекі ақпаратты мәтінмен береді. Сәндік сурет үшін бос alt қолдануға болады. Форманың әр өрісіне label беріңіз. Бетті тек пернетақтамен қарап, фокус көрінетінін тексеріңіз.</p>')] },
  { title: 'CSS: түс, аралық және оқылымдылық', content: 'CSS көріністі басқарады. color мәтін түсін, padding ішкі аралықты, margin сыртқы аралықты өзгертеді.',
    steps: [text('<h2>Мазмұннан көрініске</h2><pre>.card {\n  color: #172033;\n  background: #ffffff;\n  padding: 24px;\n  margin: 16px;\n}</pre><p>Нүктеден басталатын .card — class селекторы. color мәтіннің түсін өзгертеді. padding мазмұн мен элемент шекарасы арасындағы ішкі аралықты, margin элемент сыртындағы аралықты басқарады.</p><p>Телефонда көлденең айналдыру болмасын. Мәтінді үлкейтіп, ұзын тақырыптар мен батырмалардың сыйғанын тексеріңіз. Түс ақпараттың жалғыз белгісі болмауы керек.</p>')] },
  { title: 'Практика: оқуға ыңғайлы карточка', content: 'Карточканың мазмұны шекараға тиіп тұр. Қай CSS қасиеті ішкі аралық қосады? Алдыңғы мысалға сүйеніп таңдаңыз.',
    steps: [text('<h2>Карточканы жақсарту</h2><p>Карточкада тақырып пен абзац бар, бірақ мәтін шекараға тым жақын. Мазмұн мен шекара арасындағы аралықты арттыратын қасиетті таңдаңыз. Бұл тапсырма серверде дәл жауаппен автоматты тексеріледі; еркін код орындалмайды.</p>'),
      { type: 'TASK', order: 2, content: { taskType: 'single_choice', question: 'Мазмұн мен карточка шекарасының арасына 24px бос орын қосатын жазба қайсы?', options: ['padding: 24px', 'color: 24px', 'href: 24px', 'title: 24px'], correctAnswer: 'padding: 24px' } }] },
];
const questions = [
  { text: 'Көрінетін бет мазмұны қай элементте орналасады?', type: 'SINGLE_CHOICE', options: ['head', 'body', 'meta'], answer: 'body' },
  { text: 'Қойындының атауын белгілейтін элементті жазыңыз (жақшасыз).', type: 'TEXT', answer: 'title' },
  { text: 'Негізгі тақырып пен абзац элементтерін таңдаңыз.', type: 'MULTIPLE_CHOICE', options: ['h1', 'p', 'meta', 'title'], answer: JSON.stringify(['h1', 'p']) },
  { text: 'Сілтеменің мақсатты мекенжайын қай атрибут сақтайды?', type: 'SINGLE_CHOICE', options: ['href', 'alt', 'lang'], answer: 'href' },
  { text: 'Мағыналы суретке мәтіндік балама беретін атрибутты жазыңыз.', type: 'TEXT', answer: 'alt' },
  { text: 'CSS мәтіннің түсін қай қасиетпен өзгертеді?', type: 'SINGLE_CHOICE', options: ['color', 'padding', 'margin'], answer: 'color' },
  { text: 'Ішкі және сыртқы аралық қасиеттерін таңдаңыз.', type: 'MULTIPLE_CHOICE', options: ['padding', 'margin', 'href', 'title'], answer: JSON.stringify(['padding', 'margin']) },
  { text: 'class="card" элементінің CSS селекторы қайсы?', type: 'SINGLE_CHOICE', options: ['.card', '#card', '<card>'], answer: '.card' },
];
function courseData() {
  return {
    id: COURSE_ID, title: 'Веб-әзірлеу негіздері — демонстрациялық курс', teacherId: 'demo-release-teacher', level: 'BEGINNER',
    description: 'Қазақ тіліндегі түпнұсқа шағын демо курс. Аудитория: веб-әзірлеуді алғаш үйренетіндер. Алғышарт: браузер мен мәтіндік редакторды қолдану. Нәтиже: HTML құрылымын түсіндіру, семантикалық элементтерді таңдау және CSS аралықтарын ажырату. 2 модуль, 5 қысқа сабақ, автоматты практика, 8 сұрақтық емтихан (3 минут, өту шегі 75%). Видео — дыбыссыз қысқа демонстрациялық клип; толық лекция кейін дайындалады.',
    modules: { create: [
      { id: 'demo-release-module-html', title: '1. HTML және мағыналы мазмұн', order: 1 },
      { id: 'demo-release-module-css', title: '2. CSS және практика', order: 2 },
    ] },
    exams: { create: { id: EXAM_ID, title: 'Веб негіздері — қорытынды демо емтихан', duration: 3, passScore: 75,
      questions: { create: questions.map((question, index) => ({ ...question, id: `demo-release-question-${index + 1}` })) },
      proctorAssignments: { create: [{ proctorId: 'demo-release-proctor' }, { proctorId: 'demo-release-proctor-appeal' }] },
    } },
  };
}
async function seed(env = process.env) {
  if (env.NODE_ENV === 'production' || env.ALLOW_DEMO_SEED !== 'true') throw new Error('Release seed requires the explicit development demo profile.');
  const directory = path.resolve(env.DEMO_RELEASE_DIR || '');
  const expected = path.resolve(__dirname, '../.local/release-demo');
  if (directory !== expected || JSON.parse(fs.readFileSync(path.join(directory, 'ownership.json'))).kind !== 'proctolearn-isolated-release-v1') throw new Error('Release ownership marker mismatch.');
  const local = require('./demo-release.cjs').prepare(directory);
  if (env.DATABASE_URL !== require('./local-launch.cjs').connectionUrl(local)) throw new Error('Release seed database differs from its private profile.');
  const accounts = JSON.parse(fs.readFileSync(path.join(directory, 'accounts.json')));
  const { PrismaClient, Prisma } = backendRequire('@prisma/client');
  const bcrypt = backendRequire('bcryptjs');
  const prisma = new PrismaClient();
  try {
    for (const account of accounts) {
      const existing = await prisma.user.findUnique({ where: { email: account.email } });
      if (existing && existing.id !== account.id) throw new Error('A demo email belongs to an unmarked account; no password was changed.');
    }
    const existingCourse = await prisma.course.findUnique({ where: { id: COURSE_ID } });
    if (existingCourse && existingCourse.teacherId !== 'demo-release-teacher') throw new Error('Demo course ownership changed; preserving it.');
    const hashed = await Promise.all(accounts.map(async account => ({ ...account, password: await bcrypt.hash(account.password, 12) })));
    await prisma.$transaction(async tx => {
      for (const account of hashed) await tx.user.upsert({ where: { id: account.id }, update: {}, create: account });
      if (!existingCourse) {
        const data = courseData();
        const courseFields = Prisma.dmmf.datamodel.models.find(model => model.name === 'Course').fields;
        if (courseFields.some(field => field.name === 'status')) { data.status = 'PUBLISHED'; data.publishedAt = new Date(); }
        await tx.course.create({ data });
        for (const [index, lesson] of lessons.entries()) await tx.lesson.create({ data: {
          ...lesson, id: `demo-release-lesson-${index + 1}`, order: index + 1, moduleId: index < 3 ? 'demo-release-module-html' : 'demo-release-module-css',
          steps: { create: lesson.steps.map((step, stepIndex) => ({ ...step, id: `demo-release-step-${index + 1}-${stepIndex + 1}` })) },
        } });
      }
    }, { timeout: 30000 });
    console.log('Release seed ready: 8 fictional accounts and one original course. Existing content/passwords/progress preserved. Learner states require real domain transitions.');
  } finally { await prisma.$disconnect(); }
}
module.exports = { seed, lessons, questions, courseData, COURSE_ID, EXAM_ID };
if (require.main === module) seed().catch(() => { console.error('Release seed failed; check profile ownership and migration state. No existing passwords were overwritten.'); process.exitCode = 1; });
