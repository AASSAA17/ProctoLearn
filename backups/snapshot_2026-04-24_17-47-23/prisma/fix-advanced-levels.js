const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

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

p.course.updateMany({
  where: { level: 'BEGINNER', NOT: { title: { in: beginnerTitles } } },
  data: { level: 'ADVANCED' },
}).then(r => {
  console.log('Updated to ADVANCED:', r.count);
  return p.course.groupBy({ by: ['level'], _count: { id: true } });
}).then(groups => {
  groups.forEach(g => console.log(g.level, ':', g._count.id));
  return p.$disconnect();
}).catch(e => { console.error(e); return p.$disconnect(); });
