param(
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $scriptRoot
}

$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$appDir = Join-Path $ProjectRoot 'evidence/04-app'
$aiDir = Join-Path $ProjectRoot 'evidence/08-ai-layer'
foreach ($dir in @($appDir, $aiDir)) {
  if (!(Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
}

function Save-Text {
  param(
    [string]$Path,
    [string]$Title,
    [string]$Body
  )
  @(
    $Title,
    "Generated at: $(Get-Date -Format s)",
    "",
    $Body,
    ""
  ) | Out-File -FilePath $Path -Encoding UTF8
}

try {
  $composePs = & docker compose -f (Join-Path $ProjectRoot 'docker-compose.server.yml') ps 2>&1
  Save-Text -Path (Join-Path $appDir "app_status_$timestamp.txt") -Title 'Application Status' -Body ($composePs -join [Environment]::NewLine)
}
catch {
  Save-Text -Path (Join-Path $appDir "app_status_$timestamp.txt") -Title 'Application Status' -Body ("ERROR: " + $_.Exception.Message)
}

try {
  $apiHealth = & docker compose -f (Join-Path $ProjectRoot 'docker-compose.server.yml') exec -T api sh -lc 'wget -qO- http://localhost:4000/health || true' 2>&1
  Save-Text -Path (Join-Path $appDir "api_health_$timestamp.txt") -Title 'API Health' -Body ($apiHealth -join [Environment]::NewLine)
}
catch {
  Save-Text -Path (Join-Path $appDir "api_health_$timestamp.txt") -Title 'API Health' -Body ("ERROR: " + $_.Exception.Message)
}

try {
  $workflow = Get-Content -Raw (Join-Path $ProjectRoot 'n8n/workflows/exam-submit-notify.json')
  Save-Text -Path (Join-Path $aiDir "n8n_workflow_$timestamp.txt") -Title 'n8n Workflow Snapshot' -Body $workflow
}
catch {
  Save-Text -Path (Join-Path $aiDir "n8n_workflow_$timestamp.txt") -Title 'n8n Workflow Snapshot' -Body ("ERROR: " + $_.Exception.Message)
}

try {
  $opalCompose = Get-Content -Raw (Join-Path $ProjectRoot 'opal/docker-compose.opal.yml')
  Save-Text -Path (Join-Path $aiDir "opal_compose_$timestamp.txt") -Title 'OPAL Compose Snapshot' -Body $opalCompose
}
catch {
  Save-Text -Path (Join-Path $aiDir "opal_compose_$timestamp.txt") -Title 'OPAL Compose Snapshot' -Body ("ERROR: " + $_.Exception.Message)
}

try {
  $palData = Get-Content -Raw (Join-Path $ProjectRoot 'opal/data/users.json')
  Save-Text -Path (Join-Path $aiDir "opal_data_$timestamp.txt") -Title 'OPAL Users Data' -Body $palData
}
catch {
  Save-Text -Path (Join-Path $aiDir "opal_data_$timestamp.txt") -Title 'OPAL Users Data' -Body ("ERROR: " + $_.Exception.Message)
}

Write-Output "App/AI evidence saved under evidence/04-app and evidence/08-ai-layer"
