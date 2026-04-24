import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Known Fireship "in 100 seconds" embed URLs by keyword
const knownEmbeds: Record<string, string> = {
  'что такое html': 'https://www.youtube.com/embed/ok-plXXHlWw',
  'что такое css': 'https://www.youtube.com/embed/OEV8gMkCHXQ',
  'что такое javascript': 'https://www.youtube.com/embed/DHjqpvDnNGE',
  'установка python': 'https://www.youtube.com/embed/x7X9w_GIm1s',
  'что такое typescript': 'https://www.youtube.com/embed/zQnBQ4tB3ZA',
  'архитектура nestjs': 'https://www.youtube.com/embed/0M8AYU_hPas',
  'docker compose': 'https://www.youtube.com/embed/Gjnup-PuquQ',
  'git rebase': 'https://www.youtube.com/embed/HkdAHXoRtos',
  'архитектура kubernetes': 'https://www.youtube.com/embed/PziYflu8cB8',
  'redis архитектура': 'https://www.youtube.com/embed/G1rOthIU-uo',
  'graphql vs rest': 'https://www.youtube.com/embed/eIQh02xuVw4',
  'prisma schema': 'https://www.youtube.com/embed/rLRIB6AF2Dg',
  'что такое sql': 'https://www.youtube.com/embed/zsjvFFKOm3c',
  'как работает jwt': 'https://www.youtube.com/embed/SXsO_cQ8W3c',
  'react navigation v6': 'https://www.youtube.com/embed/nQVCkqvU1uE',
  'useeffect': 'https://www.youtube.com/embed/0ZJgIjIuY7U',
  'asyncio изнутри': 'https://www.youtube.com/embed/t5Bo1Je9EmE',
  'философия utility-first': 'https://www.youtube.com/embed/mr15Xzb1Ook',
  'рекурсия': 'https://www.youtube.com/embed/mz6tAJMVmfM',
  'монолит vs микросервисы': 'https://www.youtube.com/embed/y8OnoxKotPQ',
  'websocket vs http': 'https://www.youtube.com/embed/1BfCnjr_Vjg',
  'ci/cd концепция': 'https://www.youtube.com/embed/scEDHsr3APg',
  'масштабирование': 'https://www.youtube.com/embed/ZO_-R7M9vCY',
  'app router vs pages router': 'https://www.youtube.com/embed/Sklc_fQBmcs',
  'react profiler': 'https://www.youtube.com/embed/Qwb-Za6cBws',
  'typescript compiler api': 'https://www.youtube.com/embed/X48VuDVv0do',
  'owasp top 10': 'https://www.youtube.com/embed/ravAqa5eGAg',
  'тест-пирамида': 'https://www.youtube.com/embed/r9HdJ8P6GQI',
};

// Generate a YouTube search URL for any lesson title
function youtubeSearch(title: string): string {
  const query = encodeURIComponent(title + ' tutorial english');
  return `https://www.youtube.com/results?search_query=${query}`;
}

// Find known embed or fall back to search
function getVideoUrl(title: string): string {
  const lower = title.toLowerCase();
  for (const [key, url] of Object.entries(knownEmbeds)) {
    if (lower.startsWith(key) || lower.includes(key)) {
      return url;
    }
  }
  return youtubeSearch(title);
}

// Generate a contextual mini-assignment for a video lesson (in Russian)
function generateAssignment(title: string): string {
  const lower = title.toLowerCase();

  if (lower.includes('useeffect'))
    return 'Практика: создай компонент Timer, который запускает интервал через useEffect и очищает его при размонтировании. Не допусти утечку памяти.';
  if (lower.includes('usecontext'))
    return 'Практика: создай ThemeContext с двумя темами (light/dark) и переключателем. Используй useContext в дочернем компоненте без prop drilling.';
  if (lower.includes('usereducer'))
    return 'Практика: реализуй корзину покупок через useReducer с действиями ADD_ITEM, REMOVE_ITEM, CLEAR_CART.';
  if (lower.includes('usememo') || lower.includes('usecallback'))
    return 'Практика: создай компонент с тяжёлым вычислением (сортировка 10000 элементов), оберни в useMemo. Используй React DevTools Profiler для сравнения.';
  if (lower.includes('react.memo'))
    return 'Практика: создай список из 100 элементов. Обмотай каждый элемент списка в React.memo и измерь количество рендеров через console.count.';
  if (lower.includes('compound component'))
    return 'Практика: реализуй компонент Tabs с паттерном Compound Components: <Tabs><Tabs.List><Tabs.Tab /><Tabs.Content /></Tabs>.';
  if (lower.includes('render props') || lower.includes('hoc'))
    return 'Практика: создай HOC withAuth, который проверяет авторизацию и редиректит на /login, если пользователь не вошёл.';
  if (lower.includes('error boundaries'))
    return 'Практика: создай компонент ErrorBoundary и оберни им секцию с данными. Симулируй ошибку через throw в дочернем компоненте.';

  if (lower.includes('архитектура nestjs') || lower.includes('модули, контроллеры'))
    return 'Практика: создай модуль Products с контроллером и сервисом. Реализуй GET /products и POST /products с хранением в массиве.';
  if (lower.includes('dto') || lower.includes('class-validator'))
    return 'Практика: создай CreateUserDto с полями email, password, name. Добавь валидацию: email должен быть валидным, password минимум 8 символов.';
  if (lower.includes('dependency injection'))
    return 'Практика: создай LoggerService и внедри его через DI в два разных модуля. Убедись, что один инстанс служит всем потребителям.';
  if (lower.includes('pipe'))
    return 'Практика: создай кастомный ParsePositiveIntPipe, который выбрасывает BadRequestException если число отрицательное.';
  if (lower.includes('guard'))
    return 'Практика: создай ApiKeyGuard который проверяет заголовок X-API-KEY. Примени его к нескольким эндпоинтам.';
  if (lower.includes('interceptor'))
    return 'Практика: создай LoggingInterceptor, который логирует метод запроса, URL и время выполнения для каждого запроса.';
  if (lower.includes('prisma') && lower.includes('nestjs'))
    return 'Практика: подключи PrismaService к модулю Users. Реализуй findAll() и findById() используя prisma.user.findMany() и findUnique().';
  if (lower.includes('swagger'))
    return 'Практика: добавь @ApiTags, @ApiOperation, @ApiResponse декораторы ко всем эндпоинтам твоего API. Открой /api и убедись что документация корректна.';

  if (lower.includes('подзапросы'))
    return 'Практика: напиши запрос, который возвращает всех сотрудников с зарплатой выше средней по их отделу. Используй коррелированный подзапрос.';
  if (lower.includes('cte') || lower.includes('with'))
    return 'Практика: используя CTE, найди топ-3 продавца по выручке за последние 30 дней с их процентом от общей выручки.';
  if (lower.includes('оконные функции') || lower.includes('row_number'))
    return 'Практика: используй ROW_NUMBER() для нумерации сотрудников внутри каждого отдела по зарплате. Затем выбери только 1-е место в каждом отделе.';
  if (lower.includes('explain analyze'))
    return 'Практика: возьми медленный запрос с несколькими JOIN-ами, запусти EXPLAIN ANALYZE, найди Seq Scan и добавь соответствующий индекс.';
  if (lower.includes('индекс') || lower.includes('b-tree'))
    return 'Практика: создай таблицу с 1M записей, запусти EXPLAIN на запрос без индекса, добавь B-tree индекс и сравни планы выполнения.';
  if (lower.includes('json') && lower.includes('postgresql'))
    return 'Практика: создай таблицу с колонкой JSONB. Напиши запрос который фильтрует по полю внутри JSON и добавь GIN индекс для оптимизации.';

  if (lower.includes('классы и объект') || lower.includes('__init__'))
    return 'Практика: создай класс BankAccount с методами deposit(amount), withdraw(amount), get_balance(). Добавь валидацию что баланс не уходит в минус.';
  if (lower.includes('наследование'))
    return 'Практика: создай базовый класс Shape с методом area(). Наследуй Circle, Rectangle, Triangle и переопредели area() в каждом.';
  if (lower.includes('dunder') || lower.includes('__str__'))
    return 'Практика: создай класс Vector с полями x, y. Реализуй __add__, __sub__, __mul__, __str__, __repr__, __len__.';
  if (lower.includes('singleton') || lower.includes('factory'))
    return 'Практика: реализуй паттерн Singleton для класса Config (настройки приложения). Убедись что при многократном создании возвращается один объект.';
  if (lower.includes('observer') || lower.includes('strategy'))
    return 'Практика: реализуй EventEmitter через паттерн Observer с методами subscribe(event, callback), unsubscribe(event, callback), emit(event, data).';
  if (lower.includes('декораторы') && lower.includes('python'))
    return 'Практика: создай декоратор @retry(times=3) который автоматически повторяет вызов функции при исключении до N раз.';
  if (lower.includes('dataclasses'))
    return 'Практика: преобразуй класс Person(name, age, email) в @dataclass. Добавь валидацию через __post_init__ что age > 0.';

  if (lower.includes('jwt') || lower.includes('структура токена'))
    return 'Практика: декодируй JWT токен вручную (base64 decode payload без библиотеки). Создай функцию isTokenExpired(token) которая проверяет поле exp.';
  if (lower.includes('bcrypt') || lower.includes('argon'))
    return 'Практика: напиши функцию hashPassword(password) и verifyPassword(password, hash) используя bcryptjs. Замерь время хеширования при разных rounds (10, 12, 14).';
  if (lower.includes('rbac') || lower.includes('ролевая'))
    return 'Практика: реализуй систему ролей ADMIN/TEACHER/STUDENT с декоратором @Roles() и Guards. Проверь что /admin доступен только ADMIN.';
  if (lower.includes('хранение токенов') || lower.includes('куки'))
    return 'Практика: реализуй refresh token rotation — при каждом обновлении access токена генерируется новый refresh токен, старый инвалидируется в БД.';

  if (lower.includes('дженерики'))
    return 'Практика: создай дженерик функцию groupBy<T>(items: T[], key: keyof T): Record<string, T[]>. Проверь типобезопасность с разными объектами.';
  if (lower.includes('утилитарные типы') || lower.includes('partial'))
    return 'Практика: создай тип DeepPartial<T> который делает все поля опциональными рекурсивно. Проверь на вложенных объектах.';
  if (lower.includes('conditional types'))
    return 'Практика: создай тип IsArray<T> = T extends any[] ? true : false. Затем создай Flatten<T> который вынимает тип элемента из массива.';
  if (lower.includes('mapped types') || lower.includes('keyof'))
    return 'Практика: создай тип Nullable<T> который делает все поля T nullable (T | null). Создай NonNullable версию обратно.';
  if (lower.includes('template literal'))
    return 'Практика: создай тип EventName = `on${Capitalize<string>}`. Создай тип для объекта EventHandlers где ключи — это EventName.';

  if (lower.includes('app router vs pages'))
    return 'Практика: создай страницу /blog в App Router с layout.tsx. Используй Server Component для получения данных и передай их в Client Component для интерактивности.';
  if (lower.includes('server components'))
    return 'Практика: создай Server Component который делает fetch() к публичному API без useEffect. Обмотай в Suspense с fallback спиннером.';
  if (lower.includes('ssr') || lower.includes('ssg') || lower.includes('isr'))
    return 'Практика: создай страницу /products с ISR (revalidate: 60). Создай /products/[id] со static params. Измерь время генерации страниц.';
  if (lower.includes('route handlers'))
    return 'Практика: создай Route Handler GET /api/posts и POST /api/posts. Добавь обработку ошибок и возврат NextResponse с правильными статусами.';

  if (lower.includes('docker compose') && lower.includes('yaml'))
    return 'Практика: напиши docker-compose.yml для стека: NestJS API + PostgreSQL + Redis. Настрой переменные окружения через .env файл. Проверь `docker compose up -d`.';
  if (lower.includes('volumes'))
    return 'Практика: добавь named volume для PostgreSQL в docker-compose. Убедись что данные сохраняются после `docker compose down` и `docker compose up`.';
  if (lower.includes('health check'))
    return 'Практика: добавь healthcheck для PostgreSQL контейнера и depends_on с condition: service_healthy для API контейнера.';
  if (lower.includes('multi-stage') || lower.includes('многоэтап'))
    return 'Практика: создай multi-stage Dockerfile для NestJS: stage 1 — build (node:18), stage 2 — production (node:18-alpine). Сравни размеры образов.';

  if (lower.includes('pods') || lower.includes('жизненный цикл'))
    return 'Практика: создай Pod спецификацию для NestJS приложения с liveness и readiness probe. Задеплой через `kubectl apply -f pod.yaml` и проверь статус.';
  if (lower.includes('helm'))
    return 'Практика: создай Helm chart для твоего приложения с values.yaml для image, replicas, env. Сделай `helm install myapp ./chart` и проверь.';
  if (lower.includes('ingress'))
    return 'Практика: создай Ingress ресурс который роутит /api → backend-service и / → frontend-service по одному домену.';
  if (lower.includes('hpa') || lower.includes('автомасштаб'))
    return 'Практика: настрой HPA для деплоя с minReplicas: 2, maxReplicas: 10, targetCPUUtilization: 70%. Проверь поведение при нагрузке через kubectl run load-generator.';

  if (lower.includes('github actions'))
    return 'Практика: создай workflow который запускает npm test на каждый push в main. Добавь badge статуса CI в README.';
  if (lower.includes('docker build') && lower.includes('registry'))
    return 'Практика: добавь в workflow шаг docker/build-push-action. Запушь образ в GitHub Container Registry (ghcr.io). Проверь что тег соответствует git sha.';
  if (lower.includes('rolling updates') || lower.includes('zero-downtime'))
    return 'Практика: настрой rolling update стратегию: maxSurge: 1, maxUnavailable: 0. Имитируй деплой и убедись что сервис не прерывается.';

  if (lower.includes('react profiler'))
    return 'Практика: открой React DevTools Profiler. Запиши профиль для компонента с большим списком. Найди компоненты с > 16ms рендером и оптимизируй.';
  if (lower.includes('виртуализац') || lower.includes('react-window'))
    return 'Практика: создай список из 100 000 элементов. Сначала без виртуализации (измерь FPS), затем с react-window FixedSizeList (измерь FPS снова).';
  if (lower.includes('react query'))
    return 'Практика: замени прямые axios вызовы в компоненте на useQuery и useMutation из React Query. Настрой staleTime: 60000 и invalidateQueries после мутации.';
  if (lower.includes('usetransition') || lower.includes('usedeferredvalue'))
    return 'Практика: создай поиск по большому списку. Без useTransition — заметь зависания. С useTransition — обнови состояние input немедленно, а фильтрацию — через transition.';

  if (lower.includes('красно-чёрные') || lower.includes('балансировка'))
    return 'Практика: реализуй Red-Black Tree с операцией insert и проверкой балансировки. Или: решить LeetCode задачу "Balanced Binary Tree" (108, 110).';
  if (lower.includes('дейкстры') || lower.includes('a*'))
    return 'Практика: реализуй алгоритм Дейкстры для поиска кратчайшего пути в графе с N вершинами (используй priority queue). Тест: LeetCode 743 "Network Delay Time".';
  if (lower.includes('bfs') || lower.includes('dfs') || lower.includes('графы'))
    return 'Практика: реализуй BFS и DFS для обхода графа. Решить задачу: найти все связные компоненты графа. LeetCode: 547 "Number of Provinces".';
  if (lower.includes('heap') || lower.includes('priority queue'))
    return 'Практика: реализуй MinHeap с методами insert, extractMin, peek. Используй для решения задачи LeetCode 215 "Kth Largest Element in an Array".';
  if (lower.includes('segment tree') || lower.includes('fenwick'))
    return 'Практика: реализуй Fenwick Tree (Binary Indexed Tree) для задачи prefix sum. Обнови значение и получи сумму за O(log n). LeetCode: 307 "Range Sum Query".';

  if (lower.includes('масштабирование') && lower.includes('горизонтальное'))
    return 'Практика: спроектируй схему горизонтального масштабирования для твоего приложения: добавь Load Balancer, 3 инстанса API, общий Redis для сессий.';
  if (lower.includes('кэширование') && lower.includes('redis'))
    return 'Практика: реализуй cache-aside для эндпоинта GET /products/:id: сначала проверяй Redis, если нет — запрашивай БД и сохраняй с TTL 5 минут.';
  if (lower.includes('cap теорема'))
    return 'Практика: составь таблицу сравнения PostgreSQL, MongoDB, Cassandra, Redis по CAP теореме. Для каждой БД объясни какую именно пару из CA/CP/AP она обеспечивает.';
  if (lower.includes('kafka') || lower.includes('rabbitmq') && lower.includes('очереди'))
    return 'Практика: спроектируй систему обработки заказов с очередью: Kafka топик "orders", consumer group обрабатывает заказы, DLQ для неуспешных обработок.';

  if (lower.includes('asyncio изнутри') || lower.includes('event loop'))
    return 'Практика: напиши async функцию fetch_all(urls) которая загружает все URL параллельно через asyncio.gather(). Замерь время vs последовательная загрузка.';
  if (lower.includes('fastapi'))
    return 'Практика: создай FastAPI приложение с эндпоинтом GET /items и POST /items с Pydantic моделью. Добавь async операцию чтения из "базы данных" (список).';
  if (lower.includes('celery'))
    return 'Практика: создай Celery задачу send_email(to, subject, body). Запусти через `celery -A app worker`. Проверь через `delay()` что задача уходит в очередь Redis.';
  if (lower.includes('profil') && lower.includes('python'))
    return 'Практика: возьми функцию с вложенными циклами. Запусти cProfile, найди самую медленную часть. Оптимизируй через numpy операции или кэширование.';

  if (lower.includes('тест-пирамида') || lower.includes('unit, integration'))
    return 'Практика: напиши 3 теста для функции calculateDiscount(price, percent): тест на корректный результат, на отрицательный процент, на нулевую цену.';
  if (lower.includes('jest'))
    return 'Практика: напиши unit-тест для сервиса UserService.findById(). Замокируй prisma.user.findUnique(). Проверь что кидается NotFoundException если пользователь не найден.';
  if (lower.includes('моки') || lower.includes('jest.mock'))
    return 'Практика: замокируй модуль mailService в тесте. Убедись что mail.send() вызывается 1 раз с правильными аргументами при регистрации пользователя.';
  if (lower.includes('supertest'))
    return 'Практика: напиши интеграционный тест на POST /auth/register: отправь валидные данные → 201, затем те же данные повторно → 409 Conflict.';
  if (lower.includes('playwright'))
    return 'Практика: напиши E2E тест: 1) открой страницу /login, 2) введи email и пароль, 3) нажми Submit, 4) проверь что перешёл на /dashboard.';
  if (lower.includes('tdd'))
    return 'Практика: разработай функцию fizzbuzz(n) через TDD: сначала напиши тест → увидь что он падает → напиши минимальный код → рефактори. Используй цикл red-green-refactor.';

  if (lower.includes('tcp транспорт') || lower.includes('redis транспорт'))
    return 'Практика: создай 2 NestJS сервиса. Первый отправляет сообщение {cmd: "sum", data: {a, b}}. Второй получает и отвечает суммой. Используй TCP транспорт.';
  if (lower.includes('rabbitmq'))
    return 'Практика: подними RabbitMQ через Docker. Создай NestJS producer который отправляет событие order.created. Создай consumer который логирует полученное событие.';
  if (lower.includes('cqrs'))
    return 'Практика: рефактори UserService на CQRS: создай GetUserQuery и CreateUserCommand. Используй @nestjs/cqrs. Убедись что handlers разделены.';
  if (lower.includes('event sourcing'))
    return 'Практика: реализуй простой Event Store для банковского счёта: события Deposited, Withdrawn. Восстанови текущий баланс воспроизведя все события из хранилища.';
  if (lower.includes('circuit breaker') || lower.includes('retry'))
    return 'Практика: реализуй Circuit Breaker с 3 состояниями (CLOSED/OPEN/HALF_OPEN). После 5 ошибок подряд — Circuit OPEN, через 30 сек — HALF_OPEN, после успеха — CLOSED.';

  if (lower.includes('mvcc') || lower.includes('транзакц'))
    return 'Практика: открой 2 psql сессии. В первой: BEGIN; UPDATE accounts SET balance = balance - 100 WHERE id = 1; (не коммить). Во второй: проверь уровни изоляции READ COMMITTED и REPEATABLE READ.';
  if (lower.includes('партиционирование') || lower.includes('range, list'))
    return 'Практика: создай таблицу orders с RANGE партиционированием по created_at (по месяцам). Вставь данные за 3 месяца. Проверь через EXPLAIN что запросы используют partition pruning.';
  if (lower.includes('репликация') || lower.includes('primary-replica'))
    return 'Практика: настрой PostgreSQL primary-replica репликацию через Docker Compose. Проверь что записи в primary появляются в replica через несколько секунд.';
  if (lower.includes('pgbouncer'))
    return 'Практика: запусти PgBouncer + PostgreSQL через Docker Compose. Настрой pool_mode = transaction. Проверь что 1000 одновременных connection к PgBouncer создают только 10 соединений к PostgreSQL.';
  if (lower.includes('vacuum') || lower.includes('autovacuum') || lower.includes('bloat'))
    return 'Практика: выполни 100 000 UPDATE на таблице. Запусти VACUUM ANALYZE. Сравни размер таблицы до и после через pg_size_pretty(pg_total_relation_size(\'table\')).';

  if (lower.includes('монорепо') || lower.includes('turborepo'))
    return 'Практика: создай монорепо с Turborepo: пакеты /apps/web (Next.js) и /packages/ui (shared компоненты). Настрой pipeline чтобы ui собирался перед web.';
  if (lower.includes('edge runtime'))
    return 'Практика: создай Edge Route Handler который парсит JWT из cookie и добавляет userId в заголовок запроса. Убедись что не используешь API недоступные в Edge Runtime.';
  if (lower.includes('on-demand isr') || lower.includes('revalidate'))
    return 'Практика: добавь revalidatePath("/products") в server action после сохранения продукта. Проверь что страница обновилась без перезапуска сервера.';
  if (lower.includes('core web vitals') || lower.includes('lcp'))
    return 'Практика: запусти Lighthouse аудит своей страницы. Найди причины плохого LCP (обычно большой hero image). Добавь priority на next/image. Повтори аудит.';

  if (lower.includes('sql injection'))
    return 'Практика: создай уязвимый эндпоинт с raw SQL string concatenation. Эксплуатируй его через URL: `\' OR 1=1--`. Затем исправь через параметризованный запрос.';
  if (lower.includes('xss'))
    return 'Практика: создай форму без санитизации ввода. Введи <script>alert(document.cookie)</script>. Исправь через textContent вместо innerHTML и Content-Security-Policy заголовок.';
  if (lower.includes('csrf'))
    return 'Практика: изучи CSRF атаку: создай внешнюю HTML страницу с формой которая делает POST на твой API. Защити API добавив CSRF токен через double submit cookie паттерн.';
  if (lower.includes('ssrf'))
    return 'Практика: создай эндпоинт POST /fetch-url который делает HTTP запрос по переданному URL. Попробуй fetch внутренних адресов (http://localhost/admin). Добавь whitelist разрешённых доменов.';
  if (lower.includes('jwt атак') || lower.includes('alg:none'))
    return 'Практика: используя jwt.io, создай токен без подписи (alg: none). Попробуй отправить его на уязвимый сервер. Убедись что твой NestJS Guard отклоняет такие токены.';
  if (lower.includes('rate limiting') || lower.includes('brute force'))
    return 'Практика: добавь throttler guard в NestJS: максимум 5 запросов в 60 секунд для /auth/login. Напиши скрипт который делает 10 запросов подряд и убедись что 6-й получает 429.';
  if (lower.includes('пентест') || lower.includes('burp suite'))
    return 'Практика: скачай OWASP WebGoat (docker run -p 8080:8080 webgoat/goat-and-wolf). Реши 3 задания категории Injection через Burp Suite.';

  if (lower.includes('структурированное логирование') || lower.includes('winston'))
    return 'Практика: настрой Winston логер в NestJS выводящий JSON с полями: level, message, timestamp, requestId, userId. Добавь Morgan middleware для HTTP запросов.';
  if (lower.includes('elk') || lower.includes('elasticsearch'))
    return 'Практика: подними ELK стек через Docker Compose. Настрой Filebeat для сбора логов из /var/log/app/*.log. Создай Index Pattern в Kibana и найди все ERROR записи.';
  if (lower.includes('prometheus') && lower.includes('метрик'))
    return 'Практика: добавь endpoint /metrics в NestJS приложение через prom-client. Создай кастомный counter http_requests_total с лейблами method и route. Проверь в Prometheus UI.';
  if (lower.includes('grafana'))
    return 'Практика: подключи Grafana к Prometheus. Создай dashboard с 3 панелями: RPS (requests per second), Error Rate (%), P99 Latency. Настрой алерт при error rate > 5%.';
  if (lower.includes('jaeger') || lower.includes('трейсинг'))
    return 'Практика: добавь OpenTelemetry трейсинг в NestJS. Запусти Jaeger через Docker. Посмотри трейс HTTP запроса который затрагивает DB и внешний API. Найди самую медленную операцию.';

  if (lower.includes('нативные модули') && lower.includes('kotlin'))
    return 'Практика: создай нативный Android модуль DeviceInfo который возвращает модель устройства и версию Android. Вызови его из React Native через NativeModules.DeviceInfo.getModel().';
  if (lower.includes('нативные модули') && lower.includes('swift'))
    return 'Практика: создай нативный iOS модуль Haptic который вызывает haptic feedback. Используй UIImpactFeedbackGenerator. Вызови из React Native.';
  if (lower.includes('reanimated'))
    return 'Практика: создай анимацию карточки которая: 1) увеличивается при нажатии через withSpring(), 2) уходит за экран при свайпе влево через useAnimatedGestureHandler.';
  if (lower.includes('публикация в google play'))
    return 'Практика: создай production APK: gradle assembleRelease, подпиши через keystore файл. Убедись что output файл правильно подписан через `jarsigner -verify app-release.apk`.';
  if (lower.includes('fastlane'))
    return 'Практика: настрой Fastlane Fastfile с lane :beta который: увеличивает build number, запускает тесты, создаёт APK, загружает в Firebase App Distribution.';

  if (lower.includes('резолвер') || lower.includes('query, mutation'))
    return 'Практика: создай GraphQL схему для сущности Post (id, title, body). Реализуй Query {posts, post(id)} и Mutation {createPost, deletePost(id)}. Протестируй через GraphQL Playground.';
  if (lower.includes('n+1') || lower.includes('dataloader'))
    return 'Практика: создай запрос который получает posts с авторами. Посмотри сколько SQL запросов выполняется (N+1). Реализуй DataLoader для батчинга запросов к user.';
  if (lower.includes('apollo client'))
    return 'Практика: добавь Apollo Client в Next.js. Замени fetch запрос к /api/products на useQuery(GET_PRODUCTS). Добавь InMemoryCache. Используй optimistic UI для мутации создания.';
  if (lower.includes('federation') || lower.includes('объединение микросервис'))
    return 'Практика: создай 2 GraphQL субграфа: Users и Products. Настрой Apollo Federation Gateway который объединяет их. Напиши запрос к gateway который получает user с его products.';

  if (lower.includes('нумпy') || lower.includes('numpy') || lower.includes('broadcasting'))
    return 'Практика: создай матрицу 3x3 через numpy. Выполни: транспонирование, умножение матриц, нахождение обратной матрицы, вычисление определителя. Сравни скорость с чистым Python через timeit.';
  if (lower.includes('pandas') && lower.includes('dataframe'))
    return 'Практика: загрузи CSV файл через pandas. Выполни: head()/info()/describe(). Выбери строки где column > значение. Добавь новую колонку. Сохрани результат в новый CSV.';
  if (lower.includes('группировка') || lower.includes('groupby'))
    return 'Практика: в датасете продаж сгруппируй по категории товара. Для каждой группы посчитай: sum продаж, mean продаж, count транзакций, max продажи. Отсортируй по sum descending.';

  if (lower.includes('websocket vs http'))
    return 'Практика: создай простой HTTP Long Polling и WebSocket, оба показывают текущее время в реальном времени. Сравни в DevTools Network tab: количество запросов и latency.';
  if (lower.includes('socket.io') || lower.includes('emit и on'))
    return 'Практика: создай простой broadcast: клиент отправляет emit("message", text), сервер делает io.emit("message", text) всем. Открой 3 вкладки и убедись что все получают сообщения.';
  if (lower.includes('комнаты') || lower.includes('rooms'))
    return 'Практика: реализуй комнаты в Socket.io. При подключении клиент передаёт roomId. Сообщения доходят только до участников той же комнаты через socket.to(roomId).emit().';
  if (lower.includes('nestjs gateway') || lower.includes('websocketgateway'))
    return 'Практика: создай NestJS @WebSocketGateway(). Обработай @SubscribeMessage("message"). Внедри JwtService для аутентификации соединений через handleConnection() хук.';

  if (lower.includes('flexbox') || lower.includes('grid') && lower.includes('tailwind'))
    return 'Практика: сверстай dashboard layout через Tailwind Grid: sidebar слева (w-64), main content справа (flex-1), header сверху (col-span-full). Адаптируй для мобайла через md: брейкпойнт.';
  if (lower.includes('responsive') || lower.includes('sm, md, lg'))
    return 'Практика: создай карточку которая на мобайле (< sm) занимает весь экран, на планшете (md) — 50%, на десктопе (lg) — 33%. Используй только Tailwind классы.';
  if (lower.includes('dark mode'))
    return 'Практика: добавь dark mode в Next.js + Tailwind. При переключении темы сохраняй выбор в localStorage. Добавь smooth transition для смены темы через transition-colors.';

  if (lower.includes('что такое html') || lower.includes('html и как работает'))
    return 'Практика: создай HTML страницу с правильной структурой: <!DOCTYPE html>, <head> с мета-тегами, <header>, <main>, <footer>. Открой DevTools и изучи DOM дерево.';
  if (lower.includes('основные теги') || lower.includes('заголовки, параграфы'))
    return 'Практика: создай страницу резюме: заголовок с именем (h1), секции Опыт/Образование/Навыки (h2), элементы в списках (ul/li), ссылки (a href).';
  if (lower.includes('что такое css') || lower.includes('подключение'))
    return 'Практика: создай внешний файл styles.css. Добавь стили для body (font-family, background), h1 (color, font-size), .container (max-width, margin: auto).';
  if (lower.includes('селекторы') || lower.includes('цвет') || lower.includes('шрифт'))
    return 'Практика: используй все виды селекторов: тег (p), класс (.card), ID (#header), дочерний (.card > p), псевдокласс (a:hover), псевдоэлемент (p::first-line).';
  if (lower.includes('блочная модель') || lower.includes('box model'))
    return 'Практика: создай div с padding: 20px, border: 2px solid, margin: 10px. Открой DevTools → вкладка Box Model. Проверь разницу box-sizing: content-box vs border-box.';

  if (lower.includes('переменные') && lower.includes('var, let, const'))
    return 'Практика: создай 5 примеров где var/let/const ведут себя по-разному: hoisting, block scope, temporal dead zone. Объясни в комментариях каждый случай.';
  if (lower.includes('условия') || lower.includes('if/else'))
    return 'Практика: напиши функцию getGrade(score) которая возвращает "A" (≥90), "B" (≥80), "C" (≥70), "D" (≥60), "F" (<60). Напиши через if/else и через switch.';
  if (lower.includes('циклы') && lower.includes('for'))
    return 'Практика: используй for, while, for...of для обхода массива [1,2,3,4,5]. Для каждого элемента: выведи квадрат числа. Найди сумму всех элементов.';
  if (lower.includes('функции') || lower.includes('стрелочные'))
    return 'Практика: создай функцию add(a, b) тремя способами: function declaration, function expression, arrow function. Сравни поведение this внутри каждой.';
  if (lower.includes('массивы') || lower.includes('методы массивов'))
    return 'Практика: дан массив names = ["Alice", "Bob", "Charlie", "Anna"]. Используй: filter (имена на "A"), map (добавь "!" в конец), reduce (склей в строку через запятую), sort (по алфавиту).';
  if (lower.includes('dom') || lower.includes('работа с dom'))
    return 'Практика: создай список задач (Todo): input + кнопка "Добавить". По клику добавь li в ul через createElement и appendChild. Добавь кнопку удаления на каждый элемент.';

  if (lower.includes('установка python') || lower.includes('первая программа'))
    return 'Практика: установи Python 3. Напиши скрипт calculator.py который принимает 2 числа и операцию (+,-,*,/) через input() и выводит результат. Запусти из терминала.';
  if (lower.includes('условные операторы') || lower.includes('if/elif'))
    return 'Практика: напиши функцию bmi_category(weight, height) которая вычисляет BMI и возвращает категорию через if/elif/else: "Underweight", "Normal", "Overweight", "Obese".';
  if (lower.includes('функции') && lower.includes('def'))
    return 'Практика: напиши функцию fibonacci(n) которая возвращает список первых n чисел Фибоначчи. Затем напиши factorial(n). Добавь обработку исключений для отрицательных n.';

  if (lower.includes('git') || lower.includes('github') && lower.includes('нуля'))
    return 'Практика: 1) git init в новом проекте, 2) создай 3 файла, 3) git add ., 4) git commit -m "initial commit", 5) создай репозиторий на GitHub, 6) git remote add origin + git push.';
  if (lower.includes('ветки') || lower.includes('branch') || lower.includes('merge'))
    return 'Практика: создай ветку feature/login, добавь 2 коммита, переключись на main, создай feature/register с конфликтующим изменением, смержи обе ветки и разреши конфликт.';

  if (lower.includes('принципы rest') || lower.includes('ресурсы, глаголы'))
    return 'Практика: спроектируй REST API для блога. Определи ресурсы: posts, comments, users. Для каждого ресурса опиши CRUD эндпоинты с правильными HTTP методами и статусами.';
  if (lower.includes('http статус коды'))
    return 'Практика: создай таблицу: 200 OK, 201 Created, 204 No Content, 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 409 Conflict, 422 Unprocessable Entity, 500 Internal Error. Для каждого — пример сценария.';
  if (lower.includes('пагинац'))
    return 'Практика: реализуй cursor-based пагинацию GET /posts?cursor=ID&limit=10. Укажи в ответе {data, nextCursor, hasMore}. Сравни с offset пагинацией: когда какую использовать.';

  if (lower.includes('установка') && lower.includes('expo'))
    return 'Практика: создай новый Expo проект через `npx create-expo-app MyApp`. Запусти на Android Emulator или через Expo Go. Измени текст в App.tsx и убедись что изменение обновляется в реальном времени (hot reload).';

  // Generic fallback
  const cleanTitle = title.replace(/^(Видеоурок:|Видео:|Урок:)\s*/i, '').trim();
  return `Практика по теме "${cleanTitle}": изучи материал видеоурока и реализуй небольшой проект или код-снипет демонстрирующий ключевые концепции. Поэкспериментируй с примерами из урока в своей IDE.`;
}

async function main() {
  console.log('Обновление уроков: добавляем YouTube URL и практические задания...');

  const lessons = await prisma.lesson.findMany({
    orderBy: { order: 'asc' },
  });

  let updatedVideo = 0;
  let skippedNonVideo = 0;

  for (const lesson of lessons) {
    const isVideo = lesson.content.startsWith('Видеоурок:');

    if (!isVideo) {
      skippedNonVideo++;
      continue;
    }

    const videoUrl = getVideoUrl(lesson.title);
    const assignment = generateAssignment(lesson.title);

    await prisma.lesson.update({
      where: { id: lesson.id },
      data: { videoUrl, assignment },
    });

    updatedVideo++;
  }

  console.log(`✓ Обновлено VIDEO уроков: ${updatedVideo}`);
  console.log(`  Пропущено (квизы/задания/чтение): ${skippedNonVideo}`);
  console.log('Готово!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
