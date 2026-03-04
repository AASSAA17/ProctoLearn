#!/usr/bin/env node
/**
 * generate-seed-sql.mjs
 * 
 * Generates a seed-users.sql file with 1110 INSERT statements for the "users" table.
 * Directly targets PostgreSQL — bypasses Prisma ORM entirely.
 *
 * Roles breakdown:
 *   - 1000 STUDENT
 *   -   50 TEACHER
 *   -   50 PROCTOR
 *   -   10 ADMIN
 *
 * Usage:  node prisma/generate-seed-sql.mjs
 * Output: prisma/seed-users.sql
 */

import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Kazakh first names (male & female) ───────────────────────────────────────
const FIRST_NAMES_MALE = [
  'Алибек', 'Бауыржан', 'Ғалымжан', 'Дамир', 'Ержан', 'Жанболат', 'Зангар',
  'Ильяс', 'Қайрат', 'Ләззат', 'Мұхтар', 'Нұрлан', 'Олжас', 'Парасат',
  'Рүстем', 'Сәкен', 'Тимур', 'Ұлан', 'Фариз', 'Хасан', 'Шерхан',
  'Ерасыл', 'Арсен', 'Бекзат', 'Санжар', 'Дархан', 'Ерболат', 'Жандос',
  'Мейрам', 'Қуаныш', 'Нұрсұлтан', 'Абай', 'Ақжол', 'Ерік', 'Берік',
  'Мұрат', 'Серік', 'Ділдаш', 'Ғабит', 'Жәнібек',
];

const FIRST_NAMES_FEMALE = [
  'Айгүл', 'Бота', 'Ғалия', 'Дана', 'Еркежан', 'Жансая', 'Зарина',
  'Индира', 'Қарлығаш', 'Ләйла', 'Мадина', 'Нұргүл', 'Оразгүл', 'Перизат',
  'Рабиға', 'Сәуле', 'Тоғжан', 'Ұлжан', 'Фатима', 'Хадиша', 'Шолпан',
  'Аяулым', 'Арайлым', 'Балжан', 'Гүлнәр', 'Динара', 'Еңлік', 'Жібек',
  'Меруерт', 'Қамқа', 'Нәзира', 'Аружан', 'Ақерке', 'Айнұр', 'Бибігүл',
  'Молдір', 'Сымбат', 'Дариға', 'Гүлмира', 'Жанар',
];

const FIRST_NAMES = [...FIRST_NAMES_MALE, ...FIRST_NAMES_FEMALE];

// ── Kazakh surnames ──────────────────────────────────────────────────────────
const SURNAMES = [
  'Әбілқасымов', 'Байтұрсынов', 'Ғаббасов', 'Досмұхамедов', 'Ескендіров',
  'Жұмабаев', 'Зейнолла', 'Ибрагим', 'Қасымов', 'Лұқпанов',
  'Мұстафин', 'Нұрпейісов', 'Оспанов', 'Пірімбетов', 'Рахымжанов',
  'Сүлейменов', 'Тұрсынов', 'Ұзақбаев', 'Файзуллин', 'Хасенов',
  'Шарипов', 'Елеусізов', 'Ахметов', 'Болатов', 'Сатпаев',
  'Джандосов', 'Ерғалиев', 'Жақсылықов', 'Молдағалиев', 'Қуанышбаев',
  'Нұрмағамбетов', 'Абдрахманов', 'Ақылбеков', 'Бекболатов', 'Габдуллин',
  'Дүйсенов', 'Жарылқасынов', 'Ізтілеуов', 'Кенесарин', 'Мәлікбеков',
  'Науанов', 'Оңғарбаев', 'Рысқұлов', 'Сейітов', 'Толебаев',
  'Үмбетов', 'Халықов', 'Шоқанов', 'Ысқақов', 'Әміров',
  'Бектасов', 'Ғұсманов', 'Есенов', 'Жанғозин', 'Қалдыбаев',
  'Мырзабеков', 'Нығметов', 'Сағынтаев', 'Тайманов', 'Құрманғалиев',
];

// ── Transliteration map (Kazakh Cyrillic → Latin) ────────────────────────────
const TRANSLIT = {
  'А': 'A', 'а': 'a', 'Ә': 'A', 'ә': 'a', 'Б': 'B', 'б': 'b',
  'В': 'V', 'в': 'v', 'Г': 'G', 'г': 'g', 'Ғ': 'G', 'ғ': 'g',
  'Д': 'D', 'д': 'd', 'Е': 'E', 'е': 'e', 'Ё': 'Yo', 'ё': 'yo',
  'Ж': 'Zh', 'ж': 'zh', 'З': 'Z', 'з': 'z', 'И': 'I', 'и': 'i',
  'Й': 'Y', 'й': 'y', 'К': 'K', 'к': 'k', 'Қ': 'Q', 'қ': 'q',
  'Л': 'L', 'л': 'l', 'М': 'M', 'м': 'm', 'Н': 'N', 'н': 'n',
  'Ң': 'N', 'ң': 'n', 'О': 'O', 'о': 'o', 'Ө': 'O', 'ө': 'o',
  'П': 'P', 'п': 'p', 'Р': 'R', 'р': 'r', 'С': 'S', 'с': 's',
  'Т': 'T', 'т': 't', 'У': 'U', 'у': 'u', 'Ұ': 'U', 'ұ': 'u',
  'Ү': 'U', 'ү': 'u', 'Ф': 'F', 'ф': 'f', 'Х': 'H', 'х': 'h',
  'Ч': 'Ch', 'ч': 'ch', 'Ш': 'Sh', 'ш': 'sh', 'Щ': 'Sh', 'щ': 'sh',
  'Ъ': '', 'ъ': '', 'Ы': 'Y', 'ы': 'y', 'Ь': '', 'ь': '',
  'І': 'I', 'і': 'i', 'Э': 'E', 'э': 'e', 'Ю': 'Yu', 'ю': 'yu',
  'Я': 'Ya', 'я': 'ya', 'Ц': 'Ts', 'ц': 'ts', 'Л': 'L', 'л': 'l',
  'І': 'I', 'і': 'i', 'Ә': 'A', 'ә': 'a',
};

function transliterate(text) {
  return text
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase();
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPhone(usedPhones) {
  let phone;
  do {
    const num = String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0');
    phone = `+7700${num}`;
  } while (usedPhones.has(phone));
  usedPhones.add(phone);
  return phone;
}

function randomTimestamp() {
  // Random date in the past 6 months (before 2026-03-04)
  const now = new Date('2026-03-04T00:00:00Z');
  const sixMonthsAgo = new Date('2025-09-01T00:00:00Z');
  const ts = sixMonthsAgo.getTime() + Math.random() * (now.getTime() - sixMonthsAgo.getTime());
  return new Date(ts).toISOString().replace('T', ' ').replace('Z', '');
}

function escapeSQL(str) {
  return str.replace(/'/g, "''");
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('⏳ Хэштеу: Test@1234 (bcrypt 12 rounds)...');
  const passwordHash = await bcrypt.hash('Test@1234', 12);
  console.log('✅ Хэш дайын');

  const usedEmails = new Set();
  const usedPhones = new Set();
  const lines = [];

  lines.push('-- ==========================================================');
  lines.push('-- seed-users.sql');
  lines.push('-- 1110 Қазақ пайдаланушылар (PostgreSQL тікелей INSERT)');
  lines.push('-- Құпиясөз: Test@1234 (bcrypt 12 salt rounds)');
  lines.push(`-- Жасалған: ${new Date().toISOString()}`);
  lines.push('-- ==========================================================');
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');

  const roleCounts = [
    { role: 'STUDENT', count: 1000 },
    { role: 'TEACHER', count: 50 },
    { role: 'PROCTOR', count: 50 },
    { role: 'ADMIN', count: 10 },
  ];

  let total = 0;

  for (const { role, count } of roleCounts) {
    lines.push(`-- ── ${role} (${count}) ──`);

    for (let i = 0; i < count; i++) {
      const firstName = pick(FIRST_NAMES);
      const lastName = pick(SURNAMES);
      const fullName = `${firstName} ${lastName}`;

      // Generate unique email
      const base = transliterate(firstName) + '.' + transliterate(lastName);
      let email;
      let suffix = 0;
      do {
        email = suffix === 0
          ? `${base}@proctolearn.kz`
          : `${base}${suffix}@proctolearn.kz`;
        suffix++;
      } while (usedEmails.has(email));
      usedEmails.add(email);

      const id = randomUUID();
      const phone = randomPhone(usedPhones);
      const createdAt = randomTimestamp();

      lines.push(
        `INSERT INTO "users" ("id", "name", "email", "phone", "password", "role", "createdAt", "isOnline", "mustChangePassword")` +
        ` VALUES ('${id}', '${escapeSQL(fullName)}', '${email}', '${phone}', '${escapeSQL(passwordHash)}', '${role}'::"Role", '${createdAt}', false, false)` +
        ` ON CONFLICT ("email") DO NOTHING;`
      );

      total++;
    }

    lines.push('');
  }

  lines.push('COMMIT;');
  lines.push('');
  lines.push(`-- Барлығы: ${total} пайдаланушы`);
  lines.push(`-- STUDENT: 1000, TEACHER: 50, PROCTOR: 50, ADMIN: 10`);

  const outPath = join(__dirname, 'seed-users.sql');
  writeFileSync(outPath, lines.join('\n'), 'utf-8');
  console.log(`\n🎉 ${total} INSERT жолы жасалды → ${outPath}`);
  console.log('');
  console.log('Іске қосу:');
  console.log('  docker exec -i proctolearn_postgres psql -U postgres -d proctolearn_db < prisma/seed-users.sql');
}

main().catch((e) => {
  console.error('❌ Қате:', e);
  process.exit(1);
});
