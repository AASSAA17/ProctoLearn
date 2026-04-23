param(
  [string]$PrometheusUrl = "http://localhost:9090",
  [string]$AlertName = "ObservabilityDemoApiLoad",
  [string]$LoadUrl = "http://localhost:4000/health",
  [int]$DurationSec = 120,
  [int]$Concurrency = 60,
  [int]$TimeoutMs = 5000,
  [int]$FireTimeoutSec = 300,
  [int]$ResolveTimeoutSec = 600,
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

$destFile = Join-Path $destDir "observability_demo_$timestamp.txt"
$loadLog = Join-Path $destDir "load_test_$timestamp.txt"
$loadErrLog = Join-Path $destDir "load_test_${timestamp}_err.txt"

@(
  "ProctoLearn Observability Demo",
  "Generated at: $(Get-Date -Format s)",
  "AlertName: $AlertName",
  "LoadUrl: $LoadUrl",
  "DurationSec: $DurationSec",
  "Concurrency: $Concurrency",
  "TimeoutMs: $TimeoutMs",
  "FireTimeoutSec: $FireTimeoutSec",
  "ResolveTimeoutSec: $ResolveTimeoutSec",
  ""
) | Out-File -FilePath $destFile -Encoding UTF8

function Add-Line {
  param([string]$Line)
  $Line | Out-File -FilePath $destFile -Encoding UTF8 -Append
}

function Get-ActiveAlerts {
  try {
    $alerts = Invoke-RestMethod -Uri "$PrometheusUrl/api/v1/alerts" -Method Get -TimeoutSec 10
    return $alerts.data.alerts
  }
  catch {
    Add-Line ("Prometheus query failed: " + $_.Exception.Message)
    return @()
  }
}

function Test-AlertState {
  param([string]$DesiredState)
  $alerts = Get-ActiveAlerts
  foreach ($alert in $alerts) {
    if ($alert.labels.alertname -eq $AlertName -and $alert.state -eq $DesiredState) {
      return $true
    }
  }
  return $false
}

Add-Line 'Starting load test process.'

$loadArgs = @(
  'scripts\load-test.js',
  '--url', $LoadUrl,
  '--duration', "$DurationSec",
  '--concurrency', "$Concurrency",
  '--timeout', "$TimeoutMs"
)

if (Get-Command node -ErrorAction SilentlyContinue) {
  $nodeProcess = Start-Process -FilePath 'node' -ArgumentList $loadArgs -PassThru -NoNewWindow -RedirectStandardOutput $loadLog -RedirectStandardError $loadErrLog
  Add-Line ("Load test PID: " + $nodeProcess.Id)
} else {
  Add-Line 'Node.js is not available on this machine; load test cannot be started.'
  $nodeProcess = $null
}

$fireDeadline = (Get-Date).AddSeconds($FireTimeoutSec)
$resolvedDeadline = (Get-Date).AddSeconds($ResolveTimeoutSec)
$fired = $false
$resolved = $false

Add-Line 'Waiting for alert to fire...'
while ((Get-Date) -lt $fireDeadline) {
  if (Test-AlertState -DesiredState 'firing') {
    Add-Line ("FIRING detected at " + (Get-Date -Format s))
    $fired = $true
    break
  }
  Start-Sleep -Seconds 5
}

if (-not $fired) {
  Add-Line 'Alert did not fire within timeout.'
}

if ($null -ne $nodeProcess -and $nodeProcess.HasExited) {
  Add-Line ("Load test exited with code: " + $nodeProcess.ExitCode)
} elseif ($null -ne $nodeProcess) {
  Add-Line 'Waiting for load test process to finish...'
  $null = $nodeProcess.WaitForExit(120000)
  Add-Line ("Load test exit code: " + $nodeProcess.ExitCode)
} else {
  Add-Line 'Skipping load-test process wait because Node.js is unavailable.'
}

Add-Line 'Waiting for alert to resolve...'
while ((Get-Date) -lt $resolvedDeadline) {
  if (-not (Test-AlertState -DesiredState 'firing')) {
    Add-Line ("RESOLVED detected at " + (Get-Date -Format s))
    $resolved = $true
    break
  }
  Start-Sleep -Seconds 5
}

if (-not $resolved) {
  Add-Line 'Alert did not resolve within timeout.'
}

if (Test-Path $loadLog) {
  Add-Line ''
  Add-Line '=== Load Test Log ==='
  Add-Line (Get-Content -Raw $loadLog)
}

if (Test-Path $loadErrLog) {
  Add-Line ''
  Add-Line '=== Load Test Error Log ==='
  Add-Line (Get-Content -Raw $loadErrLog)
}

try {
  $amLogs = & docker logs alertmanager --since 20m 2>&1
  Add-Line ''
  Add-Line '=== Alertmanager Logs ==='
  Add-Line ($amLogs -join [Environment]::NewLine)
}
catch {
  Add-Line ("Alertmanager logs failed: " + $_.Exception.Message)
}

try {
  $jenkinsLogs = & docker logs proctolearn_jenkins --since 20m 2>&1
  Add-Line ''
  Add-Line '=== Jenkins Logs ==='
  Add-Line ($jenkinsLogs -join [Environment]::NewLine)
}
catch {
  Add-Line ("Jenkins logs failed: " + $_.Exception.Message)
}

Add-Line ''
Add-Line ("Demo proof saved: " + $destFile)
Write-Output "Observability demo saved: $destFile"
