param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$base = Join-Path $ProjectRoot 'evidence'

$folders = @(
  '01-os',
  '02-security-network',
  '03-database',
  '04-app',
  '05-containerization',
  '06-vcs',
  '07-observability',
  '08-ai-layer',
  '09-iac'
)

foreach ($f in $folders) {
  $path = Join-Path $base $f
  if (!(Test-Path $path)) {
    New-Item -Path $path -ItemType Directory -Force | Out-Null
  }
}

function Save-Output {
  param(
    [string]$Path,
    [scriptblock]$Command
  )

  try {
    & $Command | Out-File -FilePath $Path -Encoding UTF8
  }
  catch {
    "Command failed: $($_.Exception.Message)" | Out-File -FilePath $Path -Encoding UTF8
  }
}

Save-Output -Path (Join-Path $base "01-os\os_$timestamp.txt") -Command { Get-ComputerInfo | Select-Object OsName, OsVersion, OsBuildNumber }
Save-Output -Path (Join-Path $base "05-containerization\docker_ps_$timestamp.txt") -Command { docker ps }
Save-Output -Path (Join-Path $base "05-containerization\docker_compose_config_$timestamp.txt") -Command { docker compose -f (Join-Path $ProjectRoot 'docker-compose.server.yml') config }
Save-Output -Path (Join-Path $base "06-vcs\git_status_$timestamp.txt") -Command { git -C $ProjectRoot status }
Save-Output -Path (Join-Path $base "06-vcs\git_log_$timestamp.txt") -Command { git -C $ProjectRoot log --oneline -n 30 }
Save-Output -Path (Join-Path $base "09-iac\terraform_files_$timestamp.txt") -Command { Get-ChildItem -Recurse (Join-Path $ProjectRoot 'infra\terraform') | Select-Object FullName }
Save-Output -Path (Join-Path $base "09-iac\ansible_files_$timestamp.txt") -Command { Get-ChildItem -Recurse (Join-Path $ProjectRoot 'infra\ansible') | Select-Object FullName }
Save-Output -Path (Join-Path $base "07-observability\monitoring_compose_config_$timestamp.txt") -Command { docker compose -f (Join-Path $ProjectRoot 'monitoring-project\docker-compose.yml') config }

Write-Output "Evidence collection complete: $base"
