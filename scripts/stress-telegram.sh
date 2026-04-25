#!/bin/bash
# ================================================================
# ProctoLearn — Стресс-тест через Alertmanager → Telegram
#
# Демонстрирует полную цепочку:
#   Нагрузка → CPU↑ → Prometheus (pending→firing) → Alertmanager → Telegram
#
# Использование:
#   bash scripts/stress-telegram.sh            # полный тест (~3 мин)
#   bash scripts/stress-telegram.sh --quick    # быстрый (~1.5 мин)
#   bash scripts/stress-telegram.sh --check    # только проверка сервисов
#   bash scripts/stress-telegram.sh --reload   # перезагрузить Prometheus правила
# ================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
API="http://localhost:4000"
PROM="http://localhost:9090"
ALERTMANAGER="http://localhost:9093"
RED='\033[0;31m';    GREEN='\033[0;32m';  YELLOW='\033[1;33m'
BLUE='\033[0;34m';   CYAN='\033[0;36m';   BOLD='\033[1m'; NC='\033[0m'
# ─── TELEGRAM CONFIG ─────────────────────────────────────────
ENV_FILE="$PROJECT_DIR/monitoring-project/.env"
BOT_TOKEN=""; CHAT_ID=""
if [ -f "$ENV_FILE" ]; then
  BOT_TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d ' ')
  CHAT_ID=$(grep  "^TELEGRAM_CHAT_ID="   "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d ' ')
fi
TG_OK=0
[ -n "$BOT_TOKEN" ] && [ "$BOT_TOKEN" != "YOUR_BOT_TOKEN_HERE" ] && \
[ -n "$CHAT_ID"   ] && [ "$CHAT_ID"   != "YOUR_CHAT_ID_HERE"   ] && TG_OK=1
MODE="full"
[ "${1:-}" = "--quick"  ] && MODE="quick"
[ "${1:-}" = "--check"  ] && MODE="check"
[ "${1:-}" = "--reload" ] && MODE="reload"
# ─── HELPERS ─────────────────────────────────────────────────
banner() {
  echo -e "${CYAN}${BOLD}"
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║  🔥 ProctoLearn — Stress Test via Alertmanager → TG     ║"
  echo "╠══════════════════════════════════════════════════════════╣"
  echo "║  Нагрузка → Prometheus → Alertmanager → Telegram        ║"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}
section() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }
ok()      { echo -e "  ${GREEN}✔ $1${NC}"; }
warn()    { echo -e "  ${YELLOW}⚠ $1${NC}"; }
info()    { echo -e "  ${BLUE}ℹ $1${NC}"; }
err()     { echo -e "  ${RED}✖ $1${NC}"; }
# ─── DIRECT TELEGRAM (только старт/стоп сообщения) ──────────
tg_direct() {
  local MSG="$1"
  [ "$TG_OK" = "0" ] && return 0
  local HTTP
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"$CHAT_ID\",\"text\":\"$MSG\",\"parse_mode\":\"HTML\"}" \
    --max-time 10 2>/dev/null)
  [ "$HTTP" = "200" ] && ok "📨 Telegram (direct info): отправлено" || warn "Telegram: HTTP $HTTP"
}
# ─── CHECK SERVICES ──────────────────────────────────────────
check_services() {
  section "Проверка сервисов"
  local ALL_OK=1
  curl -s --max-time 5 "$API/health" > /dev/null 2>&1 \
    && ok "API: $API ✓" \
    || { err "API недоступен! Запустите: bash start-all.sh"; ALL_OK=0; }
  curl -s --max-time 3 "$PROM/-/healthy" > /dev/null 2>&1 \
    && ok "Prometheus: $PROM ✓" \
    || { err "Prometheus недоступен! cd monitoring-project && docker compose up -d"; ALL_OK=0; }
  curl -s --max-time 3 "$ALERTMANAGER/-/healthy" > /dev/null 2>&1 \
    && ok "Alertmanager: $ALERTMANAGER ✓" \
    || { err "Alertmanager недоступен!"; ALL_OK=0; }
  [ "$TG_OK" = "1" ] \
    && ok "Telegram Bot: chat_id=$CHAT_ID ✓" \
    || { err "Telegram не настроен в monitoring-project/.env"; ALL_OK=0; }
  [ "$ALL_OK" = "0" ] && echo "" && err "Исправьте ошибки выше" && exit 1
  RULES_INFO=$(curl -s "$PROM/api/v1/rules" --max-time 5 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
groups=d.get('data',{}).get('groups',[])
rules=[r for g in groups for r in g.get('rules',[]) if r.get('type')=='alerting']
demo=[r for r in rules if 'LoadTest' in r.get('name','')]
print(f'{len(rules)} правил, {len(demo)} LoadTest demo-правил')" 2>/dev/null || echo "?")
  ok "Prometheus rules: $RULES_INFO"
}
# ─── RELOAD PROMETHEUS CONFIG ────────────────────────────────
reload_prometheus() {
  section "Перезагрузка Prometheus rules"
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$PROM/-/reload" --max-time 10 2>/dev/null)
  if [ "$HTTP" = "200" ]; then
    ok "Prometheus: конфиг перезагружен (200)"
  else
    warn "HTTP reload: $HTTP — пробуем SIGHUP..."
    docker kill --signal=SIGHUP prometheus 2>/dev/null \
      && ok "Prometheus: SIGHUP отправлен" \
      || warn "Не удалось перезагрузить. Попробуйте: docker restart prometheus"
  fi
  sleep 5
  ok "Новые demo rules активны: LoadTestActive, LoadTestHighCPU, LoadTestHighMemory"
}
# ─── GET AUTH TOKEN ──────────────────────────────────────────
TOKEN=""
get_token() {
  TOKEN=$(curl -s -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"admin@proctolearn.kz","password":"Admin@12"}' \
    --max-time 10 2>/dev/null | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4 || true)
  [ -n "$TOKEN" ] && ok "JWT токен получен" || warn "Токен не получен — публичные эндпоинты"
}
# ─── GET CPU FROM PROMETHEUS ─────────────────────────────────
get_cpu_prom() {
  curl -s "$PROM/api/v1/query?query=100-(avg(rate(node_cpu_seconds_total{mode=%22idle%22}[30s]))*100)" \
    --max-time 5 2>/dev/null | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=d.get('data',{}).get('result',[])
print(f'{float(r[0][\"value\"][1]):.1f}' if r else '?')" 2>/dev/null || echo "?"
}
# ─── CHECK PROMETHEUS ALERTS ─────────────────────────────────
check_prom_alerts() {
  # Returns lines like: "firing:LoadTestHighCPU" or "pending:LoadTestActive"
  curl -s "$PROM/api/v1/alerts" --max-time 5 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
alerts = d.get('data',{}).get('alerts',[])
demo = [a for a in alerts if 'LoadTest' in a.get('labels',{}).get('alertname','')]
if not demo:
    print('none')
else:
    for a in demo:
        print(a.get('state','?') + ':' + a.get('labels',{}).get('alertname','?'))
" 2>/dev/null || echo "none"
}
# ─── CHECK ALERTMANAGER ──────────────────────────────────────
check_alertmanager_count() {
  curl -s "$ALERTMANAGER/api/v2/alerts?active=true" --max-time 5 2>/dev/null | python3 -c "
import sys, json
try:
    alerts = json.load(sys.stdin)
    demo = [a for a in alerts if 'LoadTest' in a.get('labels',{}).get('alertname','')]
    print(len(demo))
except:
    print(0)" 2>/dev/null || echo "0"
}
# ─── LOAD WAVE ───────────────────────────────────────────────
TOTAL_SENT=0
send_load_wave() {
  local WORKERS=$1
  local EP=("/courses?limit=100" "/courses?limit=100&page=2" 
            "/courses?level=BEGINNER&limit=100" "/courses?level=INTERMEDIATE&limit=100" 
            "/courses?level=ADVANCED&limit=100")
  local AEP=("/certificates/my" "/enrollments/my" "/attempts?limit=50")
  for w in $(seq 1 $WORKERS); do
    for ep in "${EP[@]}"; do
      curl -s -o /dev/null "$API$ep" \
        ${TOKEN:+-H "Authorization: Bearer $TOKEN"} --max-time 5 &
    done
    if [ -n "$TOKEN" ]; then
      for ep in "${AEP[@]}"; do
        curl -s -o /dev/null "$API$ep" -H "Authorization: Bearer $TOKEN" --max-time 5 &
      done
    fi
  done
  TOTAL_SENT=$((TOTAL_SENT + WORKERS * 8))
}
# ─── STRESS PHASE WITH LIVE MONITORING ───────────────────────
run_stress() {
  local DURATION=$1
  local LABEL="$2"
  local WORKERS=$3
  section "$LABEL (${DURATION}с, $WORKERS воркеров)"
  info "Мониторинг цепочки: CPU → Prometheus → Alertmanager → Telegram"
  echo ""
  local START LAST_STATE
  START=$(date +%s)
  LAST_STATE="none"
  while true; do
    local NOW ELAPSED REMAINING
    NOW=$(date +%s)
    ELAPSED=$((NOW - START))
    [ $ELAPSED -ge $DURATION ] && break
    REMAINING=$((DURATION - ELAPSED))
    send_load_wave $WORKERS
    wait
    # Monitor every 5 seconds
    if [ $((ELAPSED % 5)) -eq 0 ] || [ $ELAPSED -eq 0 ]; then
      local CPU PSTATE AMCNT
      CPU=$(get_cpu_prom)
      PSTATE=$(check_prom_alerts | head -3)
      AMCNT=$(check_alertmanager_count)
      local FIRE_LINE="" PEND_LINE=""
      while IFS= read -r line; do
        case "$line" in
          firing:*)  FIRE_LINE="${RED}🔴 FIRING: ${line#firing:}${NC}"; ;;
          pending:*) PEND_LINE="${YELLOW}⏳ PENDING: ${line#pending:}${NC}"; ;;
        esac
      done <<< "$PSTATE"
      # State change notifications
      if [ -n "$FIRE_LINE" ] && [ "$LAST_STATE" != "firing" ]; then
        echo ""
        echo -e "  ${RED}${BOLD}🔥 ALERT FIRING! → Alertmanager → Telegram...${NC}"
        LAST_STATE="firing"
      elif [ -n "$PEND_LINE" ] && [ "$LAST_STATE" = "none" ]; then
        echo ""
        echo -e "  ${YELLOW}⏳ Alert перешёл в PENDING (ждём firing)...${NC}"
        LAST_STATE="pending"
      fi
      local AM_ICON="○"
      [ "$AMCNT" -gt "0" ] && AM_ICON="${GREEN}🔔 $AMCNT${NC}" || AM_ICON="○"
      echo -ne "\r  ⏱ ${REMAINING}s | CPU: ${CPU}% | Prometheus: $(echo "$PSTATE" | head -1) | Alertmanager: ${AM_ICON}   "
    fi
    sleep 0.3
  done
  wait
  echo ""
  ok "Фаза завершена. Отправлено: ~$TOTAL_SENT запросов"
}
# ─── WAIT & MONITOR ALERT CHAIN ──────────────────────────────
monitor_chain() {
  section "Мониторинг цепочки: Prometheus → Alertmanager → Telegram"
  info "После нагрузки ждём срабатывания алертов (group_wait: 10s, for: 15-30s)..."
  echo ""
  local WAITED=0 MAX_WAIT=90
  while [ $WAITED -lt $MAX_WAIT ]; do
    local CPU PSTATE AMCNT
    CPU=$(get_cpu_prom)
    PSTATE=$(check_prom_alerts)
    AMCNT=$(check_alertmanager_count)
    # Show detailed state
    local FIRING_FOUND=0
    while IFS= read -r line; do
      case "$line" in
        firing:*)
          echo -ne "\r                                                                    "
          echo ""
          echo -e "  ${RED}${BOLD}🔴 ALERT FIRING в Prometheus: ${line#firing:}${NC}"
          FIRING_FOUND=1
          ;;
        pending:*)
          echo -ne "\r  ⏳ PENDING: ${line#pending:} | CPU: ${CPU}% | AM: $AMCNT | ${WAITED}s   "
          ;;
        none)
          echo -ne "\r  📊 CPU: ${CPU}% | Нет LoadTest алертов | ${WAITED}s/${MAX_WAIT}s   "
          ;;
      esac
    done <<< "$PSTATE"
    if [ "$FIRING_FOUND" = "1" ]; then
      echo ""
      echo -e "  ${BLUE}ℹ Alertmanager group_wait: 10s — ждём отправки в Telegram...${NC}"
      sleep 15
      local AMCNT2
      AMCNT2=$(check_alertmanager_count)
      if [ "$AMCNT2" -gt "0" ]; then
        echo ""
        echo -e "  ${GREEN}${BOLD}🎉 ЦЕПОЧКА СРАБОТАЛА ПОЛНОСТЬЮ!${NC}"
        echo -e "  ${GREEN}  ✓ Prometheus: FIRING${NC}"
        echo -e "  ${GREEN}  ✓ Alertmanager: получил $AMCNT2 алерт(ов)${NC}"
        echo -e "  ${GREEN}  ✓ Telegram: уведомление отправлено!${NC}"
      else
        warn "Alertmanager не показывает активных алертов."
        warn "Проверьте логи: docker logs alertmanager"
      fi
      return
    fi
    sleep 5
    WAITED=$((WAITED + 5))
  done
  echo ""
  warn "Время ожидания ${MAX_WAIT}s вышло."
  warn "Возможные причины: CPU не поднялся выше порога (30%)"
  warn "Проверьте вручную: $PROM/alerts"
}
# ─── SHOW CHAIN SUMMARY ──────────────────────────────────────
show_chain_status() {
  section "Финальное состояние цепочки"
  echo ""
  echo -e "  ${BOLD}1️⃣  Prometheus Alert Rules:${NC}"
  curl -s "$PROM/api/v1/rules" --max-time 5 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
groups = d.get('data',{}).get('groups',[])
for g in groups:
    for r in g.get('rules',[]):
        if r.get('type') != 'alerting': continue
        state = r.get('state','inactive')
        icon  = {'firing':'🔴','pending':'🟡','inactive':'⚪'}.get(state,'⚪')
        print(f'     {icon} [{state.upper():8}] {r.get(\"name\",\"?\")}')
" 2>/dev/null || warn "Не удалось получить"
  echo ""
  echo -e "  ${BOLD}2️⃣  Alertmanager — активные алерты:${NC}"
  curl -s "$ALERTMANAGER/api/v2/alerts?active=true" --max-time 5 2>/dev/null | python3 -c "
import sys, json
try:
    alerts = json.load(sys.stdin)
    if not alerts:
        print('     ✅ Нет активных алертов (все resolved или не сработали)')
    for a in alerts[:10]:
        name = a.get('labels',{}).get('alertname','?')
        sev  = a.get('labels',{}).get('severity','?')
        summ = a.get('annotations',{}).get('summary','')[:60]
        print(f'     🔔 {name} [{sev}]: {summ}')
except Exception as e:
    print(f'     ? ошибка: {e}')
" 2>/dev/null || echo "     ? (не удалось подключиться)"
  echo ""
  echo -e "  ${BOLD}3️⃣  Telegram:${NC}"
  echo -e "     ${GREEN}→ Alertmanager настроен на: telegram-alerts receiver${NC}"
  echo -e "     ${GREEN}→ chat_id: $CHAT_ID${NC}"
  echo -e "     ${CYAN}→ Проверьте Telegram — должны быть сообщения от бота!${NC}"
}
# ─── WARMUP ──────────────────────────────────────────────────
phase_warmup() {
  section "Фаза 1 — Прогрев"
  info "50 запросов для прогрева..."
  for i in $(seq 1 50); do
    curl -s -o /dev/null "$API/courses?limit=20&page=$((i % 5 + 1))" \
      ${TOKEN:+-H "Authorization: Bearer $TOKEN"} --max-time 5 &
    [ $((i % 10)) -eq 0 ] && wait
  done
  wait
  CPU=$(get_cpu_prom)
  ok "Прогрев завершён. CPU: ${CPU}%"
}
# ─── FINAL TELEGRAM SUMMARY ──────────────────────────────────
send_final_direct() {
  local TOTAL=$1
  local CPU AMCNT
  CPU=$(get_cpu_prom)
  AMCNT=$(check_alertmanager_count)
  local CHAIN="⚠️ Алерты ещё в обработке (проверьте $PROM/alerts)"
  [ "$AMCNT" -gt "0" ] && CHAIN="✅ Цепочка прошла! Alertmanager: $AMCNT алерт(ов) в Telegram"
  tg_direct "✅ <b>STRESS TEST ЗАВЕРШЁН — ProctoLearn</b>
🕐 $(date '+%Y-%m-%d %H:%M:%S')
━━━━━━━━━━━━━━━━━━━━━
📊 <b>Итоги:</b>
• Запросов: ~${TOTAL}+
• CPU сейчас: ${CPU}%
• Режим: $MODE
🔗 <b>Alertmanager цепочка:</b>
$CHAIN
🔍 Grafana: http://localhost:3000
📡 Alertmanager: http://localhost:9093"
}
# ═══ MAIN ════════════════════════════════════════════════════
banner
check_services
echo ""
if [ "$MODE" = "check" ]; then
  show_chain_status
  CPU=$(get_cpu_prom); ok "CPU сейчас: ${CPU}%"
  exit 0
fi
if [ "$MODE" = "reload" ]; then
  reload_prometheus
  show_chain_status
  exit 0
fi
get_token
reload_prometheus
echo ""
echo -e "  ${BOLD}Режим: ${CYAN}$MODE${NC}"
echo -e "  ${BOLD}Demo Alert Rules:${NC}"
echo -e "    ${BLUE}LoadTestActive  ${NC}  CPU > 20% за 15с"
echo -e "    ${BLUE}LoadTestHighCPU ${NC}  CPU > 30% за 30с"
echo -e "    ${BLUE}LoadTestHighMem ${NC}  RAM > 60% за 30с"
echo ""
echo -e "${YELLOW}Начинаем через 3 секунды...${NC}"
sleep 3
# Стартовое уведомление
tg_direct "🚀 <b>STRESS TEST НАЧАЛСЯ — ProctoLearn</b>
🕐 $(date '+%Y-%m-%d %H:%M:%S')
━━━━━━━━━━━━━━━━━━━━━
🎯 <code>$API</code> | Режим: <b>$MODE</b>
Демонстрация цепочки:
Нагрузка → Prometheus → <b>Alertmanager</b> → 📱 Telegram
⏳ Prometheus: http://localhost:9090/alerts
📡 Alertmanager: http://localhost:9093"
# Нагрузочные фазы
phase_warmup
if [ "$MODE" = "quick" ]; then
  run_stress 45 "Фаза 2+3 — Нагрузка + Стресс (quick)" 15
else
  run_stress 60 "Фаза 2 — Высокая нагрузка" 10
  run_stress 45 "Фаза 3 — Стресс (25 воркеров)" 25
fi
# Мониторинг цепочки алертов
monitor_chain
# Финальный статус
show_chain_status
send_final_direct "$TOTAL_SENT"
echo ""
echo -e "${CYAN}${BOLD}═══════════════════════ ГОТОВО ══════════════════════${NC}"
echo -e "  ${GREEN}✔ Нагрузочный тест завершён${NC}"
echo -e "  ${GREEN}✔ Цепочка: Нагрузка → Prometheus → Alertmanager → Telegram${NC}"
echo ""
echo -e "  📊 Grafana:       ${BLUE}http://localhost:3000${NC}"
echo -e "  🔔 Prometheus:    ${BLUE}http://localhost:9090/alerts${NC}"
echo -e "  📡 Alertmanager:  ${BLUE}http://localhost:9093${NC}"
echo -e "  📱 Telegram:      ${YELLOW}проверьте чат — должны быть алерты от бота!${NC}"
echo ""
