#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <host> <user> [port] [identity_file]"
  exit 1
fi

HOST="$1"
USER="$2"
PORT="${3:-2222}"
IDENTITY_FILE="${4:-$HOME/.ssh/id_ed25519}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP="$(date +"%Y-%m-%d_%H-%M-%S")"
DEST_DIR="$PROJECT_ROOT/evidence/02-security-network"
DEST_FILE="$DEST_DIR/security_audit_${TIMESTAMP}.txt"

mkdir -p "$DEST_DIR"

{
  echo "ProctoLearn Security Evidence"
  echo "Generated at: $(date -Iseconds)"
  echo "Target: ${USER}@${HOST}:${PORT}"
  echo
} >"$DEST_FILE"

ssh -i "$IDENTITY_FILE" -p "$PORT" -o StrictHostKeyChecking=accept-new "${USER}@${HOST}" '
  set -e
  echo "=== SSH Effective Settings ==="
  sshd -T | grep -E "^(port|passwordauthentication|permitrootlogin|pubkeyauthentication) "
  echo
  echo "=== UFW Status ==="
  ufw status verbose
  echo
  echo "=== Fail2Ban Global Status ==="
  fail2ban-client status
  echo
  echo "=== Fail2Ban SSHD Jail Status ==="
  fail2ban-client status sshd
  echo
  echo "=== SSHD Config Test ==="
  sshd -t && echo "sshd -t: OK"
' >>"$DEST_FILE" 2>&1

echo "Security evidence saved: $DEST_FILE"
