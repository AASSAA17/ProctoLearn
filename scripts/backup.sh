#!/bin/bash

# ============================================
# ProctoLearn — Автоматическое резервное копирование
# Запуск: /home/user/ProctoLearn/scripts/backup.sh
# Cron: 0 2 * * * /home/user/ProctoLearn/scripts/backup.sh
# ============================================

BACKUP_DIR="/home/user/backups/proctolearn"
PROJECT_DIR="/home/user/ProctoLearn"
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
DB_CONTAINER="proctolearn_postgres"
DB_NAME="${POSTGRES_DB:-proctolearn_db}"
DB_USER="${POSTGRES_USER:-postgres}"
KEEP_DAYS=7

# --- Создаём папку для бэкапов ---
mkdir -p "$BACKUP_DIR"

echo "=========================================="
echo "[$DATE] Начало резервного копирования..."
echo "=========================================="

# --- 1. Дамп PostgreSQL ---
echo "📦 Создание дампа БД..."
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | \
    gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

if [ $? -eq 0 ]; then
    echo "✅ БД сохранена: $BACKUP_DIR/db_$DATE.sql.gz"
else
    echo "❌ Ошибка при создании дампа БД!"
    exit 1
fi

# --- 2. Бэкап загруженных файлов ---
if [ -d "$PROJECT_DIR/backend/uploads" ]; then
    echo "📦 Архивирование uploads..."
    tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" \
        -C "$PROJECT_DIR/backend" uploads/
    echo "✅ Uploads сохранены: uploads_$DATE.tar.gz"
fi

# --- 3. Бэкап .env файла ---
cp "$PROJECT_DIR/.env" "$BACKUP_DIR/env_$DATE.bak"
echo "✅ .env сохранён: env_$DATE.bak"

# --- 4. Удаляем старые бэкапы ---
echo "🗑️  Удаление бэкапов старше $KEEP_DAYS дней..."
find "$BACKUP_DIR" -name "*.gz" -mtime +$KEEP_DAYS -delete
find "$BACKUP_DIR" -name "*.bak" -mtime +$KEEP_DAYS -delete

# --- 5. Итог ---
echo ""
echo "=========================================="
echo "✅ Резервное копирование завершено!"
echo "📁 Папка: $BACKUP_DIR"
du -sh "$BACKUP_DIR"
echo "=========================================="
