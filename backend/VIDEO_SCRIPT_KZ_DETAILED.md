# ProctoLearn Monitoring: Толық нақты видео сценарий (қазақша)

## 0) Видео басталарға дейін дайындық

### 0.1 Ашық тұратын беттер
1. http://localhost:3001
2. http://localhost:4000/health
3. http://localhost:4000/metrics
4. http://localhost:9090/targets
5. http://localhost:3000
6. http://localhost:9093/#/alerts
7. http://localhost:8081/containers/
8. http://localhost:9115/metrics
9. http://localhost:9002
10. Telegram бот чаты

### 0.2 PowerShell-да дайындап қоятын командалар
```powershell
docker compose -f C:\Users\Arsen\ProctoLearn\docker-compose.dev.yml ps
docker compose -f C:\Users\Arsen\ProctoLearn\monitoring-project\docker-compose.yml ps
```

---

## 1) Кіріспе (0:00 - 0:40)

### Экранда не ашық
- VS Code жобасы
- monitoring-project бумасы

### Айтатын мәтін
"Сәлеметсіздер ме. Бұл видеода ProctoLearn жобасына орнатылған DevOps monitoring жүйесін көрсетемін.
Бізде толық стек жұмыс істеп тұр: Prometheus, Grafana, Node Exporter, Nginx Exporter, Alertmanager, cAdvisor, Blackbox Exporter, Portainer және Telegram бот.
Мақсат - метрикаларды жинау, визуализация жасау, алерттерді көру және Telegram-ға хабарлама алу."

---

## 2) Контейнерлер статусы (0:40 - 1:30)

### Экранда не істеу керек
PowerShell-да:
```powershell
docker compose -f C:\Users\Arsen\ProctoLearn\docker-compose.dev.yml ps
docker compose -f C:\Users\Arsen\ProctoLearn\monitoring-project\docker-compose.yml ps
```

### Айтатын мәтін
"Қазір екі compose стек те жұмыс істеп тұрғанын көрсетемін.
Біріншісі - негізгі ProctoLearn сервисі.
Екіншісі - monitoring сервисі.
Көріп тұрғандарыңыздай, контейнерлердің бәрі up күйінде."

---

## 3) Негізгі қосымша жұмысын тексеру (1:30 - 2:20)

### 1-сайт
http://localhost:3001

### Айтатын мәтін
"Бұл ProctoLearn frontend. Яғни қолданба бөлігі қолжетімді."

### 2-сайт
http://localhost:4000/health

### Айтатын мәтін
"Бұл backend health endpoint. status ok қайтарып тұр, демек API сау."

### 3-сайт
http://localhost:4000/metrics

### Айтатын мәтін
"Бұл backend-тің Prometheus метрикалары. Процесске қатысты барлық метрика осы жерден жиналады."

---

## 4) Exporter-лерді көрсету (2:20 - 3:30)

### 1-сайт
http://localhost:9100/metrics

### Айтатын мәтін
"Мұнда Node Exporter жүйелік метрикаларды береді: CPU, RAM, disk, network."

### 2-сайт
http://localhost:9115/metrics

### Айтатын мәтін
"Бұл Blackbox Exporter. Ол endpoint-тердің қолжетімділігін probe жасайды."

### 3-сайт
http://localhost:8081/containers/

### Айтатын мәтін
"Бұл cAdvisor. Контейнерлердің CPU, memory сияқты ресурстарын нақты уақытта көрсетеді."

---

## 5) Prometheus Targets (3:30 - 4:30)

### Сайт
http://localhost:9090/targets

### Айтатын мәтін
"Бұл Prometheus targets беті.
Мұнда барлық маңызды таргеттер up күйінде:
prometheus, node_exporter, nginx_exporter, proctolearn_api, cadvisor, blackbox.
Бұл monitoring pipeline толық жұмыс істеп тұрғанын дәлелдейді."

---

## 6) Grafana визуализациясы (4:30 - 5:30)

### Сайт
http://localhost:3000

### Айтатын мәтін
"Бұл Grafana. Логин: admin, пароль: admin123.
Datasource ретінде Prometheus қосылған.
Дашборд ID 1860 арқылы CPU, RAM, Disk көрсеткіштерін көріп отырмыз.
Яғни мониторинг деректері визуалды түрде де дұрыс шығып тұр."

---

## 7) Alertmanager алерті (5:30 - 6:50)

### Алдымен PowerShell-да жіберу
```powershell
$start = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$end = (Get-Date).ToUniversalTime().AddMinutes(5).ToString("yyyy-MM-ddTHH:mm:ssZ")

$json = @"
[
  {
    "labels": { "alertname": "TestAlert", "severity": "warning" },
    "annotations": { "summary": "Видео-тест", "description": "Alertmanager -> Telegram" },
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

### Кейін сайт ашу
http://localhost:9093/#/alerts

### Айтатын мәтін
"Қазір Alertmanager-ге тест алерт жібердім.
Енді alerts бөлімінде TestAlert active күйінде көрініп тұр.
Демек alert маршруты дұрыс жұмыс істеп тұр."

---

## 8) Telegram бот (6:50 - 8:20)

### Экранда не істеу керек
Telegram чатында ретімен:
1. /start
2. /status
3. /graph
4. /containers

### Айтатын мәтін
"Енді Telegram ботты көрсетемін.
/start командасы арқылы бот менюін ашамыз.
/status жалпы жағдайды әдемі форматта береді.
/graph CPU графигін жібереді.
/containers сервис/targets күйін көрсетеді.
Сонымен қатар Alertmanager-ден келген тест хабарлама да чатқа келіп тұр.
Бұл толық end-to-end жұмысын дәлелдейді."

---

## 9) Portainer (8:20 - 9:00)

### Сайт
http://localhost:9002

### Айтатын мәтін
"Бұл Portainer.
Мұнда контейнерлердің күйін, логтарын, restart сияқты әрекеттерін ыңғайлы басқаруға болады.
Яғни операциялық бақылау үшін қосымша ыңғайлы интерфейс бар."

---

## 10) Қорытынды (9:00 - 9:40)

### Экранда тез қайталау
1. http://localhost:9090/targets
2. http://localhost:3000
3. Telegram чат

### Айтатын мәтін
"Қорытындылай келе, ProctoLearn жобасына monitoring жүйесі толық орнатылды.
Метрикалар жиналады, Grafana-да визуализация бар, Alertmanager алерттерді өңдейді,
және Telegram-ға хабарламалар сәтті келеді.
Жүйе демонстрацияға да, әрі қарай production-ға бейімдеуге де дайын."

---

## 11) Видеомен бірге тапсыратын материалдар
1. Prometheus Targets скриншоты (бәрі up)
2. Grafana dashboard скриншоты
3. Alertmanager active alert скриншоты
4. Telegram хабарламасы скриншоты
5. Құжаттама: DEVOPS_MONITORING_WINDOWS_FULL.md
