#!/usr/bin/env bash
# ============================================================
# Collect IaC Evidence — Terraform plan + Ansible check
# Usage: bash scripts/collect-iac-evidence.sh
# ============================================================
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIMESTAMP="$(date +"%Y-%m-%d_%H-%M-%S")"
OUT="$PROJECT_ROOT/evidence/09-iac"
TERRAFORM_DIR="$PROJECT_ROOT/infra/terraform"
ANSIBLE_DIR="$PROJECT_ROOT/infra/ansible"
mkdir -p "$OUT"

echo "=== IaC Evidence Collection ==="

# ── Terraform ──
if command -v terraform &>/dev/null; then
  echo "--- Terraform init ---"
  terraform -chdir="$TERRAFORM_DIR" init -no-color 2>&1 | tee "$OUT/terraform_init_${TIMESTAMP}.txt"

  echo "--- Terraform validate ---"
  terraform -chdir="$TERRAFORM_DIR" validate -no-color 2>&1 | tee "$OUT/terraform_validate_${TIMESTAMP}.txt"

  echo "--- Terraform plan ---"
  terraform -chdir="$TERRAFORM_DIR" plan -no-color 2>&1 | tee "$OUT/terraform_plan_${TIMESTAMP}.txt"
  echo "✅ Terraform plan saved"
else
  echo "⚠️  terraform not installed — run: sudo bash scripts/install-tools.sh"
fi

# ── Ansible ──
if command -v ansible-playbook &>/dev/null; then
  echo "--- Ansible version ---"
  ansible --version | tee "$OUT/ansible_version_${TIMESTAMP}.txt"

  echo "--- Ansible inventory ---"
  ansible-inventory -i "$ANSIBLE_DIR/inventory.ini" --list 2>&1 | tee "$OUT/ansible_inventory_${TIMESTAMP}.txt"

  echo "--- Ansible playbook syntax check ---"
  ansible-playbook -i "$ANSIBLE_DIR/inventory.ini" "$ANSIBLE_DIR/playbook.yml" \
    --syntax-check 2>&1 | tee "$OUT/ansible_syntax_check_${TIMESTAMP}.txt"
  echo "✅ Ansible syntax check saved"
else
  echo "⚠️  ansible not installed — run: pip3 install ansible"
fi

echo ""
echo "=== Files in $OUT: ==="
ls -lh "$OUT/"
