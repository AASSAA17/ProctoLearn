import { PrismaClient, CourseLevel } from '@prisma/client';

const prisma = new PrismaClient();

// These titles match exactly the seeded course titles
const beginnerTitles = [
  'HTML и CSS с нуля',
  'JavaScript для начинающих',
  'Python: первые шаги',
  'Git и GitHub с нуля',
  'Основы SQL',
  'Введение в командную строку Linux',
  'Основы TypeScript',
  'Как работает интернет и HTTP',
  'React.js — первое знакомство',
  'Docker для разработчиков',
  'Алгоритмы: введение',
  'Node.js для начинающих',
  'Основы UI/UX для разработчиков',
  'PostgreSQL: основы работы',
  'Основы кибербезопасности',
  'React Native: мобильная разработка с нуля',
];

const intermediateTitles = [
  'React Advanced: хуки и паттерны',
  'NestJS: бэкенд на TypeScript',
  'PostgreSQL: продвинутые запросы',
  'Python: ООП и паттерны проектирования',
  'JWT аутентификация и авторизация',
  'TypeScript: продвинутые типы',
  'Next.js 14: App Router и SSR',
  'Docker Compose и микросервисы',
  'Prisma ORM: работа с базой данных',
  'Git: ветвление и командная работа',
  'REST API: проектирование и лучшие практики',
  'Python: работа с данными (pandas, numpy)',
  'WebSocket и реалтайм приложения',
  'CSS: Tailwind CSS и современная вёрстка',
  'Алгоритмы: рекурсия и динамическое программирование',
  'React Native: навигация и работа с API',
];

const advancedTitles = [
  'NestJS: микросервисная архитектура',
  'Kubernetes для разработчиков',
  'GraphQL: от основ до Federation',
  'Python: машинное обучение (scikit-learn)',
  'CI/CD с GitHub Actions и Docker',
  'React: производительность и оптимизация',
  'PostgreSQL: репликация и производительность',
  'TypeScript: паттерны проектирования',
  'Безопасность веб-приложений (OWASP)',
  'Redis: кэширование и очереди',
  'Elasticsearch: полнотекстовый поиск',
  'Terraform: инфраструктура как код',
  'Python: FastAPI и асинхронность',
  'Архитектура: DDD и CQRS',
  'Мониторинг: Prometheus + Grafana',
  'WebAssembly: основы и практика',
];

async function main() {
  console.log('Setting course levels...\n');

  let updated = 0;

  for (const title of beginnerTitles) {
    const result = await prisma.course.updateMany({
      where: { title },
      data: { level: CourseLevel.BEGINNER },
    });
    if (result.count > 0) {
      console.log(`✅ BEGINNER: ${title}`);
      updated += result.count;
    } else {
      console.log(`⚠️  Not found: ${title}`);
    }
  }

  for (const title of intermediateTitles) {
    const result = await prisma.course.updateMany({
      where: { title },
      data: { level: CourseLevel.INTERMEDIATE },
    });
    if (result.count > 0) {
      console.log(`✅ INTERMEDIATE: ${title}`);
      updated += result.count;
    } else {
      console.log(`⚠️  Not found: ${title}`);
    }
  }

  for (const title of advancedTitles) {
    const result = await prisma.course.updateMany({
      where: { title },
      data: { level: CourseLevel.ADVANCED },
    });
    if (result.count > 0) {
      console.log(`✅ ADVANCED: ${title}`);
      updated += result.count;
    } else {
      console.log(`⚠️  Not found: ${title}`);
    }
  }

  console.log(`\n✅ Done! Updated ${updated} courses.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
