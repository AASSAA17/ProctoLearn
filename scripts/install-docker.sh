#!/usr/bin/env bash
# ============================================================
# Install Docker CE on Ubuntu (for ProctoLearn)
# Usage: sudo bash scripts/install-docker.sh
# ============================================================
set -euo pipefail

echo "Installing Docker CE..."

# Remove old versions
apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Install prerequisites
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release

# Add Docker GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker apt repo
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add user to docker group
SUDO_USER_NAME="${SUDO_USER:-$USER}"
usermod -aG docker "$SUDO_USER_NAME" 2>/dev/null || true

# Start and enable
systemctl enable docker
systemctl start docker

echo ""
echo "✅ Docker installed!"
docker --version
echo ""
echo "Re-login or run: newgrp docker"
