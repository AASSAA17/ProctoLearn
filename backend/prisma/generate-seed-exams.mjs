#!/usr/bin/env node
/**
 * generate-seed-exams.mjs
 *
 * Generates seed-exams.sql with INSERT statements for exams + questions
 * for ALL courses that currently have no exam.
 *
 * Each exam gets 5 SINGLE_CHOICE questions with 4 options.
 * Questions are generated in Kazakh based on the course topic.
 *
 * Usage:  node prisma/generate-seed-exams.mjs
 * Output: prisma/seed-exams.sql
 *
 * Then run:
 *   docker cp backend/prisma/seed-exams.sql proctolearn_postgres:/tmp/seed-exams.sql
 *   docker exec proctolearn_postgres psql -U postgres -d proctolearn_db -f /tmp/seed-exams.sql
 */

import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function esc(s) { return s.replace(/'/g, "''"); }

// ── Question bank templates ────────────────────────────────────────────────
// Each template produces a question relevant to almost any topic.
// The generator picks from these templates and customizes per course.

function generateQuestionsForCourse(courseTitle) {
  // We'll create 5 topic-relevant questions per course
  // by using the course title as context
  const topic = courseTitle;

  const questions = [
    {
      text: `"${topic}" курсының негізгі мақсаты қандай?`,
      options: [
        `${topic} бойынша теориялық білім алу`,
        `${topic} бойынша практикалық дағды дамыту`,
        `${topic} бойынша толық білім беру және дағды қалыптастыру`,
        `Тек ${topic} тарихын оқып-үйрену`,
      ],
      answer: `${topic} бойынша толық білім беру және дағды қалыптастыру`,
    },
    {
      text: `"${topic}" курсында қандай оқыту әдісі тиімді?`,
      options: [
        'Тек дәрістерді тыңдау',
        'Теория мен практиканы ұштастыру',
        'Тек тест тапсыру',
        'Тек кітап оқу',
      ],
      answer: 'Теория мен практиканы ұштастыру',
    },
    {
      text: `"${topic}" саласында жаңа бастаған адам алдымен нені үйренуі керек?`,
      options: [
        'Күрделі тақырыптарды бірден бастау',
        'Негізгі түсініктер мен терминдерді меңгеру',
        'Тек жоғары деңгей материалдарын оқу',
        'Ешнәрсесіз бірден жобаға кірісу',
      ],
      answer: 'Негізгі түсініктер мен терминдерді меңгеру',
    },
    {
      text: `"${topic}" курсын аяқтағаннан кейін студент нені білуі тиіс?`,
      options: [
        `Тек ${topic} теориясын`,
        `${topic} бойынша негізгі дағдыларды қолдана алу`,
        'Тек формулаларды жаттау',
        'Басқа салаларды да толық білу',
      ],
      answer: `${topic} бойынша негізгі дағдыларды қолдана алу`,
    },
    {
      text: `"${topic}" бойынша білім деңгейін қалай тексеруге болады?`,
      options: [
        'Тек оқулықты қайта оқу',
        'Практикалық тапсырмалар мен тестілер арқылы',
        'Ешнәрсе жасамай күту',
        'Тек дәрісті тағы бір рет тыңдау',
      ],
      answer: 'Практикалық тапсырмалар мен тестілер арқылы',
    },
  ];

  return questions;
}

// ── Additional varied question banks for diversity ─────────────────────────
const EXTRA_QUESTION_BANKS = [
  // Bank A — learning methodology
  [
    {
      text: (t) => `"${t}" курсындағы ең маңызды дағды қандай?`,
      opts: (t) => [
        `${t} тақырыбын талдай алу`,
        'Тек жатталымдау',
        'Ешнәрсе жасамау',
        'Тек басқалардан көшіру',
      ],
      ans: (t) => `${t} тақырыбын талдай алу`,
    },
    {
      text: (t) => `"${t}" саласындағы кәсіпқой маман қандай қасиетке ие болуы керек?`,
      opts: () => [
        'Аналитикалық ойлау мен шығармашылық',
        'Тек жад',
        'Тек жылдамдық',
        'Тек тәжірибе',
      ],
      ans: () => 'Аналитикалық ойлау мен шығармашылық',
    },
    {
      text: (t) => `"${t}" бойынша материалды қалай тиімді меңгеруге болады?`,
      opts: () => [
        'Тұрақты практика және қайталау',
        'Бір күнде барлығын оқу',
        'Тек емтиханға дайындалу',
        'Тек видео көру',
      ],
      ans: () => 'Тұрақты практика және қайталау',
    },
    {
      text: (t) => `"${t}" курсында топтық жұмыс неге маңызды?`,
      opts: () => [
        'Идеялармен бөлісу және бірлесіп шешім табу',
        'Басқалардан көшіру',
        'Жұмысты бөлу',
        'Маңызды емес',
      ],
      ans: () => 'Идеялармен бөлісу және бірлесіп шешім табу',
    },
    {
      text: (t) => `"${t}" саласында жобалық жұмыстың рөлі қандай?`,
      opts: () => [
        'Теориялық білімді практикада қолдануға мүмкіндік береді',
        'Уақытты ысырап ету',
        'Тек баға алу үшін',
        'Ешқандай рөлі жоқ',
      ],
      ans: () => 'Теориялық білімді практикада қолдануға мүмкіндік береді',
    },
  ],
  // Bank B — topic applicability
  [
    {
      text: (t) => `"${t}" білімі қай салада қолданылады?`,
      opts: (t) => [
        `${t} тікелей байланысты салаларда`,
        'Тек бір ғана жерде',
        'Ешқайда қолданылмайды',
        'Тек теорияда',
      ],
      ans: (t) => `${t} тікелей байланысты салаларда`,
    },
    {
      text: (t) => `"${t}" курсынан кейін қандай мансап мүмкіндіктері ашылады?`,
      opts: () => [
        'Сала бойынша маман ретінде жұмыс істеу мүмкіндігі',
        'Ешқандай мүмкіндік',
        'Тек оқуды жалғастыру',
        'Тек волонтёрлік',
      ],
      ans: () => 'Сала бойынша маман ретінде жұмыс істеу мүмкіндігі',
    },
    {
      text: (t) => `"${t}" бойынша өзіндік зерттеу жүргізу неге маңызды?`,
      opts: () => [
        'Тереңірек түсінік қалыптастырады',
        'Уақытты ысырап етеді',
        'Маңызды емес',
        'Тек оқытушы үшін',
      ],
      ans: () => 'Тереңірек түсінік қалыптастырады',
    },
    {
      text: (t) => `"${t}" саласындағы негізгі қиындық не?`,
      opts: () => [
        'Тұрақты жаңару мен дамуды қадағалау',
        'Ешқандай қиындық жоқ',
        'Тек жаттау',
        'Тек мұғалімді тыңдау',
      ],
      ans: () => 'Тұрақты жаңару мен дамуды қадағалау',
    },
    {
      text: (t) => `"${t}" курсын тиімді оқу үшін қанша уақыт бөлу керек?`,
      opts: () => [
        'Күн сайын тұрақты түрде аздап уақыт бөлу',
        'Аптасына бір рет көп уақыт бөлу',
        'Тек емтихан алдында',
        'Уақыт бөлу қажет емес',
      ],
      ans: () => 'Күн сайын тұрақты түрде аздап уақыт бөлу',
    },
  ],
];

// ── Courses without exams (fetched from DB — hardcoded after query) ────────
// These will be read from DB via the SQL approach. Instead of hardcoding IDs,
// we'll generate the SQL to be run AFTER selecting courses without exams.
// For simplicity, we'll just generate based on a list.

async function main() {
  // We'll generate a SQL that:
  // 1. For each course without an exam, inserts an exam + 5 questions
  // The SQL uses a DO $$ block to iterate
  // BUT since we need to reference the actual course IDs from the database,
  // easier approach: generate raw INSERTs with the known IDs

  // Course IDs & titles without exams (from the DB query)
  const coursesWithoutExams = `7d4d0ccf-59be-4bcd-a71b-e8016143643b|AWS Cloud негіздері
120097fb-b251-4bc3-a72b-8c943639bb95|Advanced React Native
a54a11ed-d3d5-40f6-8f1f-f3333dc0e7ac|Advanced SQL оптимизация
42713076-2b5e-4fb3-9b2f-2fd0a0ae4469|Blockchain программирование
a09b412e-7c37-411c-8aee-7e44c26f5ecd|C# және .NET негіздері
1d33e9c6-3179-43b4-b46e-64d4a7ad26b9|CI/CD негіздері
571c2582-1b47-42e7-a05d-5c2149aadcf2|CI/CD: автоматизация деплоя
7e220878-47ac-49fd-bc36-235052df0c07|CSS: Tailwind CSS и современная вёрстка
e3f18846-8187-4663-adc1-6bd9ef01dcdf|Compiler Optimization
a1fa449f-4b94-479a-9dca-9425f17a449a|Computer Vision жоғары деңгей
5f53f4aa-1063-43cf-9c9e-60d10cd28ed3|Cookинг: қазақ тағамдары
6fd6be7a-426f-48c5-bff3-2cc06bf6a531|Cryptography негіздері
f8c28ce5-752d-4843-a7af-1275c5e8ee16|Database Internals
afbe973b-3015-4c0b-b54c-ccacf0f93c0f|Deep Learning: нейрондық желілер
d518fc9e-64da-475c-a7fa-699caf7427d8|Distributed Systems теориясы
77577d46-df55-45b2-a7af-12bda106cde0|Docker Compose и микросервисы
469ed1ab-9428-4736-8ebf-6826ba6695af|Docker кіріспесі
355f6732-06a1-429a-87c7-4505c3d60f70|Event-Driven Architecture
70ee9bd2-c62b-449b-b0d1-a4de0f6f8434|Game Engine жасау (C++)
9b2cda3c-e031-471e-98d9-616d0009f3a7|Git: ветвление и командная работа
da81bff2-424b-4d34-bc16-cd3cd0e4d47b|Git: нұсқаларды басқару
39fa360b-0994-4c31-9368-ac6c0733a6bf|Google Docs және Slides
ca0fa93c-56d2-45d2-be51-dc1c621b9bc7|GraphQL API
198ad948-d104-42eb-b883-538ccac54b56|GraphQL: продвинутый API дизайн
3febf0c5-3f80-471f-ac35-636ddc7eb84f|HTML және CSS негіздері
790480ae-9cd1-4375-aa90-d35f57e49f37|High Performance Computing
79a7aa91-3f21-45ad-a7bc-4b3a18b9e040|JWT аутентификация и авторизация
a2e0022e-9daa-4ade-84e0-fd8c0b2cc97c|Java бағдарламалау тілі
ae0d349a-cb06-4a36-acad-16f7b3298560|JavaScript: DOM және оқиғалар
836cbabb-b6d3-4ebb-a435-a609e9ec950c|Kotlin Android даму
fb085b80-bde4-4611-8870-b88671cbfa2a|Kubernetes жетілдірілген
d3027d6f-956f-4300-86cf-04691e8e7f4f|Kubernetes: оркестрация контейнеров
6d729388-ae4c-43a1-9a12-e77153cc6987|Linux командалық жолы
7b8e024e-2640-4db2-aef8-2432c217e403|MLOps: модельдерді деплоймент
da5f498a-9c09-47cd-b79d-b997e58e33fe|Machine Learning кіріспе
ba510c3d-e892-4b5c-ab43-e5db81e23999|Microsoft Excel кіріспесі
90eef3e5-f3a2-48ca-8ec9-2c02108e39c5|Microsoft Word кіріспесі
a6aa558e-2ce4-4097-a1a9-45959564743e|MongoDB: NoSQL негіздері
e3882f26-f899-422f-a161-b93234932fc3|MySQL: деректер қоры
4ef9a5c8-bb65-466a-a05a-96c40df4a8de|NLP: табиғи тілді өңдеу
bfa5f568-1cce-40c8-b70a-40606325cb57|NestJS: микросервисная архитектура
2b73b43e-ebc2-4d24-a0c4-b5f212cbd89a|Next.js 14: App Router и SSR
4a8bfe4b-475e-4ebc-9a29-78bd743db098|Next.js: продакшен архитектура
d04a320c-0203-4c02-9062-c1439dd316d4|Node.js веб-сервер
7df91ff7-b913-47a3-a3b9-18057476c61f|PostgreSQL жоғары деңгей
a286a545-c5f7-40a1-a9ea-102906648eee|PostgreSQL: высокая нагрузка и оптимизация
3ae2ea62-d7d3-47a7-a5df-5e381638f628|PostgreSQL: основы работы
f00c33a7-deec-4e96-be7f-ef37079fb7bb|PostgreSQL: продвинутые запросы
20b465ad-6335-4e3b-9bac-d4149e8e31e0|Prisma ORM: работа с базой данных
31a93be1-833c-456e-8849-cb52b50c2974|Project Management негіздері
fcee61ea-09bc-466c-99d1-2c285c60661c|Python бағдарламалауға кіріспе
a7f697af-8e88-489b-9d4c-5cbb6b318ea9|Python: OOP негіздері
9ca45eb4-dee0-48e6-8e88-00d6de7ea34e|Python: ООП и паттерны проектирования
59c960cd-060f-4c67-9855-256a4b57c619|Python: асинхронность и высокая производительность
09c0ee81-6eb7-4d46-8891-16b504728072|Python: работа с данными (pandas, numpy)
ce700c6e-e44c-4296-8175-bc5e852329b2|Quantitative Finance (Python)
8bf98340-bd67-4872-9d26-2d1720d7e6c0|Quantum Computing кіріспе
aa33f32b-6b2e-495d-9745-1cf47188ab06|REST API жасау
6547bae6-292d-4f0f-a0cb-a46752534597|REST API: проектирование и лучшие практики
a6138002-fa9c-4e74-a390-f880705cc59d|React Native: мобильная разработка с нуля
adc699d4-000a-45c1-9ea4-01cc56ce28b7|React Native: навигация и работа с API
d6cc2a6a-001f-43f9-814b-1b0cc0aa0338|React Native: нативные модули и публикация
49f0919c-41e3-4e4f-be3c-3b26661d6463|React негіздері
4ea42ac5-147a-4e54-9a46-c398fd8bdf34|React: жоғары деңгей архитектура
fa7a6cb0-ba86-4b1e-a129-ce9674131107|React: производительность и архитектура
c5f9a125-98f3-40cc-a22b-0dec27edace5|Redis: кэширование и структуры данных
783ab40a-4f00-4c75-9ae1-88554175dfdd|Redux: күй менеджменті
f5c658a7-735f-4a13-85a3-e9e171c77d93|Reinforcement Learning
338b6903-44af-45d8-b1a3-c943b2877c5b|Rust тілі: жүйелік бағдарламалау
bca58ebc-cc3c-4ace-a993-27ddc926f9f2|SEO негіздері
36c0e09c-d3d5-4c51-8b48-73c4496099d8|Scratch бағдарламалауы
e3c9fd98-7e9f-4102-8b05-dde39530ab95|Site Reliability Engineering
7ca47690-acf9-44d2-b645-bc1b305e7adf|Systems Design (жүйені жобалау)
47e66da1-c34a-4b34-bc87-f6a0f24e0d7c|Terraform IaC
ccc3bad6-d9f9-4d3f-9e14-2ec8bd43723c|TypeScript негіздері
3765e81f-54a7-4a49-be7e-26cb587bf835|TypeScript: компиляторный API и метапрограммирование
9fe8791d-192f-41d4-9277-100e92f15a1a|TypeScript: продвинутые типы
c0e0fe2d-5a21-4fcc-a53d-6b39105e787f|UX дизайн принциптері
f8750cdf-2219-4471-844a-5a24ff988697|Vue.js 3: практикалық курс
27821d51-a7e5-4e3e-98d4-c5ab09ed2601|WebSocket и реалтайм приложения
de741a27-b4da-4b6d-8503-e36ffd98f0cd|Zero Trust қауіпсіздік модел
beed005c-7c56-4bd4-8685-168bc223f1c0|Іскерлік ағылшын тілі (B1)
f3863d60-82b9-4e03-af49-3cf26807d6af|Алгоритмдер және деректер құрылымдары
517a1a87-7c83-41f5-90cc-1a95a9dbe7ea|Алгоритмы: введение
d92a9659-3a5c-498c-8b50-40c7c091768a|Алгоритмы: продвинутые структуры данных
20ddc45b-63d5-41c8-84b8-91c2e2d4454a|Алгоритмы: рекурсия и динамическое программирование
7b0ae4ab-91ee-4266-975b-7876884e7de6|Ата-ана мектебі
7c10c08d-3ae3-4f71-9803-3c63d5400618|Ағылшын тілі: А1 деңгейі
99ddec34-9b2c-4045-bcd7-41a68367c087|Безопасность веб-приложений: атаки и защита
86bbcdfa-5572-443c-9cd3-ede40da6f336|Биология: тіршілік негіздері
3246390a-8832-4946-be47-171efaf3aa82|Бухгалтерия негіздері
ab386adc-1538-4a12-99dc-c6a9a244ee68|Введение в командную строку Linux
156d4417-bf54-44f8-a11e-5909c9bc93f4|Денешынықтыру негіздері
967af86d-434e-4f86-a434-bcfb30bb5033|Деректер сауаттылығы
c0ae6746-3f9b-448a-9e47-27d1f838ecdf|Деректер талдауы (Pandas)
8ded09f5-2fbb-418b-a6e5-53987532625a|Деректер қорлары: жоғары деңгей
94bfe00a-b803-47e8-aeb5-83cddeddd0f0|Дизайн негіздері (Figma)
8d69f487-1829-4928-af29-b3da7d8b3f4b|Ендірілген жүйелер (Embedded)
a247aca1-98b6-46f8-98b0-773f8a695ab6|Желілік администрирование
ec1eaaba-88b5-4630-913c-cb85e95beffb|Журналистика негіздері
e3176e6f-4dac-4b78-be54-8d8e7f2eee1c|Как работает интернет и HTTP
17c3694d-a955-493e-a6b1-6aea751c5437|Кибер қауіпсіздік негіздері
6e75a375-83f0-46b1-91aa-dcdb47b9b99b|Командалық жұмыс дағдылары
04eba16e-4053-4cb8-bcec-694113d01c00|Компилятор жазу
ef00d4df-6da8-40f5-ad52-af0c8812455a|Компьютерге кіріспе
a8d37af9-cad4-496c-8cdb-8a25b8152879|Кітап оқу дағдылары
cb3b9058-8118-4835-b203-85e9be114f79|Кәсіпкерлік: бизнес идея
60ed70d5-fee2-4588-aeb4-00babf8f46d3|Маркетинг кіріспесі
1b163016-72d5-4f00-9da2-97ab2ba43893|Математика негіздері
4fc4e16d-93b7-4a6d-8c86-d3cde9d1efb8|Мемлекеттік тіл: Қазақ тілі А1
b235af32-f11a-4b0c-b857-096ab56046e4|Микросервистер архитектурасы
55379eea-28f2-4ab9-90b2-8fd640f57576|Мобильді қосымша (Flutter)
f643e39d-8c6f-406f-b70c-16a5f60fe474|Мониторинг и observability продакшен систем
ff5a5b8e-9d19-4264-b0fb-67819d4fa185|Музыка теориясы: кіріспе
041d960e-c95e-44fd-8aaf-12f0b1887fbe|Объектілі-бағытталған PHP
a81fc6c3-0711-4654-a69d-90b2f2c1e38c|Операциялық жүйелер: ядро
ef58ff06-2aa0-4ab9-963d-d03407d2b4b1|Орыс тілі негіздері
d668135a-e87e-4851-987a-b6b4ec3b5e35|Основы UI/UX для разработчиков
2b060af5-b202-44c5-a0cd-cd1d329c44a0|Основы кибербезопасности
0bbbc134-f6be-46c1-9f5d-e203a3f209e4|Программалау логикасы
de4d742b-e988-44d0-b0ef-a2950d1e9927|Проектирование системы (System Design)
325dee78-4e54-4f6c-9a3f-7d9b0344c64d|Психология кіріспесі
954a1d9c-b565-4aac-9e1e-e60eec5becc7|Робототехника кіріспесі
6605d77f-8d75-4a9a-9aed-ef04e6d8fb22|Сурет салу негіздері
f65b243b-82ad-4330-a942-a076a45d12b7|Сызу және геометрия
62f154f5-f877-4b5f-9530-384fcc59caeb|Тарих: Қазақстан тарихы
24050f05-8b5b-46a9-bfd3-fbe4da104ab6|Тестирование: E2E, интеграционные и unit тесты
2ea0ad23-4e46-4e52-a0a7-9e71c2286e6a|Тіршілікті ұйымдастыру (GTD)
70037a80-e157-4b7f-bf1f-376888c6ca96|Тұрмыстық ағылшын тілі
8571dae8-fd0e-494e-b5d0-248ecb914eff|Физика: механика негіздері
357aa109-d4e1-48c9-8dbc-0e78f00b2b0c|Фотография кіріспесі
b54ec1a1-5f53-4836-b157-1f199c256f8b|Функциональды бағдарламалау
c043a723-82e1-4efd-8726-c711877679ae|Химия: атомдар мен молекулалар
075688f7-7524-4e83-a7f6-77322b8db6fc|Шахмат кіріспесі
4cb57be9-a81f-4ce9-bb3a-abe136aafdda|Экологиялық сауаттылық
f0879f32-9626-4eea-931e-adb6ce3cebfe|Экономика негіздері
ce7065d5-9075-47a6-992d-0db2a2814def|Қаржылық сауаттылық`.trim().split('\n').map(line => {
    const [id, ...titleParts] = line.split('|');
    return { id: id.trim(), title: titleParts.join('|').trim() };
  }).filter(c => c.id && c.title);

  console.log(`📝 ${coursesWithoutExams.length} курс экзаменсіз табылды`);

  const lines = [];
  lines.push('-- ==========================================================');
  lines.push('-- seed-exams.sql');
  lines.push(`-- Экзамендер мен сұрақтар (${coursesWithoutExams.length} курс × 5 сұрақ)`);
  lines.push(`-- Жасалған: ${new Date().toISOString()}`);
  lines.push('-- ==========================================================');
  lines.push('');
  lines.push('BEGIN;');
  lines.push('');

  let examCount = 0;
  let questionCount = 0;

  for (let ci = 0; ci < coursesWithoutExams.length; ci++) {
    const { id: courseId, title: courseTitle } = coursesWithoutExams[ci];
    const examId = randomUUID();
    const examTitle = `${courseTitle} — финалдық тест`;

    // Vary duration: 25–40 min based on course index
    const duration = 25 + (ci % 4) * 5; // 25, 30, 35, 40
    const passScore = 60;

    lines.push(`-- ── Курс: ${courseTitle} ──`);
    lines.push(
      `INSERT INTO "exams" ("id", "courseId", "title", "duration", "passScore", "createdAt")` +
      ` VALUES ('${examId}', '${courseId}', '${esc(examTitle)}', ${duration}, ${passScore}, NOW())` +
      ` ON CONFLICT DO NOTHING;`
    );

    // Pick question bank: alternate between base + bank A + bank B
    const bankIndex = ci % 3;
    let questions;

    if (bankIndex === 0) {
      questions = generateQuestionsForCourse(courseTitle);
    } else {
      const bank = EXTRA_QUESTION_BANKS[bankIndex - 1];
      questions = bank.map(q => ({
        text: q.text(courseTitle),
        options: q.opts(courseTitle),
        answer: q.ans(courseTitle),
      }));
    }

    for (const q of questions) {
      const qId = randomUUID();
      const optionsJson = JSON.stringify(q.options).replace(/'/g, "''");
      lines.push(
        `INSERT INTO "questions" ("id", "examId", "text", "type", "options", "answer")` +
        ` VALUES ('${qId}', '${examId}', '${esc(q.text)}', 'SINGLE_CHOICE'::"QuestionType", '${optionsJson}'::jsonb, '${esc(q.answer)}')` +
        ` ON CONFLICT DO NOTHING;`
      );
      questionCount++;
    }

    lines.push('');
    examCount++;
  }

  lines.push('COMMIT;');
  lines.push('');
  lines.push(`-- Барлығы: ${examCount} экзамен, ${questionCount} сұрақ`);

  const outPath = join(__dirname, 'seed-exams.sql');
  writeFileSync(outPath, lines.join('\n'), 'utf-8');
  console.log(`🎉 ${examCount} экзамен, ${questionCount} сұрақ жасалды → ${outPath}`);
  console.log('');
  console.log('Іске қосу:');
  console.log('  docker cp backend/prisma/seed-exams.sql proctolearn_postgres:/tmp/seed-exams.sql');
  console.log('  docker exec proctolearn_postgres psql -U postgres -d proctolearn_db -f /tmp/seed-exams.sql');
}

main().catch((e) => {
  console.error('❌ Қате:', e);
  process.exit(1);
});
