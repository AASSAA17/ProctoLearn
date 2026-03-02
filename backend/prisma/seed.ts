import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Бастапқы деректерді жүктеу...');

  const hash = async (pw: string) => bcrypt.hash(pw, 12);

  // Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@proctolearn.kz' },
    update: {},
    create: {
      name: 'Администратор',
      email: 'admin@proctolearn.kz',
      phone: '+77001110000',
      password: await hash('Admin@12'),
      role: 'ADMIN',
    },
  });

  // Teacher
  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@proctolearn.kz' },
    update: {},
    create: {
      name: 'Мұғалім Айгүл',
      email: 'teacher@proctolearn.kz',
      phone: '+77002220000',
      password: await hash('Teach@12'),
      role: 'TEACHER',
    },
  });

  // Student
  await prisma.user.upsert({
    where: { email: 'student@proctolearn.kz' },
    update: {},
    create: {
      name: 'Студент Алибек',
      email: 'student@proctolearn.kz',
      phone: '+77003330000',
      password: await hash('Stud@123'),
      role: 'STUDENT',
    },
  });

  // Proctor
  await prisma.user.upsert({
    where: { email: 'proctor@proctolearn.kz' },
    update: {},
    create: {
      name: 'Проктор Бауыржан',
      email: 'proctor@proctolearn.kz',
      phone: '+77004440000',
      password: await hash('Proct@12'),
      role: 'PROCTOR',
    },
  });

  // Demo courses
  const course1 = await prisma.course.upsert({
    where: { id: 'demo-course-1' },
    update: {},
    create: {
      id: 'demo-course-1',
      title: 'JavaScript негіздері',
      description: 'JavaScript тілінің іргелі негіздері мен алгоритмдері',
      teacherId: teacher.id,
    },
  });

  const course2 = await prisma.course.upsert({
    where: { id: 'demo-course-2' },
    update: {},
    create: {
      id: 'demo-course-2',
      title: 'Python бағдарламалау',
      description: 'Python тілінде бағдарлама жазу тәсілдері',
      teacherId: teacher.id,
    },
  });

  // Demo lessons for course1
  for (let i = 1; i <= 3; i++) {
    await prisma.lesson.upsert({
      where: { id: `demo-lesson-c1-${i}` },
      update: {},
      create: {
        id: `demo-lesson-c1-${i}`,
        courseId: course1.id,
        title: `${i}-сабақ: JavaScript негіздері`,
        content: `Бұл ${i}-сабақтың мазмұны. JavaScript тілінің ${i}-тарауы.`,
        order: i,
      },
    });
  }

  // Demo lessons for course2
  for (let i = 1; i <= 3; i++) {
    await prisma.lesson.upsert({
      where: { id: `demo-lesson-c2-${i}` },
      update: {},
      create: {
        id: `demo-lesson-c2-${i}`,
        courseId: course2.id,
        title: `${i}-сабақ: Python негіздері`,
        content: `Бұл ${i}-сабақтың мазмұны. Python тілінің ${i}-тарауы.`,
        order: i,
      },
    });
  }

  console.log('✅ Деректер сәтті жүктелді!');
  console.log('');
  console.log('🔑 Тіркелгілер:');
  console.log('  Admin:   admin@proctolearn.kz    / Admin@12');
  console.log('  Teacher: teacher@proctolearn.kz  / Teach@12');
  console.log('  Student: student@proctolearn.kz  / Stud@123');
  console.log('  Proctor: proctor@proctolearn.kz  / Proct@12');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
