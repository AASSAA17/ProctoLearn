#!/bin/bash
# =============================================================
# ProctoLearn — Скрипт запуска ВСЕХ контейнеров
# Использование: ./start-all.sh [up|down|restart|status|logs]
# =============================================================

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_header() {
  echo -e "${CYAN}"
  echo "╔══════════════════════════════════════════════╗"
  echo "║         ProctoLearn — All Containers         ║"
  echo "╚══════════════════════════════════════════════╝"
  echo -e "${NC}"
}

print_step() {
  echo -e "${BLUE}▶ $1${NC}"
}

print_ok() {
  echo -e "${GREEN}✔ $1${NC}"
}

print_warn() {
  echo -e "${YELLOW}⚠ $1${NC}"
}

print_err() {
  echo -e "${RED}✖ $1${NC}"
}

# Проверка .env
check_env() {
  if [ ! -f "$PROJECT_DIR/.env" ]; then
    print_err ".env файл не найден! Скопируйте .env.example в .env и заполните."
    exit 1
  fi
  print_ok ".env найден"
}

# Запуск основного стека (приложение + инфраструктура)
start_main() {
  print_step "Запуск основного стека (postgres, minio, api, web, pgadmin, mailpit, n8n, jenkins)..."
  docker compose -f docker-compose.dev.yml --env-file .env up -d --build
  print_ok "Основной стек запущен"
}

# Запуск мониторинга
start_monitoring() {
  print_step "Запуск стека мониторинга (prometheus, grafana, alertmanager, exporters)..."
  docker compose -f docker-compose.monitoring.yml --env-file .env up -d
  print_ok "Мониторинг запущен"
}

# Остановка всего
stop_all() {
  print_step "Остановка основного стека..."
  docker compose -f docker-compose.dev.yml down 2>/dev/null || true

  print_step "Остановка стека мониторинга..."
  docker compose -f docker-compose.monitoring.yml down 2>/dev/null || true

  print_ok "Все контейнеры остановлены"
}

# Перезапуск
restart_all() {
  stop_all
  sleep 2
  start_main
  start_monitoring
}

# Статус контейнеров
show_status() {
  echo ""
  echo -e "${CYAN}════════════════ СТАТУС КОНТЕЙНЕРОВ ════════════════${NC}"
  docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "procto|monitoring|prometheus|grafana|alertmanager|jenkins|n8n|mailpit|pgadmin|minio|postgres" || docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  echo ""
  echo -e "${CYAN}════════════════════ URL-АДРЕСА ═════════════════════${NC}"
  echo -e "${GREEN}🚀 Приложение (Frontend):${NC}   http://localhost:3001"
  echo -e "${GREEN}🔧 API Backend:${NC}             http://localhost:4000"
  echo -e "${GREEN}📊 pgAdmin:${NC}                 http://localhost:5050"
  echo -e "${GREEN}📦 MinIO Console:${NC}           http://localhost:9001"
  echo -e "${GREEN}📧 Mailpit:${NC}                 http://localhost:8025"
  echo -e "${GREEN}🔄 n8n:${NC}                     http://localhost:5678"
  echo -e "${GREEN}🏗️  Jenkins:${NC}                http://localhost:8088"
  echo -e "${GREEN}📈 Prometheus:${NC}              http://localhost:9090"
  echo -e "${GREEN}📉 Grafana:${NC}                 http://localhost:3000"
  echo -e "${GREEN}🔔 Alertmanager:${NC}            http://localhost:9093"
  echo ""
}

# Логи сервиса
show_logs() {
  SERVICE=${2:-api}
  print_step "Логи сервиса: $SERVICE"
  docker compose -f docker-compose.dev.yml logs -f --tail=100 "$SERVICE" 2>/dev/null || \
  docker logs -f --tail=100 "proctolearn_${SERVICE}" 2>/dev/null || \
  docker logs -f --tail=100 "$SERVICE" 2>/dev/null
}

# ─── MAIN ────────────────────────────────────────────────────
print_header
check_env

ACTION=${1:-up}

case "$ACTION" in
  up|start)
    start_main
    start_monitoring
    show_status
    ;;
  down|stop)
    stop_all
    ;;
  restart)
    restart_all
    show_status
    ;;
  status|ps)
    show_status
    ;;
  logs)
    show_logs "$@"
    ;;
  main)
    start_main
    show_status
    ;;
  monitoring)
    start_monitoring
    show_status
    ;;
  *)
    echo "Использование: $0 [up|down|restart|status|logs|main|monitoring]"
    echo ""
    echo "  up           — Запустить всё (основной стек + мониторинг)"
    echo "  down         — Остановить всё"
    echo "  restart      — Перезапустить всё"
    echo "  status       — Показать статус и URL"
    echo "  logs [имя]   — Логи сервиса (по умолчанию: api)"
    echo "  main         — Только основной стек (без мониторинга)"
    echo "  monitoring   — Только мониторинг"
    exit 1
    ;;
esac

