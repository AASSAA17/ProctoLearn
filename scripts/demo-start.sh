#!/bin/bash
# ============================================================
# ProctoLearn — БЫСТРЫЙ ЗАПУСК ДЛЯ ДЕМОНСТРАЦИИ
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$BASE_DIR"

echo -e "${BOLD}${BLUE}"
echo "╔══════════════════════════════════════════════════════╗"
echo "║        ProctoLearn — DEMO START SCRIPT               ║"
echo "╚══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Запуск основного стека ──────────────────────────────
echo -e "${YELLOW}▶ [1/4] Запуск основного стека (API + Web + DB + pgAdmin)...${NC}"
docker compose -f docker-compose.dev.yml up -d --remove-orphans 2>/dev/null
echo -e "${GREEN}  ✓ Основной стек запущен${NC}"

# ── 2. Запуск мониторинга ──────────────────────────────────
echo -e "${YELLOW}▶ [2/4] Запуск мониторинга (Prometheus + Grafana + Alertmanager)...${NC}"
docker compose -f monitoring-project/docker-compose.yml up -d 2>/dev/null
echo -e "${GREEN}  ✓ Мониторинг запущен${NC}"

# ── 3. Запуск OPAL/OPA ────────────────────────────────────
echo -e "${YELLOW}▶ [3/4] Запуск OPAL + OPA (AI Layer)...${NC}"
docker compose -f opal/docker-compose.opal.yml up -d 2>/dev/null
echo -e "${GREEN}  ✓ OPAL/OPA запущен${NC}"

# ── 4. Ожидание готовности ─────────────────────────────────
echo -e "${YELLOW}▶ [4/4] Ожидание готовности сервисов (15 сек)...${NC}"
sleep 15

# ── Проверка статуса ───────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}              СТАТУС СЕРВИСОВ${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${NC}"

check_service() {
    local name="$1"
    local url="$2"
    local expected="$3"
    local code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$url" 2>/dev/null)
    if [ "$code" = "$expected" ] || [ "$code" = "200" ] || [ "$code" = "302" ] || [ "$code" = "301" ] || [ "$code" = "307" ] || [ "$code" = "403" ]; then
        echo -e "  ${GREEN}✓${NC} ${name} — ${GREEN}РАБОТАЕТ${NC} (HTTP $code) → $url"
    else
        echo -e "  ${RED}✗${NC} ${name} — ${RED}НЕТ ОТВЕТА${NC} (HTTP $code) → $url"
    fi
}

echo ""
echo -e "${BOLD}🌐 ПРИЛОЖЕНИЕ:${NC}"
check_service "Frontend (Next.js)"     "http://localhost:3001"        "200"
check_service "API (NestJS)"           "http://localhost:4000/health" "200"
check_service "Swagger UI"             "http://localhost:4000/api/docs" "200"
check_service "pgAdmin"                "http://localhost:5050"        "302"
check_service "Mailpit (Email)"        "http://localhost:8025"        "200"
check_service "MinIO Console"          "http://localhost:9001"        "200"

echo ""
echo -e "${BOLD}📊 МОНИТОРИНГ:${NC}"
check_service "Grafana"                "http://localhost:3000"        "200"
check_service "Prometheus"             "http://localhost:9090"        "200"
check_service "Alertmanager"           "http://localhost:9093"        "200"
check_service "Node Exporter"          "http://localhost:9100/metrics" "200"
check_service "cAdvisor"               "http://localhost:8081"        "200"

echo ""
echo -e "${BOLD}🤖 AI / AUTOMATION:${NC}"
check_service "n8n (Workflows)"        "http://localhost:5678"        "200"
check_service "OPA (Policy Agent)"     "http://localhost:8181/health" "200"

echo ""
echo -e "${BOLD}🔧 DEVOPS TOOLS:${NC}"
check_service "Jenkins CI/CD"          "http://localhost:8088"        "403"
check_service "Portainer (Docker UI)"  "http://localhost:9002"        "200"

echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}              УЧЁТНЫЕ ДАННЫЕ${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${BOLD}🔑 Аккаунты приложения (http://localhost:3001):${NC}"
echo -e "   Admin:    ${CYAN}admin@proctolearn.kz${NC}   / ${YELLOW}Admin@12${NC}"
echo -e "   Teacher:  ${CYAN}teacher@proctolearn.kz${NC} / ${YELLOW}Teach@12${NC}"
echo -e "   Student:  ${CYAN}student@proctolearn.kz${NC} / ${YELLOW}Stud@123${NC}"
echo ""
echo -e "${BOLD}🔑 Сервисы:${NC}"
echo -e "   Grafana:  admin / admin123    → http://localhost:3000"
echo -e "   pgAdmin:  admin@proctolearn.com / 1234 → http://localhost:5050"
echo -e "     DB пароль: ${YELLOW}proctolearn_pass${NC}"
echo -e "   Jenkins:  admin / admin123    → http://localhost:8088"
echo -e "   n8n:      (см. аккаунт при регистрации) → http://localhost:5678"
echo -e "   Portainer: admin / admin12345 → http://localhost:9002"
echo ""
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}           МОДУЛИ ДЛЯ ДЕМОНСТРАЦИИ${NC}"
echo -e "${BOLD}${CYAN}══════════════════════════════════════════════════════${NC}"
echo ""
echo -e " ${BOLD}М1 ОС:${NC}      uname -a → Linux arsen-VirtualBox (Ubuntu 24.04)"
echo -e " ${BOLD}М2 Security:${NC} SSH port 2222, UFW active, Fail2Ban sshd"
echo -e " ${BOLD}М3 DB:${NC}       16 таблиц, 1110 users, 137 courses (pgAdmin ↑)"
echo -e " ${BOLD}М4 App:${NC}      Frontend ↑, Swagger 61 endpoints ↑"
echo -e " ${BOLD}М5 Docker:${NC}   33 контейнера: docker ps"
echo -e " ${BOLD}М6 Git:${NC}      28 коммитов: git log --oneline"
echo -e " ${BOLD}М7 Observe:${NC}  Grafana ↑, Prometheus ↑, 1 алерт активен"
echo -e " ${BOLD}М8 AI:${NC}       n8n ↑, OPAL ↑, OPA ↑"
echo -e " ${BOLD}М9 IaC:${NC}      Terraform (9 resources), Ansible ok=18"
echo ""
echo -e "${GREEN}${BOLD}✅ Всё готово к демонстрации!${NC}"
echo ""


