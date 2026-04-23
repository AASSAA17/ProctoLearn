# Security Demo Checklist (SSH/UFW/Fail2Ban)

## Target state

- SSH key-only authentication is enabled.
- SSH listens on non-default port 2222.
- Root login is disabled.
- UFW default policy is deny incoming / allow outgoing.
- Only required ports are open (2222, 80, 443, and required monitoring ports).
- Fail2Ban is enabled and sshd jail is active.

## Evidence files to present

- Security audit output: `security_audit_*.txt`
- Optional screenshots:
  - `ufw status verbose`
  - `fail2ban-client status sshd`
  - `sshd -T` excerpt

## How to collect quickly

- Windows:
  - `powershell -ExecutionPolicy Bypass -File scripts/security-audit.ps1 -TargetHost <VM_IP> -User <VM_USER> -Port 2222`
- Linux/macOS:
  - `bash scripts/security-audit.sh <VM_IP> <VM_USER> 2222`

## Live defense flow (2-3 minutes)

1. Show Ansible security role files:
   - `infra/ansible/roles/security/tasks/main.yml`
   - `infra/ansible/roles/security/templates/sshd-hardening.conf.j2`
   - `infra/ansible/roles/security/templates/jail.local.j2`
2. Show latest `security_audit_*.txt` in this folder.
3. Highlight lines proving each requirement (SSH, UFW, Fail2Ban).
