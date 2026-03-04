/**
 * seed-stepik.ts
 * Seeds 100 Stepik-style courses (40 BEGINNER, 30 INTERMEDIATE, 30 ADVANCED)
 * with modules, lessons, and steps. All content is in Kazakh.
 *
 * Usage: npx ts-node -r tsconfig-paths/register prisma/seed-stepik.ts
 */

import { PrismaClient, CourseLevel, StepType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Course definitions by level ──────────────────────────────────────────────
const BEGINNER_COURSES = [
  { title: 'HTML және CSS негіздері', description: 'Веб-беттердің құрылымы мен безендіруін үйреніңіз', topics: ['HTML тегтері', 'CSS стильдері', 'Flexbox'] },
  { title: 'Python бағдарламалауға кіріспе', description: 'Бағдарламалаудың алғашқы қадамдары Python тілінде', topics: ['Айнымалылар', 'Шарттар', 'Циклдар'] },
  { title: 'Математика негіздері', description: 'Арифметикадан алгебраға дейін', topics: ['Арифметика', 'Дроби', 'Теңдеулер'] },
  { title: 'Ағылшын тілі: А1 деңгейі', description: 'Ағылшын тіліне алғашқы қадамдар', topics: ['Сәлемдесу', 'Сандар', 'Түстер'] },
  { title: 'Компьютерге кіріспе', description: 'Компьютермен жұмыс істеудің негіздері', topics: ['Операциялық жүйе', 'Файлдар', 'Интернет'] },
  { title: 'Физика: механика негіздері', description: 'Физика ғылымының іргетасы', topics: ['Кинематика', 'Динамика', 'Энергия'] },
  { title: 'Химия: атомдар мен молекулалар', description: 'Химияны нөлден бастаңыз', topics: ['Атом', 'Молекула', 'Реакциялар'] },
  { title: 'Тарих: Қазақстан тарихы', description: 'Қазақстанның бай тарихын зерделеңіз', topics: ['Ежелгі дәуір', 'Орта ғасырлар', 'Жаңа заман'] },
  { title: 'Биология: тіршілік негіздері', description: 'Тіршіліктің ғылыми негіздері', topics: ['Жасуша', 'Генетика', 'Экология'] },
  { title: 'Сызу және геометрия', description: 'Геометриялық пішіндер мен сызба', topics: ['Нүкте', 'Сызық', 'Бұрыш'] },
  { title: 'Орыс тілі негіздері', description: 'Орыс тілін нөлден бастаңыз', topics: ['Алфавит', 'Грамматика', 'Сөйлем'] },
  { title: 'Microsoft Word кіріспесі', description: 'Word бағдарламасымен жұмыс', topics: ['Мәтін теру', 'Форматтау', 'Кесте'] },
  { title: 'Microsoft Excel кіріспесі', description: 'Кестелермен жұмыс негіздері', topics: ['Жасушалар', 'Формулалар', 'Диаграммалар'] },
  { title: 'Google Docs және Slides', description: 'Бұлттық офис қолданбалары', topics: ['Құжат', 'Презентация', 'Google Drive'] },
  { title: 'Сурет салу негіздері', description: 'Суреттің алғашқы қадамдары', topics: ['Пропорциялар', 'Жарық-көлеңке', 'Перспектива'] },
  { title: 'Музыка теориясы: кіріспе', description: 'Нота жазуы мен ырғақ', topics: ['Нота', 'Ырғақ', 'Гамма'] },
  { title: 'Денешынықтыру негіздері', description: 'Дұрыс жаттығулар мен тамақтану', topics: ['Жылыну', 'Созылу', 'Жаттығулар'] },
  { title: 'Психология кіріспесі', description: 'Адам мінезінің негіздері', topics: ['Зейін', 'Жады', 'Мотивация'] },
  { title: 'Экономика негіздері', description: 'Экономика ғылымына кіріспе', topics: ['Сұраныс', 'Ұсыныс', 'Нарық'] },
  { title: 'Тұрмыстық ағылшын тілі', description: 'Күнделікті өмірдегі ағылшын тілі', topics: ['Дүкенде', 'Кафеде', 'Транспортта'] },
  { title: 'Программалау логикасы', description: 'Алгоритмдік ойлауды дамытыңыз', topics: ['Алгоритм', 'Блок-схема', 'Псевдокод'] },
  { title: 'Командалық жұмыс дағдылары', description: 'Топта тиімді жұмыс істеу', topics: ['Коммуникация', 'Рөлдер', 'Жанжал'] },
  { title: 'Фотография кіріспесі', description: 'Сурет түсірудің негіздері', topics: ['Экспозиция', 'Бағыт', 'Жарық'] },
  { title: 'Cookинг: қазақ тағамдары', description: 'Дәстүрлі қазақ тамақтарын үйреніңіз', topics: ['Палау', 'Манты', 'Бешбармақ'] },
  { title: 'Бухгалтерия негіздері', description: 'Бухгалтерлік есеп тіршілігі', topics: ['Баланс', 'Шот', 'Есеп'] },
  { title: 'Маркетинг кіріспесі', description: 'Маркетингтің алғашқы қадамдары', topics: ['Бренд', 'Мақсатты аудитория', 'Жарнама'] },
  { title: 'SEO негіздері', description: 'Іздеу жүйесін оңтайландыру', topics: ['Кілт сөздер', 'Мета тегтер', 'Сілтемелер'] },
  { title: 'Дизайн негіздері (Figma)', description: 'UI дизайнға кіріспе', topics: ['Интерфейс', 'Компоненттер', 'Прототип'] },
  { title: 'Ата-ана мектебі', description: 'Балапан тәрбиесінің негіздері', topics: ['Даму кезеңдері', 'Ойын', 'Нутриция'] },
  { title: 'Тіршілікті ұйымдастыру (GTD)', description: 'Уақытты тиімді басқару', topics: ['Мақсаттар', 'Тізімдер', 'Жоспарлау'] },
  { title: 'Scratch бағдарламалауы', description: 'Балалар үшін визуалды бағдарламалау', topics: ['Спрайттар', 'Командалар', 'Ойын жасау'] },
  { title: 'Деректер сауаттылығы', description: 'Ақпаратты дұрыс оқу және талдау', topics: ['Диаграммалар', 'Кестелер', 'Статистика'] },
  { title: 'Экологиялық сауаттылық', description: 'Қоршаған ортаны қорғау', topics: ['Климат', 'Қалдықтарды азайту', 'Энергия'] },
  { title: 'Мемлекеттік тіл: Қазақ тілі А1', description: 'Қазақ тілін бастаушыларға арналған курс', topics: ['Әліпби', 'Сандар', 'Сәлемдесу'] },
  { title: 'Қаржылық сауаттылық', description: 'Жеке қаржыны басқару', topics: ['Бюджет', 'Жинақтар', 'Инвестиция'] },
  { title: 'Шахмат кіріспесі', description: 'Шахмат ойынының негіздері', topics: ['Тақта', 'Фигуралар', 'Ережелер'] },
  { title: 'Журналистика негіздері', description: 'Мақала жазу дағдылары', topics: ['Жанрлар', 'Факт тексеру', 'Интервью'] },
  { title: 'Робототехника кіріспесі', description: 'Роботтарды жобалаудың алғашқы қадамдары', topics: ['Конструкция', 'Сенсорлар', 'Бағдарлама'] },
  { title: 'Кітап оқу дағдылары', description: 'Тиімді оқу техникалары', topics: ['Жылдам оқу', 'Конспект', 'Есте сақтау'] },
  { title: 'Кәсіпкерлік: бизнес идея', description: 'Өз бизнесіңді жоспарлаңыз', topics: ['Идея', 'SWOT талдаузы', 'Клиенттер'] },
];

const INTERMEDIATE_COURSES = [
  { title: 'JavaScript: DOM және оқиғалар', description: 'Браузерді JavaScript арқылы басқарыңыз', topics: ['DOM', 'Оқиғалар', 'AJAX'] },
  { title: 'Python: OOP негіздері', description: 'Объектілі-бағытталған бағдарламалау', topics: ['Класс', 'Мұрагерлік', 'Полиморфизм'] },
  { title: 'MySQL: деректер қоры', description: 'Реляциялық деректер қоры тілі', topics: ['SELECT', 'JOIN', 'Индекс'] },
  { title: 'React негіздері', description: 'Facebook-тің UI кітапханасы', topics: ['JSX', 'Props', 'State'] },
  { title: 'Node.js веб-сервер', description: 'Server-side JavaScript', topics: ['Express', 'Маршруттар', 'Middleware'] },
  { title: 'Java бағдарламалау тілі', description: 'Кросс-платформалық OOP тілі', topics: ['Синтаксис', 'Класстар', 'Коллекциялар'] },
  { title: 'C# және .NET негіздері', description: 'Microsoft экожүйесіне кіріспе', topics: ['Синтаксис', 'LINQ', 'ASP.NET'] },
  { title: 'Алгоритмдер және деректер құрылымдары', description: 'Бағдарламашылардың негізгі аспаптары', topics: ['Массив', 'Ағаш', 'Граф'] },
  { title: 'Linux командалық жолы', description: 'Terminal арқылы жұмыс', topics: ['Файлдар', 'Процестер', 'Скрипт'] },
  { title: 'Git: нұсқаларды басқару', description: 'Git арқылы кодты басқарыңыз', topics: ['Commit', 'Branch', 'Merge'] },
  { title: 'REST API жасау', description: 'HTTP API тетіктерін үйреніңіз', topics: ['HTTP', 'JSON', 'Аутентификация'] },
  { title: 'PostgreSQL жоғары деңгей', description: 'Реляциялық деректер қорын тереңдете оқыңыз', topics: ['Индекстер', 'Транзакциялар', 'Оптимизация'] },
  { title: 'Docker кіріспесі', description: 'Контейнерлеу технологиясы', topics: ['Image', 'Container', 'Dockerfile'] },
  { title: 'TypeScript негіздері', description: 'JavaScript-тің типтелген нұсқасы', topics: ['Типтер', 'Интерфейстер', 'Генериктер'] },
  { title: 'Vue.js 3: практикалық курс', description: 'Прогрессивті JavaScript фреймворк', topics: ['Компоненттер', 'Composition API', 'Vuex'] },
  { title: 'MongoDB: NoSQL негіздері', description: 'Документтік деректер қоры', topics: ['Документтер', 'Сұраулар', 'Индекстер'] },
  { title: 'Мобильді қосымша (Flutter)', description: 'Cross-platform мобильді даму', topics: ['Widget', 'State', 'Navigator'] },
  { title: 'Кибер қауіпсіздік негіздері', description: 'Цифрлық қауіпсіздікті қорғаңыз', topics: ['Шифрлеу', 'Firewall', 'Social Engineering'] },
  { title: 'Machine Learning кіріспе', description: 'Машиналық оқыту принциптері', topics: ['Регрессия', 'Классификация', 'Кластеризация'] },
  { title: 'UX дизайн принциптері', description: 'Пайдаланушы тәжірибесін жобалаңыз', topics: ['Зерттеу', 'Wireframe', 'Юзабилити'] },
  { title: 'Деректер талдауы (Pandas)', description: 'Python арқылы деректерді талдаңыз', topics: ['DataFrame', 'Visualization', 'Статистика'] },
  { title: 'Желілік администрирование', description: 'Компьютерлік желілерді басқару', topics: ['TCP/IP', 'DNS', 'Маршрутизация'] },
  { title: 'Project Management негіздері', description: 'Жобаларды тиімді басқарыңыз', topics: ['Scrum', 'Kanban', 'Gantt'] },
  { title: 'Іскерлік ағылшын тілі (B1)', description: 'Бизнестегі ағылшын тілі', topics: ['Жиналыстар', 'Электрондық пошта', 'Презентация'] },
  { title: 'AWS Cloud негіздері', description: 'Бұлттық есептеуге кіріспе', topics: ['EC2', 'S3', 'IAM'] },
  { title: 'GraphQL API', description: 'REST-тің балама тәсілі', topics: ['Schema', 'Query', 'Mutation'] },
  { title: 'Redux: күй менеджменті', description: 'React қосымшаларындағы күйді басқарыңыз', topics: ['Store', 'Action', 'Reducer'] },
  { title: 'Объектілі-бағытталған PHP', description: 'PHP тілінде OOP', topics: ['Класс', 'Интерфейс', 'Laravel'] },
  { title: 'Kotlin Android даму', description: 'Android қосымшаларын жасаңыз', topics: ['Activity', 'Fragment', 'ViewModel'] },
  { title: 'CI/CD негіздері', description: 'Автоматты деплоймент', topics: ['GitHub Actions', 'Pipeline', 'Jenkins'] },
];

const ADVANCED_COURSES = [
  { title: 'React: жоғары деңгей архитектура', description: 'Масштабталатын React қосымшалары', topics: ['Кастомды хуктар', 'Мемоизация', 'Микро-фронтенд'] },
  { title: 'Kubernetes жетілдірілген', description: 'Контейнерлер оркестрациясы', topics: ['Pod', 'Service', 'Helm'] },
  { title: 'Deep Learning: нейрондық желілер', description: 'Терең оқыту алгоритмдері', topics: ['CNN', 'RNN', 'Transformer'] },
  { title: 'Микросервистер архитектурасы', description: 'Масштабталатын жүйелерді жобалаңыз', topics: ['API Gateway', 'Event Bus', 'CQRS'] },
  { title: 'Blockchain программирование', description: 'Смарт контрактілер мен DeFi', topics: ['Solidity', 'Ethereum', 'Web3'] },
  { title: 'Компилятор жазу', description: 'Бағдарламалау тілін нөлден жасаңыз', topics: ['Лексер', 'Парсер', 'АСТ'] },
  { title: 'Деректер қорлары: жоғары деңгей', description: 'OLAP, шардинг, репликация', topics: ['Шардинг', 'Репликация', 'OLAP'] },
  { title: 'NLP: табиғи тілді өңдеу', description: 'Мәтінді машиналық өңдеу', topics: ['Токенизация', 'Трансформер', 'BERT'] },
  { title: 'Cryptography негіздері', description: 'Криптографиялық алгоритмдер', topics: ['Симметриялық', 'Асимметриялық', 'Хэш'] },
  { title: 'Systems Design (жүйені жобалау)', description: 'Жоғары жүктелген жүйелерді жобалаңыз', topics: ['Кэш', 'Жүктемені теңдестіру', 'Базалар'] },
  { title: 'Операциялық жүйелер: ядро', description: 'OS ішкі архитектурасы', topics: ['Процестер', 'Жад', 'Файлдық жүйе'] },
  { title: 'Ендірілген жүйелер (Embedded)', description: 'Микроконтроллерлер мен IoT', topics: ['Arduino', 'STM32', 'RTOS'] },
  { title: 'MLOps: модельдерді деплоймент', description: 'ML жүйелерін өндіріске шығару', topics: ['MLflow', 'Serving', 'Мониторинг'] },
  { title: 'Функциональды бағдарламалау', description: 'Haskell/Scala арқылы FP', topics: ['Монад', 'Ламбда', 'Рекурсия'] },
  { title: 'Zero Trust қауіпсіздік модел', description: 'Заманауи кибер қауіпсіздік', topics: ['IAM', 'Микросегментация', 'SIEM'] },
  { title: 'Quantitative Finance (Python)', description: 'Қаржылық модельдеу', topics: ['Stochastic', 'Monte Carlo', 'Backtesting'] },
  { title: 'Game Engine жасау (C++)', description: 'Ойын движогін нөлден жазыңыз', topics: ['Render', 'Physics', 'ECS'] },
  { title: 'Computer Vision жоғары деңгей', description: 'Вирингтен мүмкіндіктерге дейін', topics: ['YOLO', 'Segmentation', 'OCR'] },
  { title: 'Distributed Systems теориясы', description: 'Таратылған жүйелер', topics: ['CAP', 'Raft', 'Gossip'] },
  { title: 'Advanced SQL оптимизация', description: 'Query plan мен индекстеуді меңгеріңіз', topics: ['Explain', 'Partitioning', 'Views'] },
  { title: 'Rust тілі: жүйелік бағдарламалау', description: 'Қауіпсіз жүйелік программалау', topics: ['Ownership', 'Lifetime', 'Async'] },
  { title: 'Reinforcement Learning', description: 'Марапаттауға негізделген оқыту', topics: ['Q-Learning', 'Policy Gradient', 'Actor-Critic'] },
  { title: 'Site Reliability Engineering', description: 'Сервис тұрақтылығын қамтамасыз ету', topics: ['SLO/SLA', 'Error Budget', 'Postmortem'] },
  { title: 'Terraform IaC', description: 'Инфрақұрылымды код ретінде басқарыңыз', topics: ['Provider', 'Module', 'State'] },
  { title: 'Quantum Computing кіріспе', description: 'Квант есептеуіне кіріспе', topics: ['Кубит', 'Қысқарту', 'Алгоритм'] },
  { title: 'Advanced React Native', description: 'Жоғары деңгейлі мобильді даму', topics: ['Анимация', 'Native Modules', 'Профилинг'] },
  { title: 'Compiler Optimization', description: 'Компилятор оптимизациясы', topics: ['SSA', 'Loop', 'LLVM'] },
  { title: 'Event-Driven Architecture', description: 'Оқиғаларға негізделген архитектура', topics: ['Kafka', 'EventSourcing', 'Saga'] },
  { title: 'Database Internals', description: 'Деректер қорының ішкі механизмдері', topics: ['B-ағаш', 'WAL', 'MVCC'] },
  { title: 'High Performance Computing', description: 'Жоғары өнімді есептеулер', topics: ['SIMD', 'GPU', 'MPI'] },
];

// ─── Step content generators ──────────────────────────────────────────────────
function makeVideoStep(topic: string, order: number) {
  return {
    type: StepType.VIDEO,
    order,
    content: {
      videoUrl: `https://www.youtube.com/embed/dQw4w9WgXcQ`,
      description: `${topic} тақырыбына арналған бейне сабақ`,
    },
  };
}

function makeTextStep(topic: string, order: number) {
  return {
    type: StepType.TEXT,
    order,
    content: {
      html: `<h2>${topic}</h2><p>Бұл тақырыпта біз <strong>${topic}</strong> туралы толық біліп аламыз. Материалды мұқият оқып шығыңыз және жаттығуларды орындаңыз.</p><p>Негізгі ұғымдар:</p><ul><li>${topic} - бұл бағдарламалаудың маңызды бөлігі</li><li>Практикалық дағдыларды дамыту үшін тапсырмаларды орындаңыз</li><li>Сұрақтарыңыз болса, форумда жазыңыз</li></ul>`,
    },
  };
}

function makeTaskStep(topic: string, order: number) {
  const questions = [
    {
      question: `${topic} дегеніміз не?`,
      taskType: 'single_choice',
      options: [
        `${topic} - бұл бағдарламалаудың маңызды тәсілі`,
        'Бұл тек теориялық ұғым',
        'Веб-браузердің бөлігі',
        'Деректер қорының типі',
      ],
      correctAnswer: `${topic} - бұл бағдарламалаудың маңызды тәсілі`,
      explanation: `Дұрыс! ${topic} шынымен де бағдарламалаудың маңызды тәсілі болып табылады.`,
    },
    {
      question: `${topic} бойынша дұрыс тұжырым қайсы?`,
      taskType: 'single_choice',
      options: [
        'Ол тек бастаушыларға арналған',
        `${topic} кез келген жобада қолданылады`,
        'Ол ескірген технология',
        'Оны тек зертханаларда қолданады',
      ],
      correctAnswer: `${topic} кез келген жобада қолданылады`,
      explanation: `Дұрыс! ${topic} кең ауқымды қолданыстарда кездеседі.`,
    },
    {
      question: `${topic}-мен жұмыс кезінде не маңызды?`,
      taskType: 'single_choice',
      options: ['Тек теорияны білу', 'Жаттығуды үнемі орындау', 'Интернетті пайдалану', 'Кірістіруден аулақ болу'],
      correctAnswer: 'Жаттығуды үнемі орындау',
      explanation: 'Дұрыс! Практика — үйренудің ең маңызды бөлігі.',
    },
  ];
  const q = questions[(order - 1) % questions.length];
  return {
    type: StepType.TASK,
    order,
    content: q,
  };
}

// ─── Course builder ────────────────────────────────────────────────────────────
async function createCourse(
  courseData: { title: string; description: string; topics: string[] },
  level: CourseLevel,
  teacherId: string,
) {
  const course = await prisma.course.create({
    data: { title: courseData.title, description: courseData.description, level, teacherId },
  });

  for (let mi = 0; mi < courseData.topics.length; mi++) {
    const topic = courseData.topics[mi];
    const mod = await prisma.courseModule.create({
      data: {
        title: `${mi + 1}-бөлім: ${topic}`,
        order: mi + 1,
        courseId: course.id,
      },
    });

    // 2 lessons per module
    for (let li = 0; li < 2; li++) {
      const lessonTitle = li === 0 ? `${topic}: теориялық негіздер` : `${topic}: практикалық тапсырмалар`;
      const lesson = await prisma.lesson.create({
        data: {
          title: lessonTitle,
          content: ' ',
          order: li + 1,
          moduleId: mod.id,
        },
      });

      // 3 steps per lesson: VIDEO, TEXT, TASK
      const steps = [
        makeVideoStep(topic, 1),
        makeTextStep(topic, 2),
        makeTaskStep(topic, 3),
      ];

      for (const stepData of steps) {
        await prisma.step.create({
          data: {
            type: stepData.type,
            order: stepData.order,
            content: stepData.content,
            lessonId: lesson.id,
          },
        });
      }
    }
  }

  return course;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🚀 Stepik курстарды тұқым ретінде жүктеу басталды...');

  // Ensure teacher user exists
  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@proctolearn.kz' },
    update: {},
    create: {
      name: 'Жүйелік мұғалім',
      email: 'teacher@proctolearn.kz',
      phone: '+77002220000',
      password: await bcrypt.hash('Teach@12', 12),
      role: 'TEACHER',
    },
  });

  console.log(`✅ Мұғалім пайдаланушы: ${teacher.email}`);

  // Seed BEGINNER courses (40)
  console.log('📗 40 жаңадан бастаушы курс жасалуда...');
  let created = 0;
  for (const courseData of BEGINNER_COURSES) {
    await createCourse(courseData, CourseLevel.BEGINNER, teacher.id);
    created++;
    if (created % 10 === 0) console.log(`  ${created}/40 жоспарланды...`);
  }
  console.log(`  ✅ ${BEGINNER_COURSES.length} BEGINNER курс жасалды`);

  // Seed INTERMEDIATE courses (30)
  console.log('📘 30 орта деңгей курс жасалуда...');
  created = 0;
  for (const courseData of INTERMEDIATE_COURSES) {
    await createCourse(courseData, CourseLevel.INTERMEDIATE, teacher.id);
    created++;
    if (created % 10 === 0) console.log(`  ${created}/30 жоспарланды...`);
  }
  console.log(`  ✅ ${INTERMEDIATE_COURSES.length} INTERMEDIATE курс жасалды`);

  // Seed ADVANCED courses (30)
  console.log('📕 30 жоғары деңгей курс жасалуда...');
  created = 0;
  for (const courseData of ADVANCED_COURSES) {
    await createCourse(courseData, CourseLevel.ADVANCED, teacher.id);
    created++;
    if (created % 10 === 0) console.log(`  ${created}/30 жоспарланды...`);
  }
  console.log(`  ✅ ${ADVANCED_COURSES.length} ADVANCED курс жасалды`);

  const totalCourses =
    BEGINNER_COURSES.length + INTERMEDIATE_COURSES.length + ADVANCED_COURSES.length;
  console.log(`\n🎉 Барлығы ${totalCourses} курс жасалды!`);
  console.log(`   - BEGINNER:     ${BEGINNER_COURSES.length}`);
  console.log(`   - INTERMEDIATE: ${INTERMEDIATE_COURSES.length}`);
  console.log(`   - ADVANCED:     ${ADVANCED_COURSES.length}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed қатесі:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
