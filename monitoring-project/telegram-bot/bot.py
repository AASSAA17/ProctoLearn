import json
import os
import urllib.parse
from datetime import datetime, timedelta, timezone

import requests
from telegram import BotCommand, Update
from telegram.ext import Application, CommandHandler, ContextTypes

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
DEFAULT_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
PROM_URL = os.getenv("PROM_URL", "http://prometheus:9090").rstrip("/")
STATUS_INTERVAL_MINUTES = int(os.getenv("STATUS_INTERVAL_MINUTES", "30"))


def prom_query(query: str) -> float:
    resp = requests.get(f"{PROM_URL}/api/v1/query", params={"query": query}, timeout=10)
    resp.raise_for_status()
    payload = resp.json()
    result = payload.get("data", {}).get("result", [])
    if not result:
        return 0.0
    return float(result[0]["value"][1])


def get_targets():
    resp = requests.get(f"{PROM_URL}/api/v1/targets", timeout=10)
    resp.raise_for_status()
    return resp.json().get("data", {}).get("activeTargets", [])


def level_icon(value: float) -> str:
    if value >= 90:
        return "🔴"
    if value >= 75:
        return "🟠"
    return "🟢"


def system_status_text() -> str:
    cpu = prom_query('100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)')
    ram = prom_query('(1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100')
    disk = prom_query('100 * (1 - (node_filesystem_avail_bytes{mountpoint="/",fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes{mountpoint="/",fstype!~"tmpfs|overlay"}))')
    backend_up = prom_query('up{job="proctolearn_api"}')
    nginx_up = prom_query('up{job="nginx"}')

    overall = "✅ Все системы в норме"
    if cpu >= 90 or ram >= 90 or disk >= 90 or backend_up < 1:
        overall = "🚨 Нужна проверка системы"

    return (
        "<b>🧠 ProctoLearn Monitor</b>\n"
        f"🕒 <b>Time:</b> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"{level_icon(cpu)} <b>CPU:</b> {cpu:.1f}%\n"
        f"{level_icon(ram)} <b>RAM:</b> {ram:.1f}%\n"
        f"{level_icon(disk)} <b>DISK:</b> {disk:.1f}%\n\n"
        f"🐳 <b>Контейнеры:</b> {'OK' if backend_up >= 1 and nginx_up >= 1 else 'Need check'}\n"
        f"🌐 <b>Backend API:</b> {'Healthy' if backend_up >= 1 else 'Down'}\n"
        "━━━━━━━━━━━━━━━━━━\n"
        f"{overall}"
    )


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        ""
        "🤖 <b>ProctoLearn Monitor Bot</b>\n\n"
        "Готов к работе. Команды:\n"
        "/status - общий статус системы\n"
        "/graph - график CPU\n"
        "/containers - состояние сервисов\n"
        "/start - показать это меню\n"
        "\nНажмите команду или отправьте вручную.",
        parse_mode="HTML",
    )


async def status(update: Update, context: ContextTypes.DEFAULT_TYPE):
    text = system_status_text()
    await update.message.reply_text(text, parse_mode="HTML")


async def containers(update: Update, context: ContextTypes.DEFAULT_TYPE):
    targets = get_targets()
    lines = ["<b>🐳 Targets status</b>"]
    for t in sorted(targets, key=lambda x: x.get("labels", {}).get("job", "")):
        job = t.get("labels", {}).get("job", "unknown")
        health = t.get("health", "unknown")
        instance = t.get("labels", {}).get("instance", "")
        icon = "🟢" if health == "up" else "🔴"
        lines.append(f"{icon} <b>{job}</b> ({instance})")
    await update.message.reply_text("\n".join(lines), parse_mode="HTML")


def graph_url() -> str:
    end = datetime.now(timezone.utc)
    start = end - timedelta(hours=1)
    q = '100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)'

    resp = requests.get(
        f"{PROM_URL}/api/v1/query_range",
        params={
            "query": q,
            "start": start.isoformat(),
            "end": end.isoformat(),
            "step": "60s",
        },
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json().get("data", {}).get("result", [])
    if not data:
        raise RuntimeError("No data for graph")

    values = [round(float(v[1]), 2) for v in data[0].get("values", [])]
    labels = [""] * len(values)

    chart_config = {
        "type": "line",
        "data": {
            "labels": labels,
            "datasets": [
                {
                    "label": "CPU %",
                    "data": values,
                    "borderColor": "#ff5a5f",
                    "backgroundColor": "rgba(255, 90, 95, 0.2)",
                    "fill": True,
                    "tension": 0.35,
                }
            ],
        },
        "options": {
            "plugins": {"title": {"display": True, "text": "CPU Basic"}},
            "scales": {"y": {"min": 0, "max": 100}},
        },
    }

    encoded = urllib.parse.quote(json.dumps(chart_config))
    return f"https://quickchart.io/chart?width=900&height=380&c={encoded}"


async def graph(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        await update.message.reply_photo(photo=graph_url(), caption="📈 CPU график (last 1h)")
    except Exception:
        await update.message.reply_text("Графикті алу мүмкін болмады. /status командасын қолданыңыз.")


async def scheduled_status(context: ContextTypes.DEFAULT_TYPE):
    if not DEFAULT_CHAT_ID:
        return
    try:
        await context.bot.send_message(chat_id=DEFAULT_CHAT_ID, text=system_status_text(), parse_mode="HTML")
    except Exception:
        pass


async def on_startup(app: Application):
    await app.bot.set_my_commands(
        [
            BotCommand("start", "Запуск бота"),
            BotCommand("status", "Общий статус системы"),
            BotCommand("graph", "График CPU"),
            BotCommand("containers", "Состояние сервисов"),
        ]
    )


def _run_demo_mode():
    """Run a simple HTTP health server when Telegram token is not configured."""
    import http.server
    import threading

    print("⚠️  TELEGRAM_BOT_TOKEN not configured - running in DEMO mode")
    print("   To activate Telegram bot: set TELEGRAM_BOT_TOKEN in .env")
    print("✅ Health server running on port 5001")

    class HealthHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path in ("/", "/health"):
                body = b'{"status":"demo","message":"Telegram bot not configured"}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(404)
                self.end_headers()

        def do_POST(self):
            # Accept alertmanager webhooks in demo mode
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
                print(f"[ALERT] {datetime.now()} - {data.get('status','?')} - {len(data.get('alerts',[]))} alerts")
            except Exception:
                pass
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"ok":true}')

        def log_message(self, format, *args):
            pass  # suppress access logs

    server = http.server.HTTPServer(("0.0.0.0", 5001), HealthHandler)
    server.serve_forever()


def main():
    if not BOT_TOKEN or BOT_TOKEN in ("YOUR_BOT_TOKEN_HERE", ""):
        _run_demo_mode()
        return

    try:
        app = Application.builder().token(BOT_TOKEN).post_init(on_startup).build()
        app.add_handler(CommandHandler("start", start))
        app.add_handler(CommandHandler("status", status))
        app.add_handler(CommandHandler("graph", graph))
        app.add_handler(CommandHandler("containers", containers))

        if DEFAULT_CHAT_ID:
            app.job_queue.run_repeating(scheduled_status, interval=STATUS_INTERVAL_MINUTES * 60, first=90)

        app.run_polling(drop_pending_updates=True)
    except Exception as e:
        print(f"⚠️  Telegram bot startup failed: {e}")
        print("   Falling back to demo mode...")
        _run_demo_mode()


if __name__ == "__main__":
    main()
