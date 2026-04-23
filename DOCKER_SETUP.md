# ProctoLearn — Разделённые Docker Сервисы

## 🏗️ Структура

Проект разделён на **два независимых docker-compose файла**:

### 1️⃣ **Сервер (Backend + Frontend + БД)**
- Файл: `docker-compose.server.yml`
- Сервисы: API, Frontend, PostgreSQL, Redis, MinIO, N8N, Jenkins, OPA, PgAdmin, Mailpit
- Сеть: `proctolearn_server_network`

### 2️⃣ **Мониторинг (Prometheus + Grafana + Алерты)**
- Файл: `docker-compose.monitoring.yml`
- Сервисы: Prometheus, Grafana, AlertManager, Node Exporter, Nginx, Postgres Exporter
- Сеть: `proctolearn_monitoring_network`

---

## 🚀 Запуск

### **Только сервер (без мониторинга)**
```bash
docker compose -f docker-compose.server.yml up -d
```

Порты:
- Frontend: http://localhost:3001
- Backend API: http://localhost:4000
- PgAdmin: http://localhost:5050
- Mailpit: http://localhost:8025
- N8N: http://localhost:5678
- Jenkins: http://localhost:8088

### **Только мониторинг (без сервера)**
```bash
docker compose -f docker-compose.monitoring.yml -p proctolearn_monitoring up -d
```

Порты:
- Grafana: http://localhost:3000 (admin/admin123)
- Prometheus: http://localhost:9090
- AlertManager: http://localhost:9093

### **Оба сервиса вместе**
```bash
# Запуск
docker compose -f docker-compose.server.yml up -d
docker compose -f docker-compose.monitoring.yml -p proctolearn_monitoring up -d

# Остановка
docker compose -f docker-compose.server.yml down
docker compose -f docker-compose.monitoring.yml -p proctolearn_monitoring down
```

---

## 📊 Мониторинг сервера

Если нужно монторить основной сервер из мониторинга:

1. **Обновить Prometheus конфиг** (`monitoring-project/prometheus/prometheus.yml`):
```yaml
scrape_configs:
  - job_name: 'proctolearn-api'
    static_configs:
      - targets: ['api:4000']
  
  - job_name: 'postgres-server'
    static_configs:
      - targets: ['postgres-exporter:9187']
```

2. **Перезагрузить Prometheus**:
```bash
curl -X POST http://localhost:9090/-/reload
```

---

## 🛑 Остановка

### Остановить сервер
```bash
docker compose -f docker-compose.server.yml down
```

### Остановить мониторинг
```bash
docker compose -f docker-compose.monitoring.yml -p proctolearn_monitoring down
```

### Удалить всё (включая volumes)
```bash
docker compose -f docker-compose.server.yml down -v
docker compose -f docker-compose.monitoring.yml -p proctolearn_monitoring down -v
```

---

## 📝 Примечания

- **Разделение сетей**: Сервер и мониторинг работают в **отдельных Docker сетях**, они не видят друг друга напрямую
- **Порты**: Мониторинг использует порт 3000 (конфликт с фронтендом?), изменить на 3002 при необходимости
- **Данные**: Все volumes сохраняются в Docker storage, использовать `docker volume ls` для просмотра

---

## 🔧 Полезные команды

```bash
# Просмотр логов сервера
docker compose -f docker-compose.server.yml logs -f api

# Просмотр логов мониторинга
docker compose -f docker-compose.monitoring.yml -p proctolearn_monitoring logs -f prometheus

# Список контейнеров
docker ps -a | grep proctolearn

# Удалить все образы (опасно!)
docker rmi $(docker images | grep proctolearn | awk '{print $3}')
```
