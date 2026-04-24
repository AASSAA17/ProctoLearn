param(
  [string]$PrometheusUrl = "http://localhost:9090",
  [string]$AlertmanagerUrl = "http://localhost:9093",
  [string]$JenkinsUrl = "http://localhost:8088",
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $scriptRoot
}

$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$destDir = Join-Path $ProjectRoot 'evidence/07-observability'
if (!(Test-Path $destDir)) {
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$destFile = Join-Path $destDir "observability_audit_$timestamp.txt"

function Add-Section {
  param(
    [string]$Title,
    [string]$Body
  )
  @(
    "",
    "=== $Title ===",
    $Body,
    ""
  ) | Out-File -FilePath $destFile -Encoding UTF8 -Append
}

@(
  "ProctoLearn Observability Audit",
  "Generated at: $(Get-Date -Format s)",
  "",
  "Project root: $ProjectRoot",
  "Prometheus URL: $PrometheusUrl",
  "Alertmanager URL: $AlertmanagerUrl",
  "Jenkins URL: $JenkinsUrl",
  ""
) | Out-File -FilePath $destFile -Encoding UTF8

$configFiles = @(
  @{ Title = 'Jenkinsfile'; Path = (Join-Path $ProjectRoot 'Jenkinsfile') },
  @{ Title = 'Prometheus Rules'; Path = (Join-Path $ProjectRoot 'monitoring-project/prometheus/alert.rules.yml') },
  @{ Title = 'Prometheus Config'; Path = (Join-Path $ProjectRoot 'monitoring-project/prometheus/prometheus.yml') },
  @{ Title = 'Alertmanager Config'; Path = (Join-Path $ProjectRoot 'monitoring-project/alertmanager/alertmanager.yml') }
)

foreach ($file in $configFiles) {
  if (Test-Path $file.Path) {
    $content = Get-Content -Raw $file.Path
    Add-Section -Title $file.Title -Body $content
  } else {
    Add-Section -Title $file.Title -Body "File not found: $($file.Path)"
  }
}

try {
  $promAlerts = Invoke-RestMethod -Uri "$PrometheusUrl/api/v1/alerts" -Method Get -TimeoutSec 10
  Add-Section -Title 'Prometheus Active Alerts' -Body ($promAlerts | ConvertTo-Json -Depth 8)
}
catch {
  Add-Section -Title 'Prometheus Active Alerts' -Body ("ERROR: " + $_.Exception.Message)
}

try {
  $promRules = Invoke-RestMethod -Uri "$PrometheusUrl/api/v1/rules" -Method Get -TimeoutSec 10
  Add-Section -Title 'Prometheus Rules' -Body ($promRules | ConvertTo-Json -Depth 8)
}
catch {
  Add-Section -Title 'Prometheus Rules' -Body ("ERROR: " + $_.Exception.Message)
}

try {
  $amStatus = Invoke-RestMethod -Uri "$AlertmanagerUrl/api/v2/status" -Method Get -TimeoutSec 10
  Add-Section -Title 'Alertmanager Status' -Body ($amStatus | ConvertTo-Json -Depth 8)
}
catch {
  Add-Section -Title 'Alertmanager Status' -Body ("ERROR: " + $_.Exception.Message)
}

try {
  $amAlerts = Invoke-RestMethod -Uri "$AlertmanagerUrl/api/v2/alerts" -Method Get -TimeoutSec 10
  Add-Section -Title 'Alertmanager Alerts' -Body ($amAlerts | ConvertTo-Json -Depth 8)
}
catch {
  Add-Section -Title 'Alertmanager Alerts' -Body ("ERROR: " + $_.Exception.Message)
}

try {
  $jenkinsLogs = & docker logs proctolearn_jenkins --since 1h 2>&1
  Add-Section -Title 'Jenkins Logs' -Body ($jenkinsLogs -join [Environment]::NewLine)
}
catch {
  Add-Section -Title 'Jenkins Logs' -Body ("ERROR: " + $_.Exception.Message)
}

try {
  $alertmanagerLogs = & docker logs alertmanager --since 1h 2>&1
  Add-Section -Title 'Alertmanager Logs' -Body ($alertmanagerLogs -join [Environment]::NewLine)
}
catch {
  Add-Section -Title 'Alertmanager Logs' -Body ("ERROR: " + $_.Exception.Message)
}

Write-Output "Observability audit saved: $destFile"
