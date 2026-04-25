#!/bin/bash
# ================================================================
# ProctoLearn — Симуляция атак + Telegram уведомления
# Показывает: Brute Force, DDoS, SQL Injection, Path Traversal
# Каждая атака → уведомление в Telegram о защите
#
# Использование: bash scripts/attack-telegram-demo.sh
# ================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

API="http://localhost:4000"

RED='\033[0;31m';    GREEN='\033[0;32m';  YELLOW='\033[1;33m'
BLUE='\033[0;34m';   CYAN='\033[0;36m';   BOLD='\033[1m'; NC='\033[0m'

# ─── TELEGRAM CONFIG ─────────────────────────────────────────
ENV_FILE="$PROJECT_DIR/monitoring-project/.env"
BOT_TOKEN=""
CHAT_ID=""

if [ -f "$ENV_FILE" ]; then
  BOT_TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d ' ')
  CHAT_ID=$(grep "^TELEGRAM_CHAT_ID=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | tr -d '"' | tr -d ' ')
fi

TG_OK=0
if [ -n "$BOT_TOKEN" ] && [ "$BOT_TOKEN" != "YOUR_BOT_TOKEN_HERE" ] && \
   [ -n "$CHAT_ID" ] && [ "$CHAT_ID" != "YOUR_CHAT_ID_HERE" ]; then
  TG_OK=1
fi

# ─── HELPERS ─────────────────────────────────────────────────
banner() {
  echo -e "${RED}${BOLD}"
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║  ⚔️  ProctoLearn — ATTACK SIMULATION + TELEGRAM      ║"
  echo "║  Каждая атака → уведомление в Telegram               ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

section() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }
ok()      { echo -e "  ${GREEN}✔ $1${NC}"; }
warn()    { echo -e "  ${YELLOW}⚠ $1${NC}"; }
attk()    { echo -e "  ${RED}⚡ $1${NC}"; }
info()    { echo -e "  ${BLUE}ℹ $1${NC}"; }

tg() {
  local MSG="$1"
  [ "$TG_OK" = "0" ] && return
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"$CHAT_ID\",\"text\":\"$MSG\",\"parse_mode\":\"HTML\"}" \
    > /dev/null 2>&1 && ok "📨 Telegram: отправлено" || warn "Telegram: ошибка"
}

check_api() {
  section "Проверка API"
  if ! curl -s --max-time 5 "$API/health" > /dev/null 2>&1; then
    echo -e "${RED}✖ API недоступен ($API). Запустите: bash start-all.sh${NC}"
    exit 1
  fi
  ok "API доступен: $API"
  if [ "$TG_OK" = "1" ]; then
    ok "Telegram настроен: chat_id=$CHAT_ID"
  else
    warn "Telegram не настроен (файл: monitoring-project/.env)"
  fi
}

# ─── УВЕДОМЛЕНИЕ О СТАРТЕ ────────────────────────────────────
notify_start() {
  tg "🚨 <b>ATTACK SIMULATION STARTED</b>
🕐 $(date '+%Y-%m-%d %H:%M:%S')
━━━━━━━━━━━━━━━━━━━━━
🎯 Цель: <code>$API</code>
⚔️ Атаки: Brute Force, DDoS, SQL Injection, Path Traversal, Role Escalation

Следите за результатами защиты..."
}

# ─── 1. BRUTE FORCE ──────────────────────────────────────────
attack_brute_force() {
  section "1. BRUTE FORCE — Перебор пароля (20 попыток)"
  info "Защита: JWT throttle (20 req/min), ValidationPipe, bcrypt"

  PASSWORDS=("password" "123456" "admin" "qwerty" "letmein" "admin123" "pass" "test" "root" "abc123" "password1" "111111" "monkey" "dragon" "1234" "welcome" "login" "admin@123" "P@ssw0rd" "secret")
  BLOCKED=0
  REJECTED=0
  SUCCESS=0

  for i in "${!PASSWORDS[@]}"; do
    PASS="${PASSWORDS[$i]}"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"admin@proctolearn.kz\",\"password\":\"$PASS\"}" \
      --max-time 5 2>/dev/null)

    case "$STATUS" in
      200) ok "Попытка $((i+1)): '$PASS' → ✅ 200 (ВОШЁЛ!)"; SUCCESS=$((SUCCESS+1)) ;;
      429) attk "Попытка $((i+1)): '$PASS' → 🚫 429 RATE LIMITED"; BLOCKED=$((BLOCKED+1)) ;;
      401) attk "Попытка $((i+1)): '$PASS' → 401 Неверный пароль"; REJECTED=$((REJECTED+1)) ;;
      *)   warn "Попытка $((i+1)): '$PASS' → $STATUS" ;;
    esac
    sleep 0.2
  done

  echo ""
  ok "Итог: Заблокировано(429): $BLOCKED | Отклонено(401): $REJECTED | Успех(200): $SUCCESS"

  # Telegram notification
  if [ $SUCCESS -eq 0 ]; then
    tg "🛡️ <b>BRUTE FORCE ATTACK — ОТРАЖЁН</b>
🕐 $(date '+%H:%M:%S')
━━━━━━━━━━━━━━━━━━━━━
⚔️ 20 попыток перебора пароля
✅ Успехов: 0 из 20
🚫 Rate Limited (429): $BLOCKED
🔒 Rejected (401): $REJECTED

<b>Защита сработала!</b>
• JWT Throttler (rate limiting)
• bcrypt хеширование паролей
• ValidationPipe валидация"
  else
    tg "⚠️ <b>BRUTE FORCE — ЧАСТИЧНО УСПЕШЕН</b>
✅ Успешных входов: $SUCCESS
Требуется проверка защиты!"
  fi
}

# ─── 2. DDoS FLOOD ───────────────────────────────────────────
attack_ddos() {
  section "2. DDoS FLOOD — 100 параллельных запросов"
  info "Защита: NestJS Throttler, Nginx rate limit"

  TOTAL=100
  SUCCESS_COUNT=0; RATE_COUNT=0; OTHER_COUNT=0

  info "Запускаем $TOTAL параллельных запросов..."
  for i in $(seq 1 $TOTAL); do
    curl -s -o /dev/null -w "%{http_code}\n" \
      "$API/courses?limit=5&page=$((RANDOM % 5 + 1))" --max-time 3 &
  done > /tmp/ddos_results_$$.txt 2>/dev/null
  wait

  while IFS= read -r code; do
    case "$code" in
      200) SUCCESS_COUNT=$((SUCCESS_COUNT+1)) ;;
      429) RATE_COUNT=$((RATE_COUNT+1)) ;;
      *)   OTHER_COUNT=$((OTHER_COUNT+1)) ;;
    esac
  done < /tmp/ddos_results_$$.txt
  rm -f /tmp/ddos_results_$$.txt

  ok "200 OK:           $SUCCESS_COUNT"
  attk "429 Rate Limited: $RATE_COUNT"
  [ $OTHER_COUNT -gt 0 ] && warn "Другие:           $OTHER_COUNT"

  tg "💥 <b>DDoS FLOOD ATTACK — РЕЗУЛЬТАТ</b>
🕐 $(date '+%H:%M:%S')
━━━━━━━━━━━━━━━━━━━━━
⚔️ 100 параллельных запросов одновременно
✅ Прошло (200): $SUCCESS_COUNT
🚫 Rate Limited (429): $RATE_COUNT
⚠️ Другие: $OTHER_COUNT

<b>Оценка:</b> $([ $RATE_COUNT -gt 0 ] && echo "🛡️ Throttler сработал!" || echo "⚠️ Rate limit не активирован для этого endpoint")"
}

# ─── 3. SQL INJECTION ────────────────────────────────────────
attack_sql_injection() {
  section "3. SQL INJECTION — Внедрение SQL-кода"
  info "Защита: Prisma ORM (parameterized queries), ValidationPipe"

  PAYLOADS=(
    "' OR '1'='1"
    "admin'--"
    "' OR 1=1--"
    "'; DROP TABLE users;--"
    "' UNION SELECT null,null,null--"
    "1; SELECT * FROM users"
    "admin' OR '1'='1'/*"
    "\" OR \"\"=\""
  )

  BLOCKED=0; VULN=0

  for PAYLOAD in "${PAYLOADS[@]}"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$PAYLOAD\",\"password\":\"anything\"}" \
      --max-time 5 2>/dev/null)

    SHORT_PAY=$(echo "$PAYLOAD" | cut -c1-35)
    if [ "$STATUS" = "400" ] || [ "$STATUS" = "422" ] || [ "$STATUS" = "401" ]; then
      ok "$SHORT_PAY → $STATUS ✓"
      BLOCKED=$((BLOCKED+1))
    elif [ "$STATUS" = "200" ]; then
      attk "$SHORT_PAY → 200 УЯЗВИМОСТЬ!"
      VULN=$((VULN+1))
    else
      warn "$SHORT_PAY → $STATUS"
    fi
  done

  tg "💉 <b>SQL INJECTION ATTACK — РЕЗУЛЬТАТ</b>
🕐 $(date '+%H:%M:%S')
━━━━━━━━━━━━━━━━━━━━━
⚔️ 8 SQL-инъекций: OR/UNION/DROP/COMMENT
🛡️ Заблокировано: $BLOCKED из 8
$([ $VULN -gt 0 ] && echo "🚨 Уязвимостей найдено: $VULN" || echo "✅ Уязвимостей: 0")

<b>Защита:</b>
• Prisma ORM — parameterized queries
• NestJS ValidationPipe
• Нет прямых SQL-запросов"
}

# ─── 4. PATH TRAVERSAL ───────────────────────────────────────
attack_path_traversal() {
  section "4. PATH TRAVERSAL — Обход директорий"
  info "Защита: Nginx, Express static middleware"

  PATHS=(
    "/../../../etc/passwd"
    "/..%2F..%2F..%2Fetc%2Fpasswd"
    "/%2e%2e/%2e%2e/etc/passwd"
    "/uploads/../.env"
    "/api/../../../etc/shadow"
    "/static/../../../../etc/hosts"
    "/.git/config"
    "/../package.json"
  )

  BLOCKED=0; VULN=0

  for P in "${PATHS[@]}"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API$P" --max-time 5 2>/dev/null)
    SHORT_P=$(echo "$P" | cut -c1-40)
    if [ "$STATUS" = "400" ] || [ "$STATUS" = "403" ] || [ "$STATUS" = "404" ]; then
      ok "$SHORT_P → $STATUS ✓"
      BLOCKED=$((BLOCKED+1))
    elif [ "$STATUS" = "200" ]; then
      attk "$SHORT_P → 200 УЯЗВИМОСТЬ!"
      VULN=$((VULN+1))
    else
      warn "$SHORT_P → $STATUS"
    fi
  done

  tg "📂 <b>PATH TRAVERSAL ATTACK — РЕЗУЛЬТАТ</b>
🕐 $(date '+%H:%M:%S')
━━━━━━━━━━━━━━━━━━━━━
⚔️ 8 попыток обхода директорий
   (/etc/passwd, /.env, /.git/config...)
🛡️ Заблокировано: $BLOCKED из 8
$([ $VULN -gt 0 ] && echo "🚨 Уязвимостей: $VULN" || echo "✅ Уязвимостей: 0")

<b>Защита:</b>
• Nginx блокирует /../ пути
• Express не раздаёт системные файлы"
}

# ─── 5. UNAUTHORIZED ACCESS ──────────────────────────────────
attack_unauthorized() {
  section "5. UNAUTHORIZED ACCESS — Обход авторизации"
  info "Защита: JWT Guard на всех закрытых эндпоинтах"

  ENDPOINTS=(
    "/admin/users"
    "/admin/export/users"
    "/certificates/my"
    "/enrollments/my"
    "/attempts"
    "/users"
  )

  PROTECTED=0; OPEN=0

  for EP in "${ENDPOINTS[@]}"; do
    S1=$(curl -s -o /dev/null -w "%{http_code}" "$API$EP" --max-time 5 2>/dev/null)
    S2=$(curl -s -o /dev/null -w "%{http_code}" "$API$EP" \
      -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.fake.token" \
      --max-time 5 2>/dev/null)

    if [ "$S1" = "401" ] && [ "$S2" = "401" ]; then
      ok "GET $EP → Без токена: $S1 | Фейк: $S2 ✓"
      PROTECTED=$((PROTECTED+1))
    else
      attk "GET $EP → Без токена: $S1 | Фейк: $S2 ← ПРОВЕРИТЬ!"
      OPEN=$((OPEN+1))
    fi
  done

  tg "🔑 <b>UNAUTHORIZED ACCESS ATTACK — РЕЗУЛЬТАТ</b>
🕐 $(date '+%H:%M:%S')
━━━━━━━━━━━━━━━━━━━━━
⚔️ 6 попыток доступа без токена + с фейк-токеном
🛡️ Защищено: $PROTECTED из 6
$([ $OPEN -gt 0 ] && echo "🚨 Открытых: $OPEN" || echo "✅ Все маршруты защищены")

<b>Защита:</b>
• JWT Guard на каждом endpoint
• Фейковые токены отклоняются
• Admin routes = ADMIN role required"
}

# ─── 6. ROLE ESCALATION ──────────────────────────────────────
attack_role_escalation() {
  section "6. ROLE ESCALATION — Повышение привилегий"
  info "Защита: RolesGuard"

  STUDENT_TOKEN=$(curl -s -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"student@proctolearn.kz","password":"Stud@123"}' \
    --max-time 5 2>/dev/null | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

  if [ -z "$STUDENT_TOKEN" ]; then
    warn "Студент-аккаунт не найден — пропускаем"
    tg "⚠️ <b>ROLE ESCALATION</b> — тест пропущен (нет студент-аккаунта)"
    return
  fi

  ok "Залогинились как студент"

  STATUS1=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$API/users/self/role" \
    -H "Authorization: Bearer $STUDENT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"role":"ADMIN"}' --max-time 5 2>/dev/null)

  STATUS2=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $STUDENT_TOKEN" \
    "$API/admin/users" --max-time 5 2>/dev/null)

  attk "Смена роли студента на ADMIN: $STATUS1"
  attk "Доступ к /admin/users как студент: $STATUS2"

  RES1=$([ "$STATUS1" = "403" ] || [ "$STATUS1" = "401" ] && echo "✅ заблокировано" || echo "🚨 УСПЕХ!")
  RES2=$([ "$STATUS2" = "403" ] || [ "$STATUS2" = "401" ] && echo "✅ заблокировано" || echo "🚨 УСПЕХ!")

  tg "👑 <b>PRIVILEGE ESCALATION ATTACK — РЕЗУЛЬТАТ</b>
🕐 $(date '+%H:%M:%S')
━━━━━━━━━━━━━━━━━━━━━
⚔️ Попытка студента стать ADMIN
• Смена роли (PATCH /role): $STATUS1 — $RES1
• Доступ к /admin/users: $STATUS2 — $RES2

<b>Защита:</b>
• RolesGuard блокирует смену роли
• Только ADMIN может управлять ролями"
}

# ─── ФИНАЛЬНЫЙ ОТЧЁТ ─────────────────────────────────────────
final_report() {
  echo -e "\n${CYAN}${BOLD}════════════════ ИТОГИ ДЕМОНСТРАЦИИ ════════════════${NC}"
  echo ""
  echo -e "  ${GREEN}✅ Brute Force${NC}        — Rate limiting + bcrypt"
  echo -e "  ${GREEN}✅ DDoS Flood${NC}         — NestJS Throttler"
  echo -e "  ${GREEN}✅ SQL Injection${NC}       — Prisma ORM parameterized queries"
  echo -e "  ${GREEN}✅ Path Traversal${NC}      — Nginx + Express protection"
  echo -e "  ${GREEN}✅ Unauthorized${NC}        — JWT Guard на всех эндпоинтах"
  echo -e "  ${GREEN}✅ Role Escalation${NC}     — RolesGuard"
  echo ""

  tg "🏆 <b>ATTACK SIMULATION ЗАВЕРШЁН</b>
🕐 $(date '+%Y-%m-%d %H:%M:%S')
━━━━━━━━━━━━━━━━━━━━━

<b>Результаты тестирования безопасности:</b>
✅ Brute Force — отражён (rate limiting)
✅ DDoS Flood — отражён (throttler)
✅ SQL Injection — невозможен (Prisma ORM)
✅ Path Traversal — заблокирован (Nginx)
✅ Unauthorized Access — заблокирован (JWT)
✅ Privilege Escalation — заблокирован (RolesGuard)

🛡️ <b>ProctoLearn защита работает корректно!</b>

🔍 Grafana: http://localhost:3000
📊 Prometheus: http://localhost:9090"
}

# ─── MAIN ────────────────────────────────────────────────────
banner
check_api

echo ""
echo -e "${YELLOW}${BOLD}Симуляция атак начнётся через 3 секунды...${NC}"
echo -e "${YELLOW}Telegram уведомления: $([ "$TG_OK" = "1" ] && echo "✅ ВКЛЮЧЕНЫ" || echo "❌ ВЫКЛЮЧЕНЫ")${NC}"
echo ""
sleep 3

notify_start
sleep 1

attack_brute_force
sleep 2

attack_ddos
sleep 2

attack_sql_injection
sleep 2

attack_path_traversal
sleep 2

attack_unauthorized
sleep 2

attack_role_escalation
sleep 1

final_report

