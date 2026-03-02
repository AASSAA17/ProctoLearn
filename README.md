# 🎓 ProctoLearn

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?style=for-the-badge&logo=nestjs)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker)

**Онлайн оқу платформасы және автоматты прокторинг жүйесі**

[Мүмкіндіктер](#-прокторинг-мүмкіндіктері) • [Орнату](#-орнату) • [Архитектура](#-архитектура) • [API](#-api-эндпоинттер) • [Рөлдер](#-рөлдер)

</div>

---

## 📌 Жоба туралы

**ProctoLearn** — онлайн білім беру мен академиялық адалдықты қамтамасыз ететін толыққанды платформа.

Жүйе арқылы:
- білім алушылар курстарды оқып, емтихан тапсырады
- оқытушылар курс пен тест мазмұнын басқарады
- проктор / әкімші емтихан барысын реалтайм режимде бақылайды

> 🇰🇿 Интерфейс толығымен **қазақ тілінде** жасалады.

---

## 🎯 Жобаның мақсаты

| Мақсат | Сипаттама |
|--------|-----------|
| 📚 Цифрландыру | Онлайн оқыту процесін толық автоматтандыру |
| 🛡 Адалдық | Емтихан кезінде списывание мен алдауды болдырмау |
| 🤖 Автоматтандыру | Күмәнді әрекеттерді алгоритмдік анықтау |
| 📊 Бақылау | Проктор мен әкімшіге толық бақылау панелі |

---

## 👥 Рөлдер

### 👨‍🎓 Білім алушы
- Курстар мен сабақтарды көру
- Емтихан тапсыру (прокторинг режимінде)
- Нәтижелер мен сертификаттарды алу

### 👩‍🏫 Оқытушы
- Курс және сабақ жасау / редакциялау
- Тест пен емтихан сұрақтарын қосу
- Студенттердің нәтижелерін талдау

### 🛡 Проктор / Әкімші
- Барлық емтихан сессияларын реалтайм бақылау
- Күмәнді әрекеттерді тексеру және шешім шығару
- Evidence (скриншот / видео клип) базасын басқару
- Trust Score есебін қарау

---

## 🧠 Прокторинг мүмкіндіктері

```
┌─────────────────────────────────────────┐
│           ПРОКТОРИНГ ЖҮЙЕСІ             │
├──────────────┬──────────────────────────┤
│ Бақылау      │ Камера + экран бөлісу     │
│ Таймер       │ Серверлік, манипуляция    │
│              │ мүмкін емес               │
│ Қойынды      │ Tab/Window ауыстыруды     │
│              │ тіркеу                    │
│ Fullscreen   │ Шыққан жағдайда ескерту  │
│ Copy/Paste   │ Буферге кіруді тіркеу    │
│ Evidence     │ Авто скриншот + клип      │
│ Trust Score  │ 0–100 ұпай жүйесі         │
└──────────────┴──────────────────────────┘
```

| Мүмкіндік | Сипаттама |
|-----------|-----------|
| 📷 Камера | Емтихан кезінде міндетті вебкам |
| 🖥 Экран | Экран бөлісуді талап ету |
| ⏱ Таймер | Серверлік уақыт бақылауы |
| 🔄 Tab | Қойынды ауыстыруды логтау |
| 📋 Copy/Paste | Буфер операцияларын тіркеу |
| 📸 Evidence | Скриншот / видеоклип сақтау |
| 🏆 Trust Score | Күмән деңгейін есептеу (0–100) |

---

## 🏗 Архитектура

```
┌─────────────────────────────────────────────────────┐
│                    КЛИЕНТ                           │
│              Next.js + TypeScript                   │
│         (Студент / Оқытушы / Проктор UI)            │
└────────────────────┬────────────────────────────────┘
                     │ REST API + WebSocket
┌────────────────────▼────────────────────────────────┐
│                   BACKEND                           │
│              NestJS + Socket.io                     │
│   Auth │ Courses │ Exams │ Proctor │ Certificates   │
└──────┬─────────────────────────┬────────────────────┘
       │                         │
┌──────▼──────┐          ┌───────▼──────┐
│ PostgreSQL  │          │    MinIO     │
│  (деректер) │          │  (evidence)  │
└─────────────┘          └──────────────┘
```

---

## 🏗 Технологиялық стек

| Қабат | Технология | Мақсат |
|-------|-----------|--------|
| Frontend | Next.js 14 + TypeScript | UI, SSR |
| Backend | NestJS + TypeScript | REST API, бизнес-логика |
| Реалтайм | Socket.io | Прокторинг трансляциясы |
| Database | PostgreSQL | Негізгі деректер |
| Storage | MinIO (S3) | Evidence файлдары |
| Deploy | Docker + Compose | Контейнеризация |

---

## 📂 Жоба құрылымы

```
proctolearn/
│
├── apps/
│   ├── web/                    # Frontend (Next.js)
│   │   ├── app/                # App Router беттері
│   │   ├── components/         # UI компоненттері
│   │   ├── lib/                # Утилиттер, API клиент
│   │   └── public/             # Статикалық файлдар
│   │
│   └── api/                    # Backend (NestJS)
│       ├── src/
│       │   ├── auth/           # JWT авторизация
│       │   ├── users/          # Пайдаланушылар
│       │   ├── courses/        # Курстар
│       │   ├── exams/          # Емтихандар
│       │   ├── proctor/        # Прокторинг модулі
│       │   └── certificates/   # Сертификаттар
│       └── prisma/             # DB схема
│
├── docker-compose.yml
└── # ProctoLearn 🎓

**Прокторингтік технологиямен онлайн оқыту платформасы**

Онлайн оқыту, емтихан тапсыру және нақты уақыттағы прокторинг жүйесі. Интерфейс толығымен **қазақ тілінде**.

---

## Технологиялар

| Сервис    | Технологиялар                                          |
|-----------|--------------------------------------------------------|
| Frontend  | Next.js 15, TypeScript 5.9, Tailwind CSS, Socket.io   |
| Backend   | NestJS 11, TypeScript 5.9, REST API, Socket.io 4.8.3  |
| Database  | PostgreSQL 16 + Prisma ORM                             |
| Storage   | MinIO (S3-совместимый)                                 |
| Auth      | JWT (access 15m + refresh 7d) + RBAC                  |
| Deploy    | Docker + Docker Compose                                |

---

## Рөлдер

- **STUDENT** — курстарды оқу, емтихан тапсыру
- **TEACHER** — курс, сабақ, емтихан жасау
- **PROCTOR** — сессияларды бақылау, дәлелдемелерді қарау
- **ADMIN** — толық өкілет

---

## Прокторинг жүйесі

### WebSocket оқиғалары (`/proctor` namespace)
| Оқиға | Сипаттама |
|-------|-----------|
| `proctor:start` | Сессияны бастау |
| `proctor:event` | Оқиғаны тіркеу |
| `proctor:screenshot` | Скриншотты сақтау (base64 → MinIO) |
| `proctor:end` | Сессияны аяқтау |

### Trust Score жүйесі
| Оқиға | Шегерім |
|-------|---------|
| `tab_switch` | -10 |
| `copy_paste` / `paste` | -15 |
| `fullscreen_exit` | -5 |
| `face_not_detected` | -20 |

---

## Іске қосу

### Docker Compose арқылы (ұсынылады)

```bash
# 1. .env конфигурациялау (өзгерту ұсынылады)
cp .env .env.local

# 2. Барлық сервистерді іске қосу
docker compose up --build
```

**Қолжетімді мекенжайлар:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- Swagger Docs: http://localhost:4000/api/docs
- MinIO Console: http://localhost:9001

---

### Жергілікті іске қосу

**Backend:**
```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run start:dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

---

## Жоба құрылымы

```
ProctoLearn/
├── docker-compose.yml
├── .env
├── backend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── prisma/           # PrismaService
│   │   ├── auth/             # JWT аутентификация, RBAC
│   │   ├── users/            # Пайдаланушылар
│   │   ├── courses/          # Курстар
│   │   ├── lessons/          # Сабақтар
│   │   ├── exams/            # Емтихандар + сұрақтар
│   │   ├── attempts/         # Талпынулар + автобалл
│   │   ├── proctor/          # WebSocket Gateway + сервис
│   │   ├── evidence/         # MinIO дәлелдемелер
│   │   ├── certificates/     # QR сертификаттар
│   │   ├── minio/            # MinIO клиенті
│   │   └── common/           # Guards, Decorators
│   └── prisma/
│       └── schema.prisma
└── frontend/
    └── src/
        ├── app/
        │   ├── page.tsx              # Басты бет
        │   ├── auth/login/           # Кіру
        │   ├── auth/register/        # Тіркелу
        │   └── dashboard/
        │       ├── courses/          # Курс тізімі + детальдар
        │       ├── exam/[examId]/    # Емтихан + прокторинг
        │       ├── my-attempts/      # Нәтижелер
        │       ├── certificates/     # Сертификаттар
        │       ├── teacher/          # Мұғалім панелі
        │       └── proctor/          # Проктор панелі
        ├── lib/api.ts                # Axios + interceptors
        └── store/auth.store.ts       # Zustand auth state
```

---

## API Эндпойнттері

| Метод | URL | Сипаттама |
|-------|-----|-----------|
| POST | `/auth/register` | Тіркелу |
| POST | `/auth/login` | Кіру |
| POST | `/auth/refresh` | Token жаңарту |
| GET | `/courses` | Барлық курстар |
| POST | `/courses` | Курс жасау (teacher) |
| GET | `/courses/:id` | Курс детальдары |
| POST | `/courses/:id/exams` | Емтихан жасау |
| POST | `/attempts/start/:examId` | Емтихан бастау |
| POST | `/attempts/:id/submit` | Жауап жіберу |
| GET | `/certificates/my` | Сертификаттар |
| GET | `/certificates/verify/:code` | QR тексеру |
| GET | `/evidence/:attemptId` | Дәлелдемелер (proctor) |

Толық құжаттама: **http://localhost:4000/api/docs** (Swagger)
```

---

## ⚙ Орнату

### Алдын ала талаптар

- [Docker](https://docker.com) және Docker Compose
- Git

### 1️⃣ Репозиторийді клондау

```bash
git clone <repository_url>
cd proctolearn
```

### 2️⃣ Орта айнымалыларын баптау

```bash
cp .env.example .env
# .env файлын өзіңіздің мәндеріңізбен толтырыңыз
```

```env
# .env мысалы
DATABASE_URL=postgresql://user:password@localhost:5432/proctolearn
JWT_SECRET=your_super_secret_key
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

### 3️⃣ Docker арқылы іске қосу

```bash
docker compose up --build
```

### 4️⃣ Қолжетімді сервистер

| Сервис | URL |
|--------|-----|
| 🌐 Web (Frontend) | http://localhost:3000 |
| 🔧 API (Backend) | http://localhost:4000 |
| 🗄 MinIO Console | http://localhost:9001 |

---

## 🗄 Деректер базасы схемасы

```
users          → id, name, email, role, password
courses        → id, title, description, teacher_id
lessons        → id, course_id, title, content, order
exams          → id, course_id, title, duration, pass_score
questions      → id, exam_id, text, type, options, answer
attempts       → id, exam_id, user_id, started_at, status, trust_score
answers        → id, attempt_id, question_id, answer, is_correct
proctor_events → id, attempt_id, type, timestamp, metadata
evidence_files → id, attempt_id, type, url, created_at
certificates   → id, user_id, course_id, issued_at, qr_code
```

---

## 🔌 API Эндпоинттер

```
POST   /auth/login              → Кіру
POST   /auth/register           → Тіркелу

GET    /courses                 → Курстар тізімі
POST   /courses                 → Курс жасау (Оқытушы)
GET    /courses/:id/lessons     → Сабақтар

GET    /exams/:id               → Емтихан деректері
POST   /exams/:id/start         → Сессия бастау
POST   /exams/:id/submit        → Жауап жіберу

GET    /proctor/sessions        → Белсенді сессиялар
GET    /proctor/evidence/:id    → Evidence файлдары

GET    /certificates/my         → Менің сертификаттарым
```

---

## 🔐 Қауіпсіздік

- ✅ JWT Bearer токені (access + refresh)
- ✅ Рөлге негізделген қолжетімділік (RBAC)
- ✅ Серверлік таймер (клиенттік манипуляцияны болдырмау)
- ✅ Evidence файлдарын MinIO-да оқшау сақтау
- ✅ HTTPS (production ортасында)
- ✅ Evidence сақтау мерзімін шектеу (90 күн)

---

## 🚀 Болашақ даму жоспарлары

- [ ] 🤖 AI арқылы бет тануды жақсарту (face detection)
- [ ] 📊 Аналитикалық dashboard (Chart.js / Recharts)
- [ ] 📄 PDF сертификат + QR тексеру
- [ ] 📱 Мобильді нұсқа (React Native)
- [ ] 🌍 Орыс / ағылшын тілдерін қосу
- [ ] 🔔 Push-хабарламалар

---

## 📄 Лицензия

Бұл жоба **оқу / дипломдық** мақсатта жасалған.  
© 2024 ProctoLearn. Барлық құқықтар сақталған.
