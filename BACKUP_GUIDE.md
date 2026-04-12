# ProctoLearn Backup Guide

This guide is the fallback when Jenkins SCM setup is not available or the repo snapshot changes faster than Jenkins can read it.

## What is backed up
- PostgreSQL database dump
- Prisma schema
- `.env` files
- Key app files used for the demo:
  - `Jenkinsfile`
  - `docker-compose.yml`
  - `docker-compose.dev.yml`
  - `backend/src`
  - `backend/prisma`
  - `frontend/src`
  - `n8n/workflows`
  - `opal/policies`
  - `opal/data`
  - `scripts`

## Windows backup
Run from the project root:
```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
```

The backup is stored in `backups/`.

## Linux backup
Run from the project root:
```bash
bash scripts/backup.sh
```

The backup is stored in `backups/`.

## Restore checklist
1. Restore the `.env` files from the matching backup folder.
2. Restore `schema.prisma` if the data model changed.
3. Restore the database dump into the Postgres container.
4. Restore the workflow JSON files in `n8n/workflows`.
5. Restore policy files in `opal/policies` and seed data in `opal/data`.
6. Recreate the containers with `docker compose -f docker-compose.dev.yml up -d --build`.

## Demo usage
Use the backup snapshot when Jenkins cannot read the `Jenkinsfile` from SCM.
It gives you a local source of truth for the guide and the demo flow.
