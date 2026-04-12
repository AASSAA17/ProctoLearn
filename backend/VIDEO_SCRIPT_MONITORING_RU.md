# Бейне сценарий: ProctoLearn үшін DevOps Monitoring

## Формат
- Тіл: қазақша
- Ұзақтығы: 7-10 минут
- Мақсат: Telegram хабарламаларымен толық жұмыс істейтін monitoring жүйесін көрсету

## Алдын ала ашып қою керек
- PowerShell
- http://localhost:3001 (Frontend)
- http://localhost:4000/health
- http://localhost:4000/metrics
- http://localhost:9090/targets (Prometheus)
- http://localhost:3000 (Grafana)
- http://localhost:9093/#/alerts (Alertmanager)
- http://localhost:8081/containers/ (cAdvisor)
- http://localhost:9115/metrics (Blackbox)
- http://localhost:9002 (Portainer)
- Telegram бот чаты

---

## 1-көрініс: Кіріспе (0:00 - 0:40)
### Не көрсету керек
- VS Code-та жоба құрылымын қысқаша көрсету
- Құжаттама файлын ашу

### Не айту керек
"Бұл видеода мен Windows ортасында ProctoLearn жобасына monitoring жүйесін көрсетемін.
Стек құрамында Prometheus, Grafana, Node Exporter, Nginx Exporter, cAdvisor, Blackbox Exporter, Alertmanager, Portainer және Telegram-бот бар.
Негізгі мақсат: метрикаларды жинау, визуализация, alert және Telegram хабарламалары." 

---

## 2-көрініс: Контейнерлер және сервистер (0:40 - 1:40)
### Не көрсету керек
- PowerShell ішінде орындау:

```powershell
docker compose -f C:\Users\Arsen\ProctoLearn\docker-compose.dev.yml ps
docker compose -f C:\Users\Arsen\ProctoLearn\monitoring-project\docker-compose.yml ps
```

### Не айту керек
"Қазір екі стек те іске қосылғанын көрсетемін: негізгі ProctoLearn және monitoring-project.
API, frontend және база жұмыс істеп тұр.
Monitoring сервистері де іске қосылған: Prometheus, Grafana, Alertmanager, cAdvisor, Blackbox, Portainer және Telegram-бот." 

---

## 3-көрініс: Метрикалар қолжетімді (1:40 - 3:00)
### Не көрсету керек
1. http://localhost:4000/metrics
2. http://localhost:9100/metrics
3. http://localhost:9115/metrics
4. http://localhost:8081/containers/

### Не айту керек
"Мұнда метрикалар нақты беріліп тұрғанын көруге болады:
API process-метрикаларды береді, Node Exporter жүйелік метрикаларды береді,
Blackbox endpoint-тарды тексереді, cAdvisor контейнер ресурстарын көрсетеді.
Яғни дереккөздер Prometheus-ке дайын." 

---

## 4-көрініс: Prometheus Targets (3:00 - 4:00)
### Не көрсету керек
- http://localhost:9090/targets
- Немесе PowerShell:

```powershell
$raw = docker exec prometheus wget -qO- http://localhost:9090/api/v1/targets
$obj = $raw | ConvertFrom-Json
$obj.data.activeTargets | Select-Object scrapeUrl, health | Format-Table -AutoSize
```

### Не айту керек
"Prometheus ішінде негізгі target-тардың барлығы up күйінде:
prometheus, node_exporter, nginx_exporter, proctolearn_api, cadvisor және blackbox.
Бұл барлық компоненттен метрика дұрыс жиналып жатқанын дәлелдейді." 

---

## 5-көрініс: Grafana дашборды (4:00 - 5:00)
### Не көрсету керек
- http://localhost:3000
- Логин: admin / admin123
- Dashboard ID 1860

### Не айту керек
"Grafana-да Prometheus datasource қосылған.
1860 дашборды CPU, RAM, Disk және басқа метрикаларды нақты уақытта көрсетеді.
Бұл сервер жүктемесін визуалды бақылауға мүмкіндік береді." 

---

## 6-көрініс: Alertmanager және тест алерт (5:00 - 6:30)
### Не көрсету керек
- PowerShell-де тест алерт жіберу:

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

- Кейін http://localhost:9093/#/alerts ашу

### Не айту керек
"Қазір Alertmanager-ге v2 API арқылы тест алертті қолмен жіберемін.
Жібергеннен кейін алерт Alertmanager интерфейсінде active болып көрінеді.
Бұл route және receiver дұрыс бапталғанын көрсетеді." 

---

## 7-көрініс: Telegram-бот және әдемі шығу (6:30 - 8:30)
### Не көрсету керек
- Telegram бот чатын ашу
- Командаларды орындау:
  - /start
  - /status
  - /graph
  - /containers
- Alertmanager-ден келген хабарламаны көрсету

### Не айту керек
"Енді Telegram интеграциясын көрсетемін.
Бот статус, график және контейнерлер туралы командаларды қолдайды.
Сонымен бірге Alertmanager-ден алерт хабарламасы автоматты түрде чатқа келеді.
Бұл толық end-to-end тексеріс: метрикадан бастап Telegram хабарламаға дейін." 

---

## 8-көрініс: Portainer (8:30 - 9:00)
### Не көрсету керек
- http://localhost:9002
- Контейнерлер тізімі және статусы

### Не айту керек
"Контейнерлерді ыңғайлы басқару үшін Portainer қосылды.
Осы жерден контейнер статусы, логтары және қайта іске қосу әрекеттерін визуалды түрде бақылауға болады." 

---

## 9-көрініс: Қорытынды (9:00 - 9:40)
### Не көрсету керек
- Қысқаша қайта: Targets, Grafana, Telegram

### Не айту керек
"Қорытынды: ProctoLearn жобасы үшін monitoring жүйесі толық жұмыс істейді.
Метрикалар жиналады, визуализация бар, алерттер іске қосылады, Telegram хабарламалар келеді.
Шешім демонстрацияға және production-та кеңейтуге дайын." 

---

## Видеомен бірге тапсыратын материалдар
- Prometheus Targets скриншоты (бәрі up)
- Grafana dashboard скриншоты
- Alertmanager-де active alert скриншоты
- Telegram хабарламасының скриншоты
- Құжаттама: DEVOPS_MONITORING_WINDOWS_FULL.md
