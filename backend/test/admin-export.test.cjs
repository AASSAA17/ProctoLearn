const { test } = require('node:test');
const assert = require('node:assert/strict');
const readXlsxFile = require('read-excel-file/node');
const { unzipSync, strFromU8 } = require('fflate');
require('reflect-metadata');
const { AdminService } = require('../src/admin/admin.service');

const createdAt = new Date('2026-06-17T12:34:56Z');
const lastSeen = new Date('2026-07-18T08:30:00Z');
const secret = 'SECRET_MUST_NEVER_APPEAR_IN_REPORT';

async function inspectWorkbook(buffer) {
  assert.equal(Buffer.isBuffer(buffer), true, 'controller receives an actual Buffer');
  assert.equal(buffer.subarray(0, 2).toString(), 'PK');
  const files = unzipSync(buffer);
  const xml = Object.fromEntries(Object.entries(files)
    .filter(([name]) => name.endsWith('.xml'))
    .map(([name, contents]) => [name, strFromU8(contents)]));
  const combinedXml = Object.values(xml).join('\n');
  assert.doesNotMatch(combinedXml, /<f(?:\s|>)/, 'user input must not become an Excel formula');
  assert.equal(combinedXml.includes(secret), false, 'private data must not enter any XLSX part');
  assert.equal(Object.keys(files).some((name) => name.includes('externalLink')), false);
  return { sheets: await readXlsxFile(buffer), xml };
}

function assertPresentation(xml, widths, headerColor, alternateColor) {
  const worksheet = xml['xl/worksheets/sheet1.xml'];
  const actualWidths = [...worksheet.matchAll(/<col\b[^>]*\bwidth="([^"]+)"/g)]
    .map((match) => Number(match[1]));
  assert.deepEqual(actualWidths, widths);
  const styles = xml['xl/styles.xml'];
  for (const color of [headerColor, alternateColor, 'FFFFFF']) {
    assert.match(styles, new RegExp(`rgb="(?:FF)?${color}"`, 'i'));
  }
  assert.match(styles, /<b\s*\/>/);
  assert.match(styles, /horizontal="center"/);
  for (const side of ['left', 'right', 'top', 'bottom']) {
    assert.match(styles, new RegExp(`<${side}\\b[^>]*style="thin"`));
  }
}

test('user report round-trips Unicode and numeric counts, keeps formula-like text literal, and excludes secrets', async () => {
  let query;
  const users = [
    {
      id: 'not-an-exported-column', name: '=HYPERLINK("https://example.invalid", "Әли")',
      email: 'қолданушы@example.invalid', phone: '+77010000001', role: 'STUDENT',
      createdAt, lastSeen, _count: { attempts: 12, certificates: 3 },
      passwordHash: secret, refreshTokenHash: secret, passwordResetTokenHash: secret,
    },
    {
      name: 'Әсел & <Ғалым> 🧑‍🎓', email: 'teacher@example.invalid', phone: '001234', role: 'TEACHER',
      createdAt, lastSeen: null, _count: { attempts: 0, certificates: 0 },
      passwordHash: secret,
    },
    {
      name: '@SUM(A1:A2)', email: 'proctor@example.invalid', phone: null, role: 'PROCTOR',
      createdAt, lastSeen: null, _count: { attempts: 1, certificates: 0 },
    },
  ];
  const service = new AdminService({ user: { findMany: async (args) => { query = args; return users; } } });
  const { sheets, xml } = await inspectWorkbook(await service.exportUsersExcel());

  assert.deepEqual(query, {
    select: {
      id: true, name: true, email: true, phone: true, role: true, createdAt: true, lastSeen: true,
      _count: { select: { attempts: true, certificates: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  assert.deepEqual(sheets, [{
    sheet: 'Пайдаланушылар',
    data: [
      ['№', 'Аты-жөні', 'Email', 'Телефон', 'Рөлі', 'Талпынулар', 'Сертификаттар', 'Соңғы белсенділік', 'Тіркелу күні'],
      [1, users[0].name, users[0].email, '+77010000001', 'Студент', 12, 3, lastSeen.toLocaleString('kk-KZ'), createdAt.toLocaleString('kk-KZ')],
      [2, users[1].name, users[1].email, '001234', 'Мұғалім', 0, 0, '—', createdAt.toLocaleString('kk-KZ')],
      [3, users[2].name, users[2].email, '—', 'Проктор', 1, 0, '—', createdAt.toLocaleString('kk-KZ')],
    ],
  }]);
  assertPresentation(xml, [6, 25, 30, 18, 12, 14, 16, 22, 20], '2563EB', 'F0F9FF');
});

test('course report preserves columns, names and aggregation as numeric cells without serializing nested private data', async () => {
  let query;
  const courses = [
    {
      title: 'Қазақ тілі & әдебиет', teacher: { name: '=1+1', passwordHash: secret },
      lessons: [{ id: 'one', assignmentAnswer: secret }, { id: 'two' }],
      exams: [{ _count: { attempts: 5 }, questions: [{ correctAnswer: secret }] }, { _count: { attempts: 7 } }],
      _count: { certificates: 4 }, createdAt, description: secret,
    },
    {
      title: '-42', teacher: { name: 'Ұстаз' }, lessons: [], exams: [],
      _count: { certificates: 0 }, createdAt,
    },
  ];
  const service = new AdminService({ course: { findMany: async (args) => { query = args; return courses; } } });
  const { sheets, xml } = await inspectWorkbook(await service.exportCoursesExcel());
  assert.deepEqual(query, {
    include: {
      teacher: { select: { name: true } }, lessons: { select: { id: true } },
      _count: { select: { certificates: true } },
      exams: { select: { _count: { select: { attempts: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });
  assert.deepEqual(sheets, [{
    sheet: 'Курстар',
    data: [
      ['№', 'Курс атауы', 'Мұғалім', 'Сабақтар', 'Емтихандар', 'Талпынулар', 'Сертификаттар', 'Жасалған күні'],
      [1, courses[0].title, '=1+1', 2, 2, 12, 4, createdAt.toLocaleString('kk-KZ')],
      [2, '-42', 'Ұстаз', 0, 0, 0, 0, createdAt.toLocaleString('kk-KZ')],
    ],
  }]);
  assertPresentation(xml, [6, 35, 25, 12, 14, 14, 16, 20], '16A34A', 'F0FDF4');
});

test('empty exports remain valid workbooks with their named sheet and complete header row', async () => {
  const service = new AdminService({
    user: { findMany: async () => [] }, course: { findMany: async () => [] },
  });
  const users = await inspectWorkbook(await service.exportUsersExcel());
  const courses = await inspectWorkbook(await service.exportCoursesExcel());
  assert.equal(users.sheets[0].sheet, 'Пайдаланушылар');
  assert.equal(users.sheets[0].data.length, 1);
  assert.equal(users.sheets[0].data[0].length, 9);
  assert.equal(courses.sheets[0].sheet, 'Курстар');
  assert.equal(courses.sheets[0].data.length, 1);
  assert.equal(courses.sheets[0].data[0].length, 8);
});
