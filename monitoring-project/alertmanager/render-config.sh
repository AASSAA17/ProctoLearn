#!/bin/sh
# Values must be single-line Telegram identifiers, not arbitrary YAML/sed input.
set -eu
: "${TELEGRAM_BOT_TOKEN:?Set a rotated private Telegram bot token}"
: "${TELEGRAM_CHAT_ID:?Set a private Telegram chat ID}"
case "$TELEGRAM_BOT_TOKEN" in
  *[!0-9A-Za-z_:-]*) echo 'Invalid Telegram token format' >&2; exit 1 ;;
esac
if ! printf '%s' "$TELEGRAM_BOT_TOKEN" | grep -Eq '^[0-9]+:[A-Za-z0-9_-]+$'; then
  echo 'Invalid Telegram token format' >&2
  exit 1
fi
case "$TELEGRAM_CHAT_ID" in
  *[!0-9-]*) echo 'Invalid Telegram chat ID' >&2; exit 1 ;;
esac
if ! printf '%s' "$TELEGRAM_CHAT_ID" | grep -Eq '^-?[1-9][0-9]*$'; then
  echo 'Invalid Telegram chat ID' >&2
  exit 1
fi
umask 077
destination=${2:-/tmp/alertmanager.yml}
temporary=$(mktemp "${destination}.XXXXXX")
trap 'rm -f "$temporary"' EXIT HUP INT TERM
sed -e "s|__TELEGRAM_BOT_TOKEN__|$TELEGRAM_BOT_TOKEN|g" \
    -e "s|__TELEGRAM_CHAT_ID__|$TELEGRAM_CHAT_ID|g" "${1:-/etc/alertmanager/alertmanager.yml}" > "$temporary"
mv "$temporary" "$destination"
