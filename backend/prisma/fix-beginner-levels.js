const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const originalBeginnerTitles = [
  'JavaScript негіздері',
  'Python бағдарламалау',
  'SQL және реляциялық мәліметтер қоры',
  'HTML және CSS',
  'React.js фреймворкі',
  'Node.js бэкенд әзірлеу',
  'Деректер құрылымдары мен алгоритмдер',
  'Git және нұсқаларды бақылау',
  'Docker және контейнеризация',
  'Кибер қауіпсіздік негіздері',
];

p.course.updateMany({
  where: { title: { in: originalBeginnerTitles }, level: 'ADVANCED' },
  data: { level: 'BEGINNER' },
}).then(r => {
  console.log('Restored to BEGINNER:', r.count);
  return p.course.groupBy({ by: ['level'], _count: { id: true } });
}).then(groups => {
  groups.forEach(g => console.log(g.level, ':', g._count.id));
  return p.$disconnect();
}).catch(e => { console.error(e); return p.$disconnect(); });
