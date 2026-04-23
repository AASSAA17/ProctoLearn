# Infrastructure as Code

This folder contains Infrastructure as Code assets for ProctoLearn.

## Layout

- `terraform/` provisions baseline infrastructure services with Terraform.
- `ansible/` configures host security, installs Docker, and deploys the project stacks.

## Terraform quick start

1. Open `infra/terraform`.
2. Copy `terraform.tfvars.example` to `terraform.tfvars`.
3. Set secure values for `postgres_password` and `minio_root_password`.
4. Run: `terraform init`
5. Run: `terraform plan`
6. Run: `terraform apply`

## Ansible quick start

1. Open `infra/ansible`.
2. Install collections: `ansible-galaxy collection install -r requirements.yml`
3. Adjust `inventory.ini` for your VM host.
4. Run: `ansible-playbook -i inventory.ini playbook.yml`

The deploy role performs a `git clone/pull` from `repo_url`/`repo_branch` and automatically bootstraps `.env` files from `.env.example` templates when missing.

## Notes

- Do not commit real secrets; use environment files and vault/secrets manager in production.
- Set real secrets in `/opt/proctolearn/.env` and `/opt/proctolearn/monitoring-project/.env` after initial bootstrap.
