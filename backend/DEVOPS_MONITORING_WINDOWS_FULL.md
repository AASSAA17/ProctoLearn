# DevOps Monitoring (Windows) for ProctoLearn

## 1) Windows алдын ала дайындық

### 1.1 Docker Desktop
1. https://www.docker.com/products/docker-desktop/ сайтына кіріңіз.
2. Download for Windows таңдаңыз.
3. Installer файлын іске қосыңыз.
4. `Use WSL 2 instead of Hyper-V` таңдаңыз.
5. Орнатудан кейін Windows-ты қайта іске қосыңыз.
6. Docker Desktop ашылып, system tray ішінде жасыл күйде тұрғанын тексеріңіз.

### 1.2 WSL2 тексеру
PowerShell (Administrator) ішінде:

```powershell
wsl --install
wsl --set-default-version 2
wsl --status
docker --version
docker compose version
```

## 2) Жобаға байланыс (ProctoLearn integration)

Бұл репода monitoring конфигі `monitoring-project` ішінде.

Қосылған байланыстар:
- `proctolearn_api` scrape target: `host.docker.internal:4000`
- Backend ішінде `/metrics` endpoint қосылды.
- Nginx үшін `stub_status` endpoint қосылды (`listen 8080`).

Өзгертілген файлдар:
- `monitoring-project/docker-compose.yml`
- `monitoring-project/prometheus/prometheus.yml`
- `monitoring-project/prometheus/alert.rules.yml`
- `monitoring-project/alertmanager/alertmanager.yml`
- `monitoring-project/nginx/nginx.conf`
- `backend/src/main.ts`
- `backend/package.json`
- `nginx/proctolearn.conf`

## 3) Monitoring стек файлдары

### 3.1 Telegram placeholders
`monitoring-project/alertmanager/alertmanager.yml` ішінде:
- `bot_token: "PUT_YOUR_BOT_TOKEN_HERE"`
- `chat_id: 123456789`

Өз токеніңіз бен chat id енгізіңіз.

## 4) Іске қосу (Step-by-step)

### 4.1 Backend-ке metrics тәуелділігін орнату

```powershell
cd C:\Users\Arsen\ProctoLearn\backend
npm install
```

### 4.2 ProctoLearn сервисін іске қосу

```powershell
cd C:\Users\Arsen\ProctoLearn
docker compose up -d
```

Тексеру:

```powershell
curl http://localhost:4000/health
curl http://localhost:4000/metrics
```

### 4.3 Monitoring стекін іске қосу

```powershell
cd C:\Users\Arsen\ProctoLearn\monitoring-project
docker compose up -d
docker compose ps
```

Логтар:

```powershell
docker compose logs -f prometheus
docker compose logs -f grafana
docker compose logs -f alertmanager
```

## 5) UI тексеру

- Prometheus: http://localhost:9090
- Alertmanager: http://localhost:9093
- Grafana: http://localhost:3000 (`admin` / `admin123`)
- Portainer: http://localhost:9002
- cAdvisor: http://localhost:8081/containers/
- Blackbox Exporter metrics: http://localhost:9115/metrics
- ProctoLearn Frontend (dev): http://localhost:3001
- ProctoLearn API: http://localhost:4000
- Node Exporter metrics: http://localhost:9100/metrics
- Nginx Exporter metrics: http://localhost:9113/metrics

Prometheus -> Status -> Targets ішінде барлығы `UP` болу керек.

Ескерту (dev орта):
- `docker-compose.dev.yml` ішінде PostgreSQL host порты `5433:5432` болып тұр.
- Frontend host порты `3001:3000` болып тұр (Grafana 3000 портын қолданады).
- Portainer host порты `9002:9000` болып тұр (MinIO 9000 портын қолданады).

## 6) Telegram Monitor Bot (скриндегідей)

Telegram бот контейнері қосылды: `monitoring_telegram_bot`.

Командалар:
- `/start` — меню
- `/status` — әдемі status report (CPU/RAM/DISK + health)
- `/graph` — CPU графигі
- `/containers` — Prometheus targets күйі

Боттан команда менюі көріну үшін чатта бір рет `/start` жіберіңіз.

## 7) Grafana dashboard орнату

1. Grafana -> Dashboards -> Import.
2. Dashboard ID: `1860`.
3. Data source: `Prometheus`.
4. Import.

## 8) Telegram Bot token/chat id алу

### 7.1 Token
1. Telegram ішінен `@BotFather` ашыңыз.
2. `/newbot` жіберіңіз.
3. Bot name, сосын username беріңіз.
4. BotFather берген token-ді көшіріп алыңыз.

### 7.2 Chat ID (жеке чат)
1. Жаңа ботқа кез келген хабарлама жіберіңіз.
2. PowerShell:

```powershell
$token = "PASTE_YOUR_BOT_TOKEN"
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getUpdates"
```

3. Нәтижеден `message.chat.id` мәнін алыңыз.

### 7.3 Chat ID (топ)
1. Ботты топқа қосыңыз.
2. Топқа хабарлама жіберіңіз.
3. Жоғарыдағы `getUpdates` сұрауын қайта орындаңыз.
4. `chat.id` (әдетте теріс сан) мәнін алыңыз.

## 9) Telegram alert тесті

```powershell
$start = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$end = (Get-Date).ToUniversalTime().AddMinutes(5).ToString("yyyy-MM-ddTHH:mm:ssZ")

$json = @"
[
  {
    "labels": { "alertname": "TestAlert", "severity": "warning" },
    "annotations": { "summary": "Бұл тест хабарламасы", "description": "Жүйе жұмыс істеп тұр!" },
    "startsAt": "$start",
    "endsAt": "$end"
  }
]
"@

$tmp = Join-Path $env:TEMP "alert-test.json"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($tmp, $json, $utf8NoBom)

curl.exe -X POST "http://localhost:9093/api/v2/alerts" -H "Content-Type: application/json" --data-binary "@$tmp"
```

## 10) Күнделікті пайдалы командалар

```powershell
cd C:\Users\Arsen\ProctoLearn\monitoring-project

# Тоқтату
docker compose down

# Рестарт
docker compose restart

# Барлық логтар
docker compose logs -f

# Контейнер статусы
docker compose ps

# Конфиг өзгерсе қайта құру
docker compose up -d --force-recreate
```

## 11) AI агентке дайын промт (толық автоматтандыру)

```text
Сен — тәжірибелі DevOps инженерісің.

ТАПСЫРМА:
Windows-та ProctoLearn жобасына мониторинг стек орнат:
Docker Desktop + Prometheus + Grafana + Node Exporter + Nginx + Nginx Exporter + Alertmanager + Telegram Alerts.

ЖОБА ЖОЛЫ:
C:\Users\Arsen\ProctoLearn
Monitoring compose: C:\Users\Arsen\ProctoLearn\monitoring-project

МІНДЕТТІ ФАЙЛДАР:
- monitoring-project/docker-compose.yml
- monitoring-project/prometheus/prometheus.yml
- monitoring-project/prometheus/alert.rules.yml
- monitoring-project/alertmanager/alertmanager.yml
- monitoring-project/nginx/nginx.conf

ИНТЕГРАЦИЯ ТАЛАБЫ:
- Backend metrics endpoint: /metrics (port 4000)
- Prometheus proctolearn_api target: host.docker.internal:4000
- Негізгі nginx конфигінде stub_status endpoint (listen 8080, /stub_status)

ALERT ТАЛАПТАРЫ:
- CPU > 85%
- RAM > 80%
- Disk < 15%
- Service down (up == 0)
- Хабар қазақ тілінде
- bot_token және chat_id placeholder болып қалсын

ПОРТТАР:
- Prometheus 9090
- Grafana 3000 (admin/admin123)
- Node Exporter 9100
- Nginx 80 және 8080
- Nginx Exporter 9113
- Alertmanager 9093

ҚОСЫМША:
- monitoring network
- persistent volumes
- restart: unless-stopped
- scrape interval: 15s

ШЫҒАРУ ФОРМАТЫ:
1) Жасалған файлдардың толық content-і
2) PowerShell командалары (іске қосу, тексеру)
3) Grafana Dashboard ID 1860 орнату қадамдары
4) Telegram Bot token/chat id алу нұсқаулығы
5) Alert тест командасы

Жауап тек ҚАЗАҚША болсын.
```

## 12) Telegram bot setup-қа арналған қысқа промт

```text
Маған Telegram Monitoring Bot жасауға көмектес.

Мақсат: Alertmanager арқылы Telegram хабарламалары келуі керек.
Windows PowerShell арқылы нақты қадамдар бер:
1) @BotFather арқылы бот ашу
2) Bot token алу
3) Chat ID табу (жеке чат және топ)
4) Token/chat id-ді alertmanager.yml-ге жазу
5) Тест хабарлама жіберу командасы

Қажет жерлерде қандай экранды тексеру керегін айт.
```

## 13) Видеоға нақты не көрсету керек

1. Контейнерлер статусы (екеуі де):

```powershell
docker compose -f C:\Users\Arsen\ProctoLearn\docker-compose.dev.yml ps
docker compose -f C:\Users\Arsen\ProctoLearn\monitoring-project\docker-compose.yml ps
```

2. Prometheus targets:
- http://localhost:9090/targets
- Барлық target `UP` екенін көрсетіңіз.

3. ProctoLearn metrics:
- http://localhost:4000/metrics

4. Grafana dashboard:
- http://localhost:3000
- Dashboard ID `1860` импортталғанын көрсетіңіз.

5. Alertmanager UI:
- http://localhost:9093/#/alerts
- `TestAlert` немесе `DemoAlert` көрінгенін көрсетіңіз.

6. Telegram хабарламасы:
- Бот чатын ашып, келген alert хабарламасын көрсетіңіз.

## 14) Telegram келмесе жедел тексеру

1. Бот чатында `Start` басылғанын тексеріңіз.
2. `monitoring-project/alertmanager/alertmanager.yml` ішінде `bot_token` және `chat_id` дұрыс екенін тексеріңіз.
3. Alertmanager-ді қайта жүктеңіз:

```powershell
docker compose -f C:\Users\Arsen\ProctoLearn\monitoring-project\docker-compose.yml up -d alertmanager
```

4. Тікелей Telegram API тест (ботқа бірден хабар жібереді):

```powershell
$cfg = Get-Content C:\Users\Arsen\ProctoLearn\monitoring-project\alertmanager\alertmanager.yml -Raw
$token = ([regex]::Match($cfg, 'bot_token:\s*"([^"]+)"')).Groups[1].Value
$chat = ([regex]::Match($cfg, 'chat_id:\s*(\d+)')).Groups[1].Value
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/sendMessage" -Method POST -ContentType "application/json" -Body (@{ chat_id = $chat; text = "ProctoLearn monitoring test" } | ConvertTo-Json)
```

## 15) Кириллица дұрыс көрінуі үшін (UTF-8)

PowerShell терезесінде мына командаларды бір рет орындаңыз:

```powershell
chcp 65001
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Text.UTF8Encoding]::new($false)
```

Егер JSON файл жасап API-ге жіберсеңіз, міндетті түрде UTF-8 without BOM қолданыңыз:

```powershell
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($tmp, $json, $utf8NoBom)
```

Бұл баптаулардан кейін Telegram және PowerShell ішінде кириллица/қазақша мәтін бұзылмай көрсетіледі.
