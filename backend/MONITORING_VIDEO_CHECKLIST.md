# Monitoring Video Checklist (ProctoLearn)

## 1) Video goal
Показать, что monitoring стек работает end-to-end:
- метрики собираются;
- алерты срабатывают;
- Telegram уведомления приходят;
- ваш проект ProctoLearn связан с Prometheus.

## 2) What is already done
- Monitoring stack поднят (Prometheus, Grafana, Node Exporter, Nginx, Nginx Exporter, Alertmanager, cAdvisor, Blackbox Exporter, Portainer).
- ProctoLearn API отдает `/metrics`.
- Prometheus target `proctolearn_api` в статусе `up`.
- Grafana datasource `Prometheus` создан автоматически.
- Telegram bot token/chat id уже прописаны в `monitoring-project/alertmanager/alertmanager.yml`.
- Telegram монитор-бот с командами `/start`, `/status`, `/graph`, `/containers` запущен.

## 3) What to do manually before recording (2-3 min)
1. Telegram: откройте чат с ботом и нажмите `Start`.
2. Откройте Grafana: `http://localhost:3000` (`admin` / `admin123`).
3. Import dashboard:
- Dashboards -> Import
- Dashboard ID: `1860`
- Data source: `Prometheus`
- Import

## 4) What URLs to open in video
- Frontend: http://localhost:3001
- API health: http://localhost:4000/health
- API metrics: http://localhost:4000/metrics
- Prometheus targets: http://localhost:9090/targets
- Alertmanager: http://localhost:9093
- Grafana: http://localhost:3000
- Portainer: http://localhost:9002
- cAdvisor: http://localhost:8081/containers/
- Blackbox metrics: http://localhost:9115/metrics

## 5) Terminal commands to show (copy-paste)

### 5.1 Show container status
```powershell
docker compose -f C:\Users\Arsen\ProctoLearn\docker-compose.dev.yml ps
docker compose -f C:\Users\Arsen\ProctoLearn\monitoring-project\docker-compose.yml ps
```

### 5.2 Show Prometheus targets quickly
```powershell
$raw = docker exec prometheus wget -qO- http://localhost:9090/api/v1/targets
$obj = $raw | ConvertFrom-Json
$obj.data.activeTargets | Select-Object scrapeUrl, health | Format-Table -AutoSize
```

### 5.3 Send test alert (Alertmanager v2)
```powershell
$start = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$end = (Get-Date).ToUniversalTime().AddMinutes(5).ToString("yyyy-MM-ddTHH:mm:ssZ")

$json = @"
[
  {
    "labels": { "alertname": "TestAlert", "severity": "warning" },
    "annotations": { "summary": "Видео-тест", "description": "Telegram алерт тексеру" },
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

### 5.4 Confirm alert exists
```powershell
Invoke-RestMethod -Uri "http://localhost:9093/api/v2/alerts" -Method GET |
  Where-Object { $_.labels.alertname -eq "TestAlert" } |
  Select-Object labels,annotations,status,startsAt,endsAt |
  ConvertTo-Json -Depth 6
```

## 6) Video storyline (recommended, 5-7 min)
1. Коротко показать архитектуру: ProctoLearn + monitoring stack.
2. Показать `docker compose ... ps` (оба compose).
3. Показать `http://localhost:9090/targets` (все `up`).
4. Показать `http://localhost:8081/containers/` (cAdvisor) и `http://localhost:9115/metrics` (blackbox).
5. Показать `http://localhost:4000/metrics` (есть метрики процесса).
6. Показать Grafana dashboard (ID 1860).
7. В Telegram боте выполнить `/start`, `/status`, `/graph`, `/containers`.
8. Отправить тестовый alert из PowerShell.
9. Показать Alertmanager UI с `TestAlert`.
10. Показать входящее сообщение в Telegram.

## 7) What to submit with video
- Ссылка/файл видео.
- Скриншот Prometheus targets (`up`).
- Скриншот Grafana dashboard.
- Скриншот Telegram alert.
- Файл документации: `DEVOPS_MONITORING_WINDOWS_FULL.md`.

## 8) Quick troubleshooting notes
- Если Telegram не приходит: нажмите `Start` у бота, проверьте token/chat_id в `monitoring-project/alertmanager/alertmanager.yml`, перезапустите alertmanager.
- Если API недоступен: проверьте `docker compose -f ...docker-compose.dev.yml ps` и логи `proctolearn_api_dev`.
- Если target down: проверьте `http://localhost:4000/metrics` и `http://localhost:9113/metrics`.
