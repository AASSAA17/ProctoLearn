param(
  [string]$Url = "http://localhost:4000/health",
  [int]$DurationSec = 180,
  [int]$Concurrency = 80,
  [int]$TimeoutSec = 5
)

if ($DurationSec -le 0) { throw "DurationSec must be > 0" }
if ($Concurrency -le 0) { throw "Concurrency must be > 0" }
if ($TimeoutSec -le 0) { throw "TimeoutSec must be > 0" }

$endTime = (Get-Date).AddSeconds($DurationSec)

Write-Host "Starting load test"
Write-Host "URL: $Url"
Write-Host "Duration: $DurationSec sec"
Write-Host "Concurrency: $Concurrency"
Write-Host "Timeout: $TimeoutSec sec"

$jobs = @()
for ($i = 1; $i -le $Concurrency; $i++) {
  $jobs += Start-Job -ScriptBlock {
    param($TargetUrl, $StopAt, $ReqTimeout)

    $ok = 0
    $failed = 0
    $total = 0

    while ((Get-Date) -lt $StopAt) {
      $total++
      try {
        $resp = Invoke-WebRequest -UseBasicParsing -Uri $TargetUrl -Method Get -TimeoutSec $ReqTimeout
        if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
          $ok++
        } else {
          $failed++
        }
      } catch {
        $failed++
      }
    }

    [PSCustomObject]@{
      Total  = $total
      Ok     = $ok
      Failed = $failed
    }
  } -ArgumentList $Url, $endTime, $TimeoutSec
}

$null = Wait-Job -Job $jobs
$results = Receive-Job -Job $jobs
$jobs | Remove-Job -Force

$totalReq = ($results | Measure-Object -Property Total -Sum).Sum
$okReq = ($results | Measure-Object -Property Ok -Sum).Sum
$failedReq = ($results | Measure-Object -Property Failed -Sum).Sum

if (-not $totalReq) { $totalReq = 0 }
if (-not $okReq) { $okReq = 0 }
if (-not $failedReq) { $failedReq = 0 }

$rps = [Math]::Round(($totalReq / [Math]::Max($DurationSec, 1)), 2)
$successRate = if ($totalReq -gt 0) { [Math]::Round((100.0 * $okReq / $totalReq), 2) } else { 0 }

Write-Host ""
Write-Host "Load test finished"
Write-Host "Total requests: $totalReq"
Write-Host "OK: $okReq"
Write-Host "Failed: $failedReq"
Write-Host "RPS: $rps"
Write-Host "Success rate: $successRate%"
