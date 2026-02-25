# ProctoLearn
Онлайн оқу платформасы және прокторинг жүйесі.

## Архитектуралық стек
- Frontend: Next.js (App Router) + TypeScript
- Backend: NestJS + Prisma + Socket.io
- Database: PostgreSQL
- Storage: MinIO (S3 compatible)
- Infra: Docker Compose

## Жобаның құрылымы
```
proctolearn/
├── apps/
│   ├── web/               # Next.js frontend
│   └── api/               # NestJS backend
├── docker-compose.yml
└── README.md
```

## Frontend архитектурасы
`apps/web` ішінде негізгі құрылым:
- `app/(public)` — ашық беттер
- `app/(auth)` — login/register
- `app/exam` — емтихан lifecycle беттері
- `app/admin` — проктор/әкімші мониторинг беттері
- `components/{ui,layout,proctoring}` — UI және прокторинг компоненттері
- `lib/{api,auth,socket,proctoring,i18n}` — data/auth/socket және қазақша i18n қабаты

## Backend архитектурасы
`apps/api` ішінде NestJS skeleton:
- `src/main.ts` — bootstrap + global validation
- `src/modules/` — домендік модульдер (`auth`, `courses`, `attempts`, `proctoring`, т.б.)
- `prisma/schema.prisma` — PostgreSQL datasource және базалық `User`/`Role` модельдері

## Docker сервистері
- `web` — Next.js (`localhost:3000`)
- `api` — NestJS (`localhost:4000`)
- `db` — PostgreSQL (`localhost:5432`)
- `minio` — object storage (`localhost:9000`, console `:9001`)

## Келесі қадамдар
1. NestJS модульдерін controller/service/repository деңгейінде толтыру.
2. Prisma миграцияларын қосу (`users`, `courses`, `lessons`, `exams`, `attempts`, `proctor_events`, `evidence_files`).
3. Socket.io gateway арқылы realtime proctoring events тарату.
4. Frontend-та API client және exam/proctoring workflow іске асыру.
