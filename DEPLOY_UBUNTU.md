# Развёртывание ProctoLearn на Ubuntu (VirtualBox)

## Содержание

1. [Установка Docker](#1-установка-docker)
2. [Установка Nginx](#2-установка-nginx)
3. [SSL-сертификат](#3-ssl-сертификат-self-signed)
4. [Подключение конфига Nginx](#4-подключение-конфига-nginx)
5. [Настройка SSH](#5-настройка-ssh)
6. [Firewall (UFW)](#6-firewall-ufw)
7. [Fail2Ban](#7-fail2ban)
8. [Запуск проекта](#8-запуск-проекта)
9. [Настройка PostgreSQL](#9-настройка-postgresql)
10. [Автоматический бэкап](#10-автоматический-бэкап)
11. [Проверка](#11-проверка)

---

## Подготовка — скопировать проект на Ubuntu

На **Windows** в PowerShell (узнай IP своей Ubuntu в VirtualBox):
```powershell
scp -r C:\Users\user\ProctoLearn user@192.168.1.XXX:/home/user/ProctoLearn
```

Или через Git:
```bash
git clone https://github.com/AASSAA17/ProctoLearn.git /home/user/ProctoLearn
```

---

## 1. Установка Docker

```bash
sudo apt update && sudo apt upgrade -y

sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Запуск docker без sudo
sudo usermod -aG docker $USER
newgrp docker

# Проверка
docker --version
docker compose version
```

---

## 2. Установка Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 3. SSL-сертификат (Self-signed)

```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/proctolearn.key \
  -out /etc/ssl/certs/proctolearn.crt \
  -subj "/CN=proctolearn.local"
```

---

## 4. Подключение конфига Nginx

Конфиг уже находится в проекте по пути `nginx/proctolearn.conf`.

```bash
sudo cp /home/user/ProctoLearn/nginx/proctolearn.conf \
  /etc/nginx/sites-available/proctolearn

sudo ln -s /etc/nginx/sites-available/proctolearn \
  /etc/nginx/sites-enabled/

# Удалить дефолтный сайт
sudo rm -f /etc/nginx/sites-enabled/default

# Проверка конфига и перезапуск
sudo nginx -t
sudo systemctl reload nginx
```

Конфиг настраивает:
- Редирект HTTP → HTTPS
- SSL-терминацию
- Reverse Proxy: `/` → Frontend `:3000`, `/api` → Backend `:4000`, `/socket.io` → WebSocket `:4000`

---

## 5. Настройка SSH

### Генерация ключа (на Windows в PowerShell)

```powershell
ssh-keygen -t ed25519 -C "proctolearn"
# Ключи сохранятся в C:\Users\user\.ssh\
```

### Копирование ключа на Ubuntu

```powershell
ssh-copy-id user@192.168.1.XXX
```

### Настройка SSH-демона на Ubuntu

Открыть файл:
```bash
sudo nano /etc/ssh/sshd_config
```

Найти и изменить / добавить эти строки:
```
Port 2222
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
ClientAliveInterval 300
ClientAliveCountMax 2
```

Применить:
```bash
sudo systemctl restart sshd
```

> Теперь подключение: `ssh -p 2222 user@192.168.1.XXX`

---

## 6. Firewall (UFW)

```bash
sudo apt install -y ufw

# Политика по умолчанию
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Открыть только нужные порты
sudo ufw allow 2222/tcp    # SSH (новый порт)
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS

# Включить
sudo ufw enable

# Проверка
sudo ufw status verbose
```

> PostgreSQL (:5432), MinIO (:9000-9001), API (:4000), Frontend (:3000) — доступны **только локально** (127.0.0.1), благодаря настройке в `docker-compose.yml`.

---

## 7. Fail2Ban

```bash
sudo apt install -y fail2ban
```

Создать конфиг:
```bash
sudo tee /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 5

[sshd]
enabled  = true
port     = 2222
logpath  = /var/log/auth.log
maxretry = 3

[nginx-http-auth]
enabled  = true
port     = http,https
logpath  = /var/log/nginx/error.log

[nginx-limit-req]
enabled  = true
port     = http,https
logpath  = /var/log/nginx/error.log
maxretry = 10
EOF
```

```bash
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Проверка
sudo fail2ban-client status
sudo fail2ban-client status sshd
```

---

## 8. Запуск проекта

```bash
cd /home/user/ProctoLearn

# Создать .env из примера
cp .env.example .env
nano .env
```

Заполнить в `.env`:
```dotenv
POSTGRES_USER=postgres
POSTGRES_PASSWORD=СильныйПароль123!
POSTGRES_DB=proctolearn_db

DATABASE_URL=postgresql://postgres:СильныйПароль123!@postgres:5432/proctolearn_db

JWT_ACCESS_SECRET=замени-на-случайную-строку-32-символа
JWT_REFRESH_SECRET=замени-на-другую-случайную-строку

MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=СильныйПарольMinio123!
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_BUCKET=proctolearn-evidence

API_PORT=4000
NODE_ENV=production

NEXT_PUBLIC_API_URL=https://localhost/api
NEXT_PUBLIC_WS_URL=wss://localhost
```

Защитить `.env`:
```bash
chmod 600 .env
```

Запустить:
```bash
# Сборка и запуск всех контейнеров
docker compose up -d --build

# Следить за логами
docker compose logs -f

# Когда всё запустилось — применить схему БД и заполнить данными
docker compose exec api npx prisma db push
docker compose exec api npx ts-node prisma/seed.ts
docker compose exec api npx ts-node prisma/set-course-levels.ts

# Статус контейнеров
docker compose ps
```

### Лимиты ресурсов контейнеров (уже настроены в docker-compose.yml)

| Контейнер | CPU | RAM |
|-----------|-----|-----|
| postgres  | 0.5 | 512M |
| minio     | 0.5 | 256M |
| api       | 1.0 | 512M |
| web       | 1.0 | 512M |

---

## 9. Настройка PostgreSQL

### Создание пользователей и привилегий

```bash
docker exec -it proctolearn_postgres psql -U postgres -d proctolearn_db
```

```sql
-- Пользователь только для чтения (аналитика)
CREATE USER readonly_user WITH PASSWORD 'ReadOnly123!';
GRANT CONNECT ON DATABASE proctolearn_db TO readonly_user;
GRANT USAGE ON SCHEMA public TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;

-- Права для основного пользователя
GRANT ALL PRIVILEGES ON DATABASE proctolearn_db TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;

\q
```

### Разрешение удалённых подключений (pg_hba.conf)

```bash
docker exec -it proctolearn_postgres bash
```

```bash
# Внутри контейнера
echo "host proctolearn_db postgres 192.168.1.0/24 md5" >> \
  /var/lib/postgresql/data/pg_hba.conf
```

```bash
# Перезапустить postgres
exit
docker compose restart postgres
```

---

## 10. Автоматический бэкап

Скрипт уже находится в проекте: `scripts/backup.sh`

```bash
# Сделать исполняемым
chmod +x /home/user/ProctoLearn/scripts/backup.sh

# Тестовый запуск
/home/user/ProctoLearn/scripts/backup.sh

# Добавить в cron — каждый день в 2:00
(crontab -l 2>/dev/null; echo "0 2 * * * /home/user/ProctoLearn/scripts/backup.sh >> /var/log/proctolearn-backup.log 2>&1") | crontab -

# Проверить cron
crontab -l
```

Бэкапы сохраняются в `/home/user/backups/proctolearn/`, хранятся 7 дней.

---

## 11. Проверка

```bash
# Сайт доступен
curl -k https://localhost
curl -k https://localhost/api/docs-json

# Контейнеры запущены
docker compose ps

# Firewall
sudo ufw status

# Fail2Ban
sudo fail2ban-client status

# Nginx
sudo systemctl status nginx

# Использование ресурсов контейнерами
docker stats --no-stream

# Посмотреть бэкапы
ls -lh /home/user/backups/proctolearn/
```

---

## Архитектура

```
Internet
    │
[UFW] — разрешены: 80, 443, 2222
    │
[Nginx] — SSL, Reverse Proxy
    ├── /          → Frontend  (Docker 127.0.0.1:3000)
    ├── /api       → Backend   (Docker 127.0.0.1:4000)
    └── /socket.io → WebSocket (Docker 127.0.0.1:4000)
                         │
                   [PostgreSQL] (Docker 127.0.0.1:5432)
                   [MinIO]      (Docker 127.0.0.1:9000)
```
