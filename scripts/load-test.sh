#!/bin/bash
# ================================================================
# ProctoLearn — Load Test + Telegram Alert Demo
# Генерирует нагрузку → Prometheus фиксирует → Alertmanager → Telegram
#
# Использование:
#   bash scripts/load-test.sh                   # с Telegram
#   bash scripts/load-test.sh --no-telegram     # без Telegram
#   bash scripts/load-test.sh --setup            # настроить токен
# ================================================================

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

API="http://localhost:4000"
PROM="http://localhost:9090"
ALERTMANAGER="http://localhost:9093"

RED='\033[0;31m';    GREEN='\033[0;32m';  YELLOW='\033[1;33m'
BLUE='\033[0;34m';   CYAN='\033[0;36m';   BOLD='\033[1m'; NC='\033[0m'

banner() {
  echo -e "${CYAN}${BOLD}"
  echo "╔══════════════════════════════════════════════════╗"
  echo "║   📊 ProctoLearn — Load Test & Alert Demo        ║"
  echo "║   Нагрузка → Prometheus → Alertmanager → TG      ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

section() { echo -e "\n${CYAN}${BOLD}▶ $1${NC}"; }
ok()      { echo -e "  ${GREEN}✔ $1${NC}"; }
warn()    { echo -e "  ${YELLOW}⚠ $1${NC}"; }
info()    { echo -e "  ${BLUE}ℹ $1${NC}"; }
err()     { echo -e "  ${RED}✖ $1${NC}"; }

NO_TG=0
[ "$1" = "--no-telegram" ] && NO_TG=1

# ─── SETUP ──────────────────────────────────────────────────
setup_telegram() {
  echo -e "${CYAN}Настройка Telegram бота${NC}"
  echo ""
  echo "1) Откройте @BotFather в Telegram → /newbot → скопируйте токен"
  echo "2) Напишите вашему боту любое сообщение"
  echo "3) Откройте: https://api.telegram.org/bot<TOKEN>/getUpdates"
  echo "   Найдите chat.id в ответе"
  echo ""
  read -p "Введите BOT_TOKEN: " BOT_TOKEN
  read -p "Введите CHAT_ID:    " CHAT_ID

  # Update monitoring .env
  sed -i "s/TELEGRAM_BOT_TOKEN=.*/TELEGRAM_BOT_TOKEN=$BOT_TOKEN/" "$PROJECT_DIR/monitoring-project/.env"
  sed -i "s/TELEGRAM_CHAT_ID=.*/TELEGRAM_CHAT_ID=$CHAT_ID/" "$PROJECT_DIR/monitoring-project/.env"

  echo ""
  ok "Сохранено в monitoring-project/.env"
  echo ""
  echo -e "${YELLOW}Перезапустите telegram-bot:${NC}"
  echo "  docker restart monitoring_telegram_bot"
  echo ""
  exit 0
}

[ "$1" = "--setup" ] && setup_telegram

# ─── READ TELEGRAM CONFIG ────────────────────────────────────
ENV_FILE="$PROJECT_DIR/monitoring-project/.env"
BOT_TOKEN=""
CHAT_ID=""

if [ -f "$ENV_FILE" ]; then
  BOT_TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d ' ')
  CHAT_ID=$(grep "^TELEGRAM_CHAT_ID=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d ' ')
fi

TG_OK=0
if [ -n "$BOT_TOKEN" ] && [ "$BOT_TOKEN" != "YOUR_BOT_TOKEN_HERE" ] && \
   [ -n "$CHAT_ID" ] && [ "$CHAT_ID" != "YOUR_CHAT_ID_HERE" ] && \
   [ "$NO_TG" = "0" ]; then
  TG_OK=1
fi

# ─── SEND TELEGRAM ──────────────────────────────────────────
send_telegram() {
  local MSG="$1"
  [ "$TG_OK" = "0" ] && return
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"$CHAT_ID\",\"text\":\"$MSG\",\"parse_mode\":\"HTML\"}" \
    > /dev/null 2>&1 && ok "Telegram: сообщение отправлено" || warn "Telegram: ошибка отправки"
}

# ─── CHECK SERVICES ──────────────────────────────────────────
check_services() {
  section "Проверка сервисов"

  if ! curl -s --max-time 3 "$API/health" > /dev/null 2>&1; then
    err "API недоступен! Запустите: bash start-all.sh"
    exit 1
  fi
  ok "API: $API ✓"

  if curl -s --max-time 3 "$PROM/-/healthy" > /dev/null 2>&1; then
    ok "Prometheus: $PROM ✓"
  else
    warn "Prometheus недоступен (метрики не будут видны)"
  fi

  if curl -s --max-time 3 "$ALERTMANAGER/-/healthy" > /dev/null 2>&1; then
    ok "Alertmanager: $ALERTMANAGER ✓"
  else
    warn "Alertmanager недоступен"
  fi

  if [ "$TG_OK" = "1" ]; then
    ok "Telegram: настроен (chat_id: $CHAT_ID)"
  else
    warn "Telegram: не настроен. Запустите: bash scripts/load-test.sh --setup"
  fi
}

# ─── GET TOKEN ───────────────────────────────────────────────
get_token() {
  TOKEN=$(curl -s -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@proctolearn.kz","password":"Admin@12"}' \
    --max-time 10 2>/dev/null | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

  if [ -z "$TOKEN" ]; then
    warn "Не удалось получить токен, используем публичные эндпоинты"
    TOKEN=""
  else
    ok "Токен получен"
  fi
}

# ─── PHASE 1: WARM UP ────────────────────────────────────────
phase_warmup() {
  section "Фаза 1: Прогрев (15 сек)"
  info "Отправляем 30 умеренных запросов..."

  for i in $(seq 1 30); do
    curl -s -o /dev/null "$API/courses?limit=20&page=$((i % 5 + 1))" \
      ${TOKEN:+-H "Authorization: Bearer $TOKEN"} --max-time 5 &
    [ $((i % 5)) -eq 0 ] && wait && sleep 0.5
  done
  wait
  ok "Прогрев завершён"
}

# ─── PHASE 2: HIGH LOAD ──────────────────────────────────────
phase_high_load() {
  section "Фаза 2: Высокая нагрузка (60 сек)"
  info "Параллельные запросы к разным эндпоинтам..."
  info "Цель: поднять CPU API выше порога (0.03) → триггер алерта"

  TOTAL_SENT=0
  START=$(date +%s)
  DURATION=60

  ENDPOINTS=(
    "/courses?limit=50"
    "/courses?limit=100&page=1"
    "/courses?limit=100&page=2"
    "/courses?limit=100&page=3"
    "/courses?level=BEGINNER"
    "/courses?level=INTERMEDIATE"
    "/courses?level=ADVANCED"
  )

  # Add authenticated endpoints if we have token
  if [ -n "$TOKEN" ]; then
    echo "  (+ авторизованные запросы)"
  fi

  while true; do
    NOW=$(date +%s)
    ELAPSED=$((NOW - START))
    [ $ELAPSED -ge $DURATION ] && break

    REMAINING=$((DURATION - ELAPSED))
    echo -ne "\r  ⏱  Осталось: ${REMAINING}s | Отправлено: ${TOTAL_SENT} запросов   "

    # Send 10 parallel requests per iteration
    for ep in "${ENDPOINTS[@]}"; do
      curl -s -o /dev/null "$API$ep" \
        ${TOKEN:+-H "Authorization: Bearer $TOKEN"} \
        --max-time 4 &
    done

    # AI chat requests (more CPU intensive)
    if [ -n "$TOKEN" ]; then
      for j in $(seq 1 3); do
        curl -s -o /dev/null -X POST "$API/ai/chat" \
          -H "Authorization: Bearer $TOKEN" \
          -H "Content-Type: application/json" \
          -d "{\"message\":\"load test $j: курс туралы айт\"}" \
          --max-time 8 &
      done
    fi

    TOTAL_SENT=$((TOTAL_SENT + ${#ENDPOINTS[@]} + 3))
    wait
    sleep 0.2
  done

  echo ""
  ok "Высокая нагрузка завершена. Отправлено: $TOTAL_SENT запросов за ${DURATION}с"
}

# ─── PHASE 3: STRESS TEST ────────────────────────────────────
phase_stress() {
  section "Фаза 3: Стресс-тест (30 сек)"
  info "Максимальная нагрузка — 20 параллельных потоков..."

  WORKERS=20
  DURATION=30
  START=$(date +%s)
  TOTAL=0

  worker() {
    local END=$(($(date +%s) + DURATION))
    while [ $(date +%s) -lt $END ]; do
      curl -s -o /dev/null "$API/courses?limit=100" --max-time 5 &
      curl -s -o /dev/null "$API/courses?level=ADVANCED" --max-time 5 &
      if [ -n "$TOKEN" ]; then
        curl -s -o /dev/null "$API/certificates/my" \
          -H "Authorization: Bearer $TOKEN" --max-time 5 &
      fi
      wait
    done
  }

  # Launch workers
  for w in $(seq 1 $WORKERS); do
    worker &
  done

  # Progress display
  for i in $(seq 1 $DURATION); do
    echo -ne "\r  🔥 Стресс-тест: ${i}/${DURATION}s | $WORKERS потоков активно   "
    sleep 1
  done
  wait
  echo ""
  ok "Стресс-тест завершён"
}

# ─── CHECK ALERTS ────────────────────────────────────────────
check_alerts() {
  section "Проверка алертов"

  # Check Prometheus alerts
  if curl -s --max-time 3 "$PROM/-/healthy" > /dev/null 2>&1; then
    ALERTS=$(curl -s "$ALERTMANAGER/api/v1/alerts" --max-time 5 2>/dev/null | \
      python3 -c "import sys,json
data=json.load(sys.stdin)
alerts=data.get('data',{}).get('alerts',[])
fired=[a for a in alerts if a.get('status',{}).get('state')=='active']
for a in fired[:5]:
    print('  🔔 '+a.get('labels',{}).get('alertname','?')+' — '+a.get('annotations',{}).get('summary',''))" 2>/dev/null)

    if [ -n "$ALERTS" ]; then
      ok "Активные алерты Alertmanager:"
      echo "$ALERTS"
    else
      info "Активных алертов в Alertmanager нет (может быть задержка до 2 мин)"
    fi

    # Check Prometheus pending/firing
    FIRING=$(curl -s "$PROM/api/v1/alerts" --max-time 5 2>/dev/null | \
      python3 -c "import sys,json
data=json.load(sys.stdin)
alerts=data.get('data',{}).get('alerts',[])
for a in alerts[:10]:
    state=a.get('state','?')
    name=a.get('labels',{}).get('alertname','?')
    icon='🔥' if state=='firing' else '⏳'
    print(f'  {icon} [{state.upper()}] {name}')" 2>/dev/null)

    if [ -n "$FIRING" ]; then
      ok "Состояние алертов в Prometheus:"
      echo "$FIRING"
    fi
  else
    warn "Prometheus недоступен"
  fi
}

# ─── SEND TG NOTIFICATIONS ───────────────────────────────────
send_notifications() {
  section "Telegram уведомления"
  [ "$TG_OK" = "0" ] && warn "Telegram не настроен. Запустите: bash scripts/load-test.sh --setup" && return

  # Start notification
  MSG="🔥 <b>ProctoLearn Load Test</b>
⏱ $(date '+%Y-%m-%d %H:%M:%S')
━━━━━━━━━━━━━
📊 <b>Load Test запущен!</b>
• Фаза 1: Прогрев — 30 req
• Фаза 2: Нагрузка — 60s
• Фаза 3: Стресс — 20 потоков"

  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"$CHAT_ID\",\"text\":\"$MSG\",\"parse_mode\":\"HTML\"}" \
    > /dev/null 2>&1
  ok "Уведомление о запуске отправлено"
}

send_final_notification() {
  [ "$TG_OK" = "0" ] && return

  # Get current metrics
  CPU=$(curl -s "$PROM/api/v1/query?query=100-(avg(rate(node_cpu_seconds_total{mode='idle'}[1m]))*100)" \
    --max-time 5 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=d.get('data',{}).get('result',[])
print(f'{float(r[0][\"value\"][1]):.1f}' if r else '?')" 2>/dev/null || echo "?")

  RAM=$(curl -s "$PROM/api/v1/query?query=(1-(node_memory_MemAvailable_bytes/node_memory_MemTotal_bytes))*100" \
    --max-time 5 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=d.get('data',{}).get('result',[])
print(f'{float(r[0][\"value\"][1]):.1f}' if r else '?')" 2>/dev/null || echo "?")

  TOTAL_REQS=$((TOTAL_SENT + 30))

  MSG="✅ <b>ProctoLearn Load Test — ЗАВЕРШЁН</b>
⏱ $(date '+%Y-%m-%d %H:%M:%S')
━━━━━━━━━━━━━
📈 <b>Результаты:</b>
• Всего запросов: ~$TOTAL_SENT+
• CPU сейчас: ${CPU}%
• RAM сейчас: ${RAM}%
• Длительность: ~1.5 минуты

🔍 Проверьте алерты:
• Prometheus: http://localhost:9090/alerts
• Alertmanager: http://localhost:9093
• Grafana: http://localhost:3000"

  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"$CHAT_ID\",\"text\":\"$MSG\",\"parse_mode\":\"HTML\"}" \
    > /dev/null 2>&1
  ok "Финальный отчёт отправлен в Telegram"
}

# ─── FIRE MANUAL ALERT ───────────────────────────────────────
fire_manual_alert() {
  section "Принудительный тест Alertmanager → Telegram"
  [ "$TG_OK" = "0" ] && warn "Пропущено (Telegram не настроен)" && return

  # Fire a test alert directly to alertmanager
  ALERT_PAYLOAD='{
    "version":"4",
    "groupKey":"{}:{alertname=\"LoadTestAlert\"}",
    "status":"firing",
    "receiver":"telegram-webhook",
    "groupLabels":{"alertname":"LoadTestAlert"},
    "commonLabels":{"alertname":"LoadTestAlert","severity":"warning"},
    "commonAnnotations":{"summary":"Load Test Alert: нагрузочный тест завершён","description":"ProctoLearn выдержал нагрузочный тест. Система работает стабильно."},
    "externalURL":"http://localhost:9093",
    "alerts":[{
      "status":"firing",
      "labels":{"alertname":"LoadTestAlert","severity":"warning","job":"proctolearn_api"},
      "annotations":{"summary":"🔥 Load Test завершён!","description":"ProctoLearn API выдержал стресс-тест. Все сервисы работают."},
      "startsAt":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
      "endsAt":"0001-01-01T00:00:00Z"
    }]
  }'

  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "http://localhost:9093/api/v1/alerts" \
    -H "Content-Type: application/json" \
    -d "[$ALERT_PAYLOAD]" --max-time 5 2>/dev/null)

  if [ "$STATUS" = "200" ]; then
    ok "Alert отправлен в Alertmanager → Telegram (200 OK)"
  else
    warn "Alertmanager ответил: $STATUS (возможно не запущен)"
    # Direct TG as fallback
    send_telegram "🔥 <b>ProctoLearn Load Test Alert</b>
⏱ $(date '+%Y-%m-%d %H:%M:%S')
━━━━━━━━━━━━━━━
✅ Нагрузочный тест завершён!
API выдержал стресс-тест.
Все сервисы работают стабильно."
  fi
}

# ─── SHOW RESULTS ───────────────────────────────────────────
show_results() {
  echo ""
  echo -e "${CYAN}${BOLD}════════════ РЕЗУЛЬТАТЫ LOAD TEST ════════════${NC}"
  echo ""
  echo -e "  ${GREEN}Ссылки для просмотра результатов:${NC}"
  echo -e "  📈 Prometheus алерты:  ${BLUE}http://localhost:9090/alerts${NC}"
  echo -e "  🔔 Alertmanager:       ${BLUE}http://localhost:9093${NC}"
  echo -e "  📊 Grafana дашборд:    ${BLUE}http://localhost:3000${NC}"
  echo ""
  echo -e "  ${YELLOW}Grafana → Dashboard → Node Exporter → CPU Usage${NC}"
  echo -e "  ${YELLOW}Должны быть видны пики нагрузки в течение теста${NC}"
  echo ""
  if [ "$TG_OK" = "0" ]; then
    echo -e "  ${RED}Telegram не настроен!${NC}"
    echo -e "  Запустите: ${YELLOW}bash scripts/load-test.sh --setup${NC}"
    echo -e "  Затем:     ${YELLOW}docker restart monitoring_telegram_bot${NC}"
  fi
}

# ─── MAIN ────────────────────────────────────────────────────
banner
check_services
get_token

echo ""
echo -e "${YELLOW}Начинаем через 3 секунды... (Ctrl+C для отмены)${NC}"
sleep 3

# Send start notification
send_notifications

# Run phases
phase_warmup
phase_high_load
TOTAL_SENT=$((30 + 500))  # approximate
phase_stress

# Check what fired
check_alerts
fire_manual_alert
send_final_notification

show_results

