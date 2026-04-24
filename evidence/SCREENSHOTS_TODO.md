# 📸 СКРИНШОТЫ — ЧТО НУЖНО СДЕЛАТЬ ВРУЧНУЮ

> Все текстовые доказательства уже собраны. Остались только скриншоты.

---

## Модуль 1 — ОС (нужен 1 скриншот)
- [ ] `evidence/01-os/vm_screenshot.png`
  - Открой VirtualBox → запущенная VM "arsen-VirtualBox"
  - Сделай скриншот окна VirtualBox с видимой VM

---

## Модуль 2 — Безопасность (нужны 2 скриншота)
- [ ] `evidence/02-security-network/ssh_connection_screenshot.png`
  - Открой терминал → `ssh -p 2222 arsen@localhost`
  - Скриншот успешного подключения с banner-ом

- [ ] `evidence/02-security-network/ufw_fail2ban_screenshot.png`
  - `sudo ufw status verbose` → скриншот
  - `sudo fail2ban-client status sshd` → скриншот

---

## Модуль 3 — БД (нужен 1 скриншот)
- [ ] `evidence/03-database/pgadmin_screenshot.png`
  - Открой браузер → http://localhost:5050
  - Логин: admin@example.com / admin
  - Подключись к серверу proctolearn_postgres
  - Скриншот с видимыми таблицами

---

## Модуль 4 — Приложение (нужны 4 скриншота)
- [ ] `evidence/04-app/frontend_main_screenshot.png`
  - http://localhost:3001 → главная страница

- [ ] `evidence/04-app/swagger_screenshot.png`
  - http://localhost:4000/api/docs → Swagger UI со списком endpoints
  
- [ ] `evidence/04-app/dashboard_screenshot.png`
  - Войди в систему → dashboard студента или преподавателя

- [ ] `evidence/04-app/network_tab_screenshot.png`
  - F12 → Network tab → любой API запрос (например загрузка курсов)
  - Скриншот с видимым запросом и ответом JSON

---

## Модуль 7 — Наблюдаемость (нужны 3-4 скриншота)
- [ ] `evidence/07-observability/grafana_dashboard_screenshot.png`
  - http://localhost:3000 → логин admin/admin
  - Dashboards → Node Exporter Full → скриншот метрик

- [ ] `evidence/07-observability/alertmanager_screenshot.png`
  - http://localhost:9093 → скриншот UI Alertmanager
  - Если нет алертов: http://localhost:9093/#/alerts

- [ ] `evidence/07-observability/jenkins_build_screenshot.png`
  - http://localhost:8088 → Jenkins
  - Создай pipeline из Jenkinsfile
  - Скриншот успешного build (зелёный)

- [ ] `evidence/07-observability/telegram_bot_screenshot.png`
  - Создай бота через @BotFather → получи TOKEN
  - Замени `__TELEGRAM_BOT_TOKEN__` в monitoring-project/alertmanager/alertmanager.yml
  - `docker compose -f monitoring-project/docker-compose.yml restart`
  - Напиши `/status` боту → скриншот ответа

---

## Модуль 8 — ИИ-слой (нужен 1 скриншот)
- [ ] `evidence/08-ai-layer/n8n_workflow_screenshot.png`
  - http://localhost:5678 → n8n
  - Импортируй n8n/workflows/exam-submit-notify.json
  - Активируй → скриншот активного workflow

---

## ✅ ЧТО УЖЕ ЕСТЬ (текстовые доказательства)

| Модуль | Файлы |
|--------|-------|
| 01-OS | os_info.txt (uname, lsb_release, df, free, ip addr) |
| 02-Security | ssh_hardening (port 2222, key auth, no root), UFW rules, Fail2Ban sshd, backup_run, ssl_evidence |
| 03-Database | db_full_counts (users=1110, courses=137, exams=137, questions=685), pg_hba.conf |
| 04-App | api_complete_evidence (61 endpoints, health=ok, swagger=200) |
| 05-Docker | docker_full_evidence (33 containers running) |
| 06-Git | git_log (commits history) |
| 07-Observability | monitoring_final_status (Prometheus+Grafana+Alertmanager healthy) |
| 08-AI Layer | ai_layer_evidence (n8n+OPAL+OPA running, webhook test) |
| 09-IaC | terraform_plan_final (no changes, 9 resources), ansible_play_recap (ok=18, failed=0) |

