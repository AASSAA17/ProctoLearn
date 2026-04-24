$ErrorActionPreference = 'Stop'

Write-Host '==> Starting ProctoLearn dev stack (app + Jenkins + n8n + OPAL)...'
docker compose -f docker-compose.dev.yml up -d --build

Write-Host '==> Importing n8n workflow...'
docker exec proctolearn_n8n n8n import:workflow --input=/data/import/exam-submit-notify.json

Write-Host '==> Waiting for OPA API...'
$maxRetries = 30
$ready = $false
for ($i = 0; $i -lt $maxRetries; $i++) {
  try {
    Invoke-RestMethod -Method Get -Uri 'http://localhost:8181/health?bundles' -TimeoutSec 3 | Out-Null
    $ready = $true
    break
  } catch {
    Start-Sleep -Seconds 2
  }
}

if (-not $ready) {
  throw 'OPA is not ready on http://localhost:8181'
}

Write-Host '==> Loading OPAL demo users into OPA...'
$json = Get-Content -Raw 'opal/data/users.json'
Invoke-RestMethod -Method Put -Uri 'http://localhost:8181/v1/data/proctolearn/users' -ContentType 'application/json' -Body $json | Out-Null

Write-Host '==> Current container status:'
docker compose -f docker-compose.dev.yml ps

Write-Host ''
Write-Host 'Stack is ready:'
Write-Host '  Web app:    http://localhost:3001'
Write-Host '  API:        http://localhost:4000'
Write-Host '  n8n:        http://localhost:5678'
Write-Host '  Jenkins:    http://localhost:8088'
Write-Host '  OPA:        http://localhost:8181'
Write-Host '  OPAL:       http://localhost:7002'
Write-Host '  Mailpit:    http://localhost:8025'
