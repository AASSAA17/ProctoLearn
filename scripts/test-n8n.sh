#!/bin/bash
# ============================================================
# ProctoLearn — тест n8n workflow
# Использование:
#   1. Открой http://localhost:5678 и нажми "Execute workflow"
#   2. СРАЗУ запусти: bash scripts/test-n8n.sh
# ============================================================
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
# Выбор режима: test (после нажатия Execute) или prod (после Publish)
MODE="${1:-prod}"
if [ "$MODE" = "test" ]; then
  URL="http://localhost:5678/webhook-test/proctolearn/exam-submit"
  echo -e "${YELLOW}⚠️  TEST режим — сначала нажми 'Execute workflow' в n8n!${NC}"
else
  URL="http://localhost:5678/webhook/proctolearn/exam-submit"
  echo -e "${GREEN}✓  PROD режим — workflow должен быть активен (Publish)${NC}"
fi
echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════${NC}"
echo -e "${BOLD}     🧪 ТЕСТ 1: HIGH RISK (trustScore=20)${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════${NC}"
RESP1=$(curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '{
    "studentEmail": "student@proctolearn.kz",
    "studentName": "Арсен Тестов",
    "examTitle": "DevOps Final Exam",
    "score": 85,
    "trustScore": 20,
    "attemptId": "att_highrisk_001",
    "examId": "exam_devops_01",
    "proctorEmail": "proctor@proctolearn.kz",
    "submittedAt": "2026-04-24T17:00:00Z"
  }')
echo -e "${GREEN}Response:${NC} $RESP1" | python3 -m json.tool 2>/dev/null || echo "$RESP1"
sleep 2
echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════${NC}"
echo -e "${BOLD}     🧪 ТЕСТ 2: PASSED + LOW RISK (score=90)${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════${NC}"
RESP2=$(curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '{
    "studentEmail": "winner@proctolearn.kz",
    "studentName": "Айгерим Смайлова",
    "examTitle": "Linux Administration",
    "score": 92,
    "trustScore": 95,
    "attemptId": "att_pass_002",
    "examId": "exam_linux_01",
    "proctorEmail": "proctor@proctolearn.kz",
    "submittedAt": "2026-04-24T17:05:00Z"
  }')
echo -e "${GREEN}Response:${NC} $RESP2" | python3 -m json.tool 2>/dev/null || echo "$RESP2"
sleep 2
echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════${NC}"
echo -e "${BOLD}     🧪 ТЕСТ 3: FAILED + MEDIUM RISK (score=45)${NC}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════${NC}"
RESP3=$(curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -d '{
    "studentEmail": "retry@proctolearn.kz",
    "studentName": "Данияр Ахметов",
    "examTitle": "Docker & Kubernetes",
    "score": 45,
    "trustScore": 55,
    "attemptId": "att_fail_003",
    "examId": "exam_docker_01",
    "proctorEmail": "proctor@proctolearn.kz",
    "submittedAt": "2026-04-24T17:10:00Z"
  }')
echo -e "${GREEN}Response:${NC} $RESP3" | python3 -m json.tool 2>/dev/null || echo "$RESP3"
echo ""
echo -e "${GREEN}${BOLD}✅ Все 3 теста отправлены! Смотри в n8n Executions.${NC}"
echo -e "   http://localhost:5678 → вкладка ${CYAN}Executions${NC}"
