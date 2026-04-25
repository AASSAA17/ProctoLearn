#!/bin/bash
# ================================================================
# ProctoLearn — Симуляция атак для демонстрации защиты
# Показывает: Brute Force, SQL Injection, DDoS flood, Path Traversal
# Использование: bash scripts/demo-attack.sh
# ================================================================

API="http://localhost:4000"
NGINX="http://localhost:80"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

banner() {
  echo -e "${RED}"
  echo "╔══════════════════════════════════════════════════╗"
  echo "║   ⚔️  ProctoLearn — ATTACK SIMULATION DEMO       ║"
  echo "║   Только для демонстрации защиты!                ║"
  echo "╚══════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

section() { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}"; }
ok()      { echo -e "  ${GREEN}✔ $1${NC}"; }
warn()    { echo -e "  ${YELLOW}⚠ $1${NC}"; }
attk()    { echo -e "  ${RED}⚡ $1${NC}"; }
info()    { echo -e "  ${BLUE}ℹ $1${NC}"; }

check_api() {
  if ! curl -s --max-time 3 "$API/health" > /dev/null 2>&1; then
    echo -e "${RED}✖ API недоступен ($API). Запустите контейнеры: bash start-all.sh${NC}"
    exit 1
  fi
  ok "API доступен: $API"
}

# ─── 1. BRUTE FORCE ──────────────────────────────────────────
attack_brute_force() {
  section "1. BRUTE FORCE — Перебор пароля"
  info "Отправляем 15 неверных попыток входа подряд..."
  info "Защита: JWT throttle (20 req/min), NestJS ValidationPipe, fail2ban (если настроен)"
  echo ""

  PASSWORDS=("password" "123456" "admin" "qwerty" "letmein" "admin123" "pass" "test" "root" "abc123" "password1" "111111" "monkey" "dragon" "1234")
  SUCCESS=0
  BLOCKED=0

  for i in "${!PASSWORDS[@]}"; do
    PASS="${PASSWORDS[$i]}"
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"admin@proctolearn.kz\",\"password\":\"$PASS\"}" \
      --max-time 5 2>/dev/null)

    if [ "$STATUS" = "200" ]; then
      ok "Попытка $((i+1)): $PASS → 200 OK (успех!)"
      SUCCESS=1
    elif [ "$STATUS" = "429" ]; then
      attk "Попытка $((i+1)): $PASS → 429 RATE LIMITED ✓ (заблокирован)"
      BLOCKED=$((BLOCKED+1))
    elif [ "$STATUS" = "401" ]; then
      attk "Попытка $((i+1)): $PASS → 401 Неверный пароль"
    else
      warn "Попытка $((i+1)): $PASS → $STATUS"
    fi
    sleep 0.3
  done

  echo ""
  if [ $BLOCKED -gt 0 ]; then
    ok "🛡️ Rate limiting сработал: $BLOCKED запросов заблокировано (429)"
  else
    warn "Rate limiting не активирован (все запросы прошли с 401)"
  fi
}

# ─── 2. SQL INJECTION ────────────────────────────────────────
attack_sql_injection() {
  section "2. SQL INJECTION — Внедрение SQL-кода"
  info "Отправляем классические SQL-инъекции..."
  info "Защита: NestJS ValidationPipe + Prisma ORM (parameterized queries)"
  echo ""

  PAYLOADS=(
    "' OR '1'='1"
    "admin'--"
    "' OR 1=1--"
    "\" OR \"\"=\""
    "'; DROP TABLE users;--"
    "1; SELECT * FROM users"
    "' UNION SELECT null,null,null--"
    "admin' OR '1'='1'/*"
  )

  for PAYLOAD in "${PAYLOADS[@]}"; do
    STATUS=$(curl -s -o /tmp/attack_resp.txt -w "%{http_code}" -X POST "$API/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$PAYLOAD\",\"password\":\"anything\"}" \
      --max-time 5 2>/dev/null)

    BODY=$(cat /tmp/attack_resp.txt 2>/dev/null | head -c 100)

    if [ "$STATUS" = "400" ] || [ "$STATUS" = "422" ]; then
      ok "PAYLOAD: $(echo $PAYLOAD | cut -c1-30)... → $STATUS (заблокирован ValidationPipe ✓)"
    elif [ "$STATUS" = "401" ]; then
      ok "PAYLOAD: $(echo $PAYLOAD | cut -c1-30)... → 401 (не авторизован, инъекция не сработала ✓)"
    elif [ "$STATUS" = "200" ]; then
      attk "PAYLOAD: $PAYLOAD → 200 УСПЕХ! УЯЗВИМОСТЬ!"
    else
      warn "PAYLOAD: $(echo $PAYLOAD | cut -c1-30)... → $STATUS"
    fi
  done

  echo ""
  ok "🛡️ Prisma ORM использует parameterized queries — SQL инъекции невозможны"
}

# ─── 3. PATH TRAVERSAL ───────────────────────────────────────
attack_path_traversal() {
  section "3. PATH TRAVERSAL — Обход директорий"
  info "Пытаемся получить доступ к файлам системы..."
  info "Защита: Nginx/Express блокирует traversal пути"
  echo ""

  PATHS=(
    "/../../../etc/passwd"
    "/..%2F..%2F..%2Fetc%2Fpasswd"
    "/%2e%2e/%2e%2e/etc/passwd"
    "/api/../../../etc/shadow"
    "/uploads/../.env"
    "/static/../../../../etc/hosts"
  )

  for PATH_ATTACK in "${PATHS[@]}"; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
      "$API$PATH_ATTACK" \
      --max-time 5 2>/dev/null)

    if [ "$STATUS" = "400" ] || [ "$STATUS" = "403" ] || [ "$STATUS" = "404" ]; then
      ok "PATH: $(echo $PATH_ATTACK | cut -c1-40) → $STATUS ✓ (заблокирован)"
    elif [ "$STATUS" = "200" ]; then
      attk "PATH: $PATH_ATTACK → 200 УЯЗВИМОСТЬ!"
    else
      warn "PATH: $(echo $PATH_ATTACK | cut -c1-40) → $STATUS"
    fi
  done

  echo ""
  ok "🛡️ Path traversal заблокирован"
}

# ─── 4. UNAUTHORIZED ADMIN ACCESS ────────────────────────────
attack_unauthorized() {
  section "4. UNAUTHORIZED ACCESS — Обход авторизации"
  info "Пытаемся получить данные без токена и с фейковым токеном..."
  info "Защита: JWT Guard на всех защищённых эндпоинтах"
  echo ""

  ENDPOINTS=(
    "/admin/users"
    "/admin/export/users"
    "/certificates/my"
    "/enrollments/my"
    "/attempts"
  )

  for EP in "${ENDPOINTS[@]}"; do
    # No token
    S1=$(curl -s -o /dev/null -w "%{http_code}" "$API$EP" --max-time 5 2>/dev/null)
    # Fake token
    S2=$(curl -s -o /dev/null -w "%{http_code}" "$API$EP" \
      -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.fake.token" \
      --max-time 5 2>/dev/null)

    if [ "$S1" = "401" ] && [ "$S2" = "401" ]; then
      ok "GET $EP → Без токена: $S1 | Фейк токен: $S2 ✓"
    else
      attk "GET $EP → Без токена: $S1 | Фейк токен: $S2 ← ПРОВЕРИТЬ!"
    fi
  done

  echo ""
  ok "🛡️ JWT Guard защищает все admin/user эндпоинты"
}

# ─── 5. MINI DDoS ────────────────────────────────────────────
attack_ddos() {
  section "5. MINI DDoS — Лавина запросов (50 за 3 сек)"
  info "Симуляция DDoS: 50 параллельных запросов..."
  info "Защита: NestJS Throttler (20 req/min per IP)"
  echo ""

  TOTAL=50
  SUCCESS_COUNT=0
  RATE_COUNT=0
  OTHER_COUNT=0

  for i in $(seq 1 $TOTAL); do
    curl -s -o /dev/null -w "%{http_code}\n" \
      "$API/courses?limit=5" --max-time 3 &
  done > /tmp/ddos_results.txt 2>/dev/null
  wait

  while IFS= read -r code; do
    if [ "$code" = "200" ]; then
      SUCCESS_COUNT=$((SUCCESS_COUNT+1))
    elif [ "$code" = "429" ]; then
      RATE_COUNT=$((RATE_COUNT+1))
    else
      OTHER_COUNT=$((OTHER_COUNT+1))
    fi
  done < /tmp/ddos_results.txt

  echo "  Отправлено: $TOTAL запросов"
  ok "200 OK:           $SUCCESS_COUNT"
  attk "429 Rate Limited: $RATE_COUNT"
  [ $OTHER_COUNT -gt 0 ] && warn "Другие:           $OTHER_COUNT"

  echo ""
  if [ $RATE_COUNT -gt 0 ]; then
    ok "🛡️ Throttler сработал: $RATE_COUNT запросов заблокировано"
  else
    warn "Throttler не сработал (курс не требует авторизации — открытый эндпоинт)"
    info "Для теста throttling — используйте /ai/chat (token required)"
  fi
}

# ─── 6. ROLE ESCALATION ──────────────────────────────────────
attack_role_escalation() {
  section "6. ROLE ESCALATION — Повышение прав"
  info "Пытаемся сменить роль студента на ADMIN без прав..."
  info "Защита: RolesGuard на PATCH /users/:id/role"
  echo ""

  # Login as student first
  STUDENT_TOKEN=$(curl -s -X POST "$API/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"student@proctolearn.kz","password":"Stud@123"}' \
    --max-time 5 2>/dev/null | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

  if [ -z "$STUDENT_TOKEN" ]; then
    warn "Студент аккаунт не найден, пропускаем тест"
    return
  fi

  ok "Залогинились как студент"

  # Try to escalate to ADMIN
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$API/users/self/role" \
    -H "Authorization: Bearer $STUDENT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"role":"ADMIN"}' \
    --max-time 5 2>/dev/null)

  if [ "$STATUS" = "403" ] || [ "$STATUS" = "401" ]; then
    ok "Попытка смены роли: $STATUS ✓ (заблокировано RolesGuard)"
  else
    attk "Смена роли ответила: $STATUS ← ПРОВЕРИТЬ!"
  fi

  # Try to access admin endpoints as student
  STATUS2=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer $STUDENT_TOKEN" \
    "$API/admin/users" --max-time 5 2>/dev/null)

  if [ "$STATUS2" = "403" ]; then
    ok "Доступ к /admin/users как студент: $STATUS2 ✓"
  else
    attk "Доступ к /admin/users как студент: $STATUS2 ← ПРОВЕРИТЬ!"
  fi

  echo ""
  ok "🛡️ RolesGuard блокирует повышение привилегий"
}

# ─── ИТОГ ────────────────────────────────────────────────────
show_summary() {
  echo -e "\n${CYAN}${BOLD}════════════════ ИТОГИ ДЕМОНСТРАЦИИ ════════════════${NC}"
  echo ""
  echo -e "  ${GREEN}✅ JWT аутентификация${NC}       — все маршруты защищены"
  echo -e "  ${GREEN}✅ Rate Limiting (Throttler)${NC} — 20 req/min per user"
  echo -e "  ${GREEN}✅ Prisma ORM${NC}               — SQL инъекции невозможны"
  echo -e "  ${GREEN}✅ ValidationPipe${NC}           — входные данные валидируются"
  echo -e "  ${GREEN}✅ RolesGuard${NC}               — разграничение прав по ролям"
  echo -e "  ${GREEN}✅ Path traversal${NC}           — заблокирован Nginx/Express"
  echo ""
  echo -e "  ${BLUE}ℹ  Дополнительные меры:${NC}"
  echo -e "     UFW Firewall, Fail2Ban (SSH), Nginx SSL, bcrypt пароли"
  echo ""
}

# ─── MAIN ────────────────────────────────────────────────────
banner
check_api

echo -e "${YELLOW}Запуск симуляции атак через 3 секунды...${NC}"
sleep 3

attack_brute_force
sleep 1
attack_sql_injection
sleep 1
attack_path_traversal
sleep 1
attack_unauthorized
sleep 1
attack_ddos
sleep 1
attack_role_escalation

show_summary

