# ProctoLearn — Платформа нұсқаулығы

> Қазақстандық IT мамандарын дайындайтын заманауи онлайн оқыту платформасы.
> NestJS + Next.js + PostgreSQL + Prisma

---

## 🔐 Жүйеге кіру деректері

| Рол | Email | Пароль |
|------|-------|--------|
| Admin | admin@proctolearn.kz | Admin@12 |
| Teacher | teacher@proctolearn.kz | Teach@12 |
| Student | student@proctolearn.kz | Stud@123 |

---

## 🌐 Серверлер

| Қызмет | URL |
|--------|-----|
| Frontend (Next.js) | http://localhost:3000 |
| Backend (NestJS) | http://localhost:4000 |
| Swagger API Docs | http://localhost:4000/api |
| PostgreSQL | localhost:5432 |

### Серверлерді іске қосу

```powershell
# Backend
cd C:\Users\user\ProctoLearn\backend
npm run start:dev

# Frontend
cd C:\Users\user\ProctoLearn\frontend
npm run dev
```

### Дерекқор

```
Host: 127.0.0.1:5432
Database: proctolearn_db
User: postgres
Password: 1234
```

---

## 📚 Курстар

### Деңгейлер

| Деңгей | Казақша | Саны |
|--------|---------|------|
| BEGINNER | Бастаушы 🟢 | 26 курс |
| INTERMEDIATE | Орта 🟡 | 16 курс |
| ADVANCED | Жоғары 🔴 | 16 курс |

**Барлығы:** 58 курс, 532 сабақ

### Курстар тізімі (негізгілері)

#### Бастаушы (BEGINNER)
- HTML и CSS с нуля
- JavaScript для начинающих
- Python для начинающих
- Git для начинающих
- TypeScript основы

#### Орта (INTERMEDIATE)
- React: от основ
- Node.js: серверная разработка
- SQL основы
- Docker основы

#### Жоғары (ADVANCED)
- NestJS: продвинутый уровень
- React Advanced: паттерны
- Алгоритмы и структуры данных

### Курс API

```
GET  /courses                 → Барлық курстар (жалпыға қолжетімді, auth қажет емес)
GET  /courses?level=BEGINNER  → Деңгей бойынша сүзу
GET  /courses?page=1&limit=10 → Беттеу
GET  /courses/:id             → Жеке курс
POST /courses                 → Жасау (TEACHER/ADMIN)
PATCH /courses/:id            → Жаңарту (TEACHER/ADMIN)
DELETE /courses/:id           → Жою (TEACHER/ADMIN)
```

---

## 📖 Сабақтар

### Сабақ деректер үлгісі

```prisma
model Lesson {
  id               String  @id @default(uuid())
  courseId         String
  title            String
  content          String          // Markdown мазмұн
  videoUrl         String?         // YouTube сілтемесі
  assignment       String?         // Тапсырма мәтіні
  assignmentAnswer String?         // Дұрыс жауап (клиентке жіберілмейді!)
  order            Int             // Сабақ реті
}
```

### Сабақ API

```
GET    /courses/:courseId/lessons             → Тізім
GET    /courses/:courseId/lessons/:id         → Жеке сабақ
GET    /courses/:courseId/lessons/progress/my → Прогресс (auth)
POST   /courses/:courseId/lessons/:id/check-assignment → Тапсырманы тексеру
POST   /courses/:courseId/lessons/:id/complete         → Оқылды деп белгілеу
```

### Тапсырма тексеру логикасы

**Дұрыс жауапты анықтау:**
1. Пайдаланушының жауабы мен дұрыс жауап:
   - Trim (бастапқы/соңғы бос орын алынады)
   - Lowercase (кіші әріпке)
   - Барлық бос орындар алынады
   - `;`, `"`, `'` символдар алынады
2. Егер сәйкес болса → `{ correct: true }` + LessonProgress жазылады
3. Дұрыс емес болса → `{ correct: false, feedback: "Қате. Қайта көріңіз және 15 секундтан кейін қайталаңыз." }`

**Frontend 15 секунд күту:**
```tsx
// Дұрыс емес жауапта:
setRetryCountdown(15); // 15 секунд кері санау
// Кері санау аяқталғанша батырма өшіріледі
```

---

## 🎯 Емтихандар

### 11 емтихан бар:

| # | Тақырып | Сұрақ саны |
|---|---------|-----------|
| 1 | HTML & CSS | 10 |
| 2 | JavaScript | 10 |
| 3 | Python | 10 |
| 4 | Git & GitHub | 10 |
| 5 | TypeScript | 10 |
| 6 | React | 10 |
| 7 | SQL | 10 |
| 8 | Node.js | 10 |
| 9 | Docker | 10 |
| 10 | NestJS | 10 |
| 11 | React Advanced | 10 |

### Емтихан API

```
GET  /exams                     → Барлық емтихандар
GET  /exams/:id                 → Жеке емтихан + сұрақтар
POST /attempts/:examId/start    → Емтихан бастау
POST /attempts/:examId/submit   → Жауаптар жіберу
GET  /attempts/my               → Менің тапсырмаларым
```

### Емтихан кодтық сұрақ үлгілері

#### HTML & CSS
```
Q: Мына CSS қандай нәтиже береді? display: flex; justify-content: center;
A: Элементтерді горизонталды ортаға туралайды

Q: CSS selector specificity (нақтылық) тәртібі?
A: Inline > ID > Class > Tag
```

#### JavaScript
```
Q: Нәтижесі не болады? console.log(typeof null)
A: "object"

Q: == мен === айырмашылығы?
A: === типті де тексереді, == тексермейді
```

#### Python
```
Q: list мен tuple айырмашылығы?
A: tuple өзгертілмейді (immutable), list өзгертіледі (mutable)

Q: Python-да __init__ не үшін қажет?
A: Класс инициализаторы (constructor)
```

#### Git
```
Q: git rebase мен git merge айырмашылығы?
A: rebase тарихты тегіс жасайды, merge тармақ құрылымын сақтайды

Q: HEAD не білдіреді?
A: Ағымдағы commit-ке сілтеме жасайтын pointer
```

---

## 🔑 Тіркелу жүйесі (Enrollment)

### Ережелер

1. **Бір уақытта бір курс** — белсенді тіркелу болса, басқа курсқа тіркеле алмайсыз
2. **Барлық сабақтарды аяқтағанда** — курс автоматты аяқталады
3. Аяқтаған соң жаңа курсқа тіркелуге болады

### API

```
POST   /enrollments/courses/:id  → Тіркелу
GET    /enrollments/my           → Менің тіркелулерім
GET    /enrollments/active       → Белсенді тіркелу
GET    /enrollments/check/:id    → Нақты курсқа тіркелгенін тексеру
DELETE /enrollments/:id          → Тіркелуден шығу
POST   /enrollments/complete/:id → Курсты аяқтандыру
```

---

## 🏆 Сертификаттар

Пайдаланушы курстың 100% сабақтарын аяқтаған + емтиханды тапсырған соң сертификат алады.

```
GET  /certificates/my        → Менің сертификаттарым
GET  /certificates/:id       → PDF жүктеу
POST /certificates/issue     → Сертификат беру (ADMIN)
```

---

## 🗄️ Prisma командалары

```powershell
# Схеманы деректер базасымен синхрондау
cd C:\Users\user\ProctoLearn\backend
npx prisma db push

# Prisma Client қайта генерациялау
npx prisma generate

# Seeding (мысалы: негізгі seed)
$env:TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'
npx ts-node --project tsconfig.json prisma/seed.ts

# Lesson content seed
npx ts-node --project tsconfig.json prisma/update-lesson-content.ts

# Prisma Studio (веб-интерфейс)
npx prisma studio
```

**Маңызды:** `prisma migrate dev` ҚОЛДАНБАҢЫЗ — database drift туғызады. Тек `prisma db push` қолданыңыз.

---

## 🏗️ Архитектура

```
ProctoLearn/
├── backend/                    # NestJS (port 4000)
│   ├── src/
│   │   ├── auth/               # JWT аутентификация
│   │   ├── users/              # Пайдаланушылар
│   │   ├── courses/            # Курстар
│   │   ├── lessons/            # Сабақтар + тапсырма тексеру
│   │   ├── enrollments/        # Тіркелу жүйесі
│   │   ├── exams/              # Емтихандар
│   │   ├── attempts/           # Тапсырмалар
│   │   ├── certificates/       # Сертификаттар
│   │   ├── proctor/            # WebSocket прокторинг
│   │   ├── minio/              # Файл хранилища
│   │   └── mail/               # Email жіберу
│   └── prisma/
│       ├── schema.prisma       # Деректер үлгісі
│       ├── seed.ts             # Негізгі seed
│       └── update-lesson-content.ts  # Сабақ мазмұны
│
└── frontend/                   # Next.js 15 (port 3000)
    └── src/app/
        ├── page.tsx            # Лендинг (жалпыға қолжетімді)
        ├── auth/               # Кіру / Тіркелу
        └── dashboard/
            ├── courses/        # Курстар тізімі
            ├── courses/[id]/   # Курс беті
            ├── courses/[id]/lessons/[lessonId]/  # Сабақ беті
            ├── exam/[examId]/  # Емтихан беті
            └── admin/          # Админ панелі
```

---

## 🧰 Технологиялар

| Топ | Технология | Нұсқа |
|-----|-----------|-------|
| Backend | NestJS | 11 |
| ORM | Prisma | 6.19.2 |
| Database | PostgreSQL | 15 |
| Authentication | JWT + Passport | — |
| Frontend | Next.js | 15.2 |
| UI Framework | React | 19 |
| Styles | Tailwind CSS | 3 |
| State | Zustand | — |
| HTTP Client | Axios | — |
| Real-time | Socket.IO | — |
| File Storage | MinIO | — |
| Mail | Nodemailer | — |

---

## 🚀 Docker арқылы іске қосу

```bash
# Барлық қызметтерді қосу
docker-compose up -d

# Тек дерекқорды қосу
docker-compose up -d postgres

# Барлық қызметтерді тоқтату
docker-compose down
```

**docker-compose.yml** — production  
**docker-compose.dev.yml** — development (hot reload бар)

---

## 🛠️ Жиі кездесетін мәселелер

### Prisma "drift" қатесі
```
Error: Drift detected: Your database schema is not in sync
```
**Шешім:** `npx prisma db push --force-reset` (деректер жойылады!) немесе `npx prisma db push`

### Prisma DLL заблокированный
```
Error: EPERM: operation not permitted ... query_engine-windows.dll.node
```
**Шешім:** `Get-Process -Name node | Stop-Process -Force` терминалда іске қосыңыз

### ts-node `--compiler-options` қиындығы (Windows)
```powershell
# ДҰРЫСl:
$env:TS_NODE_COMPILER_OPTIONS='{"module":"commonjs"}'
npx ts-node --project tsconfig.json prisma/seed.ts

# ҚАТЕ (Windows PowerShell-де жұмыс істемейді):
npx ts-node --compiler-options '{"module":"commonjs"}' ...
```

---

## 📝 Changelog

### v1.3.0
- ✅ Coursera стилінде лендинг беті (жалпыға қолжетімді)
- ✅ GET /courses жалпыға қолжетімді (auth жоқ)
- ✅ Сабақ тапсырмасын тексеру (15 секунд күту)
- ✅ Нақты оқу мазмұны (HTML/CSS, JS курстары)
- ✅ `assignmentAnswer` схемаға қосылды

### v1.2.0
- ✅ Тіркелу жүйесі (Enrollment)
- ✅ Деңгей сүзгі табтары (Beginner/Intermediate/Advanced)
- ✅ Кодтық сұрақтары бар 11 емтихан

### v1.1.0
- ✅ 58 курс, 532 сабақ SQL арқылы seed
- ✅ CourseLevel enum
- ✅ YouTube видео бейімдеу

### v1.0.0
- ✅ Аутентификация (JWT)
- ✅ CRUD: Users, Courses, Lessons, Exams
- ✅ WebSocket прокторинг
- ✅ Сертификат жүйесі
