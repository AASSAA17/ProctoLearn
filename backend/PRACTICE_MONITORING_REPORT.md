# Практическая работа

## Тема
Мониторинг сервера с помощью Node Exporter, Prometheus и Grafana.

## Цель работы
Научиться:
1. Собирать метрики сервера (CPU, RAM, Disk, Network).
2. Отображать метрики в Grafana.
3. Настраивать alerts при критической нагрузке.
4. Отправлять уведомления в Telegram или Email.

## Задачи работы
1. Установить Node Exporter.
2. Установить и настроить Prometheus.
3. Подключить Prometheus к Grafana.
4. Создать dashboard для CPU, RAM, Disk и Network.
5. Настроить alert-правила.
6. Настроить отправку уведомлений.

## Исходные условия
1. ОС: Ubuntu 22.04 (подойдет и другая Linux).
2. Доступ к серверу по SSH.
3. Открытые порты: 9100, 9090, 3000, 9093.

---

## Ход работы

### 1. Установка Node Exporter

1. Обновляем список пакетов:

```bash
sudo apt update
```

2. Создаем системного пользователя:

```bash
sudo useradd --no-create-home --shell /bin/false node_exporter
```

3. Скачиваем Node Exporter:

```bash
wget https://github.com/prometheus/node_exporter/releases/latest/download/node_exporter-1.8.2.linux-amd64.tar.gz
```

4. Распаковываем архив:

```bash
tar xvf node_exporter-1.8.2.linux-amd64.tar.gz
```

5. Копируем бинарный файл:

```bash
sudo cp node_exporter-1.8.2.linux-amd64/node_exporter /usr/local/bin/
```

6. Создаем сервис:

```bash
sudo nano /etc/systemd/system/node_exporter.service
```

Содержимое файла:

```ini
[Unit]
Description=Node Exporter
After=network.target

[Service]
User=node_exporter
Group=node_exporter
Type=simple
ExecStart=/usr/local/bin/node_exporter

[Install]
WantedBy=multi-user.target
```

7. Запускаем сервис и включаем автозапуск:

```bash
sudo systemctl daemon-reload
sudo systemctl enable node_exporter
sudo systemctl start node_exporter
sudo systemctl status node_exporter
```

8. Проверяем метрики в браузере:

```text
http://IP_СЕРВЕРА:9100/metrics
```

Ожидаемый результат: открывается список метрик.

---

### 2. Установка и настройка Prometheus

1. Создаем пользователя:

```bash
sudo useradd --no-create-home --shell /bin/false prometheus
```

2. Создаем директории:

```bash
sudo mkdir /etc/prometheus
sudo mkdir /var/lib/prometheus
```

3. Скачиваем Prometheus:

```bash
wget https://github.com/prometheus/prometheus/releases/latest/download/prometheus-2.54.1.linux-amd64.tar.gz
```

4. Распаковываем архив:

```bash
tar xvf prometheus-2.54.1.linux-amd64.tar.gz
```

5. Копируем файлы:

```bash
sudo cp prometheus-2.54.1.linux-amd64/prometheus /usr/local/bin/
sudo cp prometheus-2.54.1.linux-amd64/promtool /usr/local/bin/
sudo cp -r prometheus-2.54.1.linux-amd64/consoles /etc/prometheus
sudo cp -r prometheus-2.54.1.linux-amd64/console_libraries /etc/prometheus
```

6. Создаем конфигурацию:

```bash
sudo nano /etc/prometheus/prometheus.yml
```

Содержимое:

```yaml
global:
  scrape_interval: 15s

rule_files:
  - /etc/prometheus/alert_rules.yml

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ["localhost:9090"]

  - job_name: node_exporter
    static_configs:
      - targets: ["localhost:9100"]
```

7. Назначаем права:

```bash
sudo chown -R prometheus:prometheus /etc/prometheus
sudo chown -R prometheus:prometheus /var/lib/prometheus
```

8. Создаем сервис:

```bash
sudo nano /etc/systemd/system/prometheus.service
```

Содержимое:

```ini
[Unit]
Description=Prometheus
After=network.target

[Service]
User=prometheus
Group=prometheus
Type=simple
ExecStart=/usr/local/bin/prometheus --config.file=/etc/prometheus/prometheus.yml --storage.tsdb.path=/var/lib/prometheus

[Install]
WantedBy=multi-user.target
```

9. Запускаем Prometheus:

```bash
sudo systemctl daemon-reload
sudo systemctl enable prometheus
sudo systemctl start prometheus
sudo systemctl status prometheus
```

10. Проверяем работу:

```text
http://IP_СЕРВЕРА:9090
```

В разделе Targets у node_exporter должен быть статус UP.

---

### 3. Подключение Prometheus к Grafana

1. Устанавливаем Grafana:

```bash
sudo apt-get install -y apt-transport-https software-properties-common wget
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
echo "deb https://packages.grafana.com/oss/deb stable main" | sudo tee /etc/apt/sources.list.d/grafana.list
sudo apt update
sudo apt install grafana -y
```

2. Запускаем Grafana:

```bash
sudo systemctl enable grafana-server
sudo systemctl start grafana-server
sudo systemctl status grafana-server
```

3. Входим в веб-интерфейс:

```text
http://IP_СЕРВЕРА:3000
```

Логин/пароль по умолчанию: admin/admin.

4. Добавляем источник данных:
1. Connections -> Data sources -> Add data source.
2. Выбираем Prometheus.
3. URL: http://localhost:9090
4. Нажимаем Save and test.

Ожидаемый результат: успешная проверка подключения.

---

### 4. Создание dashboard (CPU, RAM, Disk, Network)

1. Создаем dashboard:
1. Dashboards -> New -> New dashboard.
2. Add visualization.

2. Добавляем панели и запросы.

CPU (в процентах):

```promql
100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)
```

RAM (в процентах):

```promql
(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100
```

Disk (корневой раздел, в процентах):

```promql
(1 - (node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay"})) * 100
```

Network In (байт/сек):

```promql
rate(node_network_receive_bytes_total{device!="lo"}[5m])
```

Network Out (байт/сек):

```promql
rate(node_network_transmit_bytes_total{device!="lo"}[5m])
```

3. Настраиваем единицы измерения:
1. CPU, RAM, Disk: Percent (0-100).
2. Network: bytes/sec.

4. Сохраняем dashboard, например с именем Server Monitoring.

---

### 5. Настройка alert при критической нагрузке

1. Создаем файл правил:

```bash
sudo nano /etc/prometheus/alert_rules.yml
```

Содержимое:

```yaml
groups:
  - name: server_alerts
    rules:
      - alert: HighCPUUsage
        expr: 100 - (avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Высокая загрузка CPU"
          description: "CPU больше 85% более 5 минут"

      - alert: HighRAMUsage
        expr: (1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100 > 90
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Высокая загрузка RAM"
          description: "RAM больше 90% более 5 минут"

      - alert: HighDiskUsage
        expr: (1 - (node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay"})) * 100 > 90
        for: 10m
        labels:
          severity: critical
        annotations:
          summary: "Мало места на диске"
          description: "Диск заполнен более чем на 90%"
```

2. Проверяем синтаксис:

```bash
promtool check rules /etc/prometheus/alert_rules.yml
```

3. Перезапускаем Prometheus:

```bash
sudo systemctl restart prometheus
```

---

### 6. Отправка уведомлений в Telegram или Email

Для отправки уведомлений используем Alertmanager.

1. Устанавливаем Alertmanager (аналогично Prometheus: скачать, распаковать, сервис).

2. Создаем файл:

```bash
sudo nano /etc/alertmanager/alertmanager.yml
```

Пример для Telegram:

```yaml
route:
  receiver: telegram

receivers:
  - name: telegram
    telegram_configs:
      - bot_token: "ВАШ_BOT_TOKEN"
        chat_id: ВАШ_CHAT_ID
        message: "Алерт: {{ .CommonAnnotations.summary }}. {{ .CommonAnnotations.description }}"
```

Пример для Email:

```yaml
route:
  receiver: email

receivers:
  - name: email
    email_configs:
      - to: "student@example.com"
        from: "monitor@example.com"
        smarthost: "smtp.gmail.com:587"
        auth_username: "monitor@example.com"
        auth_password: "ПАРОЛЬ_ПРИЛОЖЕНИЯ"
        require_tls: true
```

3. Связываем Prometheus с Alertmanager в файле /etc/prometheus/prometheus.yml:

```yaml
alerting:
  alertmanagers:
    - static_configs:
        - targets: ["localhost:9093"]
```

4. Перезапускаем сервисы:

```bash
sudo systemctl restart alertmanager
sudo systemctl restart prometheus
```

Ожидаемый результат: при срабатывании правила приходит уведомление.

---

## Настройка и проверка результата

1. Node Exporter доступен на 9100, метрики отдаются.
2. Prometheus видит node_exporter со статусом UP.
3. Grafana подключена к Prometheus.
4. Dashboard показывает CPU, RAM, Disk, Network.
5. Alerts срабатывают при превышении порогов.
6. Уведомления приходят в Telegram или Email.

## Итоговый результат
Система мониторинга настроена полностью: сбор метрик, визуализация, алерты и уведомления.

## Вывод
В этой работе я настроил мониторинг сервера с нуля. Теперь можно видеть состояние сервера в реальном времени и быстро получать сообщения о проблемах. Это помогает не пропустить критическую нагрузку и быстрее исправлять ошибки.
