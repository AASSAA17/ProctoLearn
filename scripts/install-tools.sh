#!/usr/bin/env bash
# ============================================================
# Install Terraform + Ansible (for IaC module evidence)
# Usage: sudo bash scripts/install-tools.sh
# ============================================================
set -euo pipefail

echo "=== Installing Terraform ==="
apt-get update -y && apt-get install -y gnupg software-properties-common

wget -O- https://apt.releases.hashicorp.com/gpg | \
  gpg --dearmor | \
  tee /usr/share/keyrings/hashicorp-archive-keyring.gpg > /dev/null

echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] \
  https://apt.releases.hashicorp.com $(lsb_release -cs) main" | \
  tee /etc/apt/sources.list.d/hashicorp.list

apt-get update -y && apt-get install -y terraform
terraform -version

echo ""
echo "=== Installing Ansible ==="
apt-get install -y python3-pip
pip3 install ansible ansible-lint --break-system-packages 2>/dev/null || pip3 install ansible ansible-lint
ansible --version

echo ""
echo "✅ Terraform and Ansible installed!"
