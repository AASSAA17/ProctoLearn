param(
  [Parameter(Mandatory = $true)][string]$TargetHost,
  [Parameter(Mandatory = $true)][string]$User,
  [int]$Port = 2222,
  [string]$IdentityFile = "$HOME/.ssh/id_ed25519",
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Split-Path -Parent $scriptRoot
}
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$destDir = Join-Path $ProjectRoot 'evidence/02-security-network'
if (!(Test-Path $destDir)) {
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$destFile = Join-Path $destDir "security_audit_$timestamp.txt"

$remoteCmd = @'
set -e

echo "=== SSH Effective Settings ==="
sshd -T | grep -E '^(port|passwordauthentication|permitrootlogin|pubkeyauthentication) '

echo ""
echo "=== UFW Status ==="
ufw status verbose

echo ""
echo "=== Fail2Ban Global Status ==="
fail2ban-client status

echo ""
echo "=== Fail2Ban SSHD Jail Status ==="
fail2ban-client status sshd

echo ""
echo "=== SSHD Config Test ==="
sshd -t && echo "sshd -t: OK"
'@

$sshArgs = @()
if (![string]::IsNullOrWhiteSpace($IdentityFile) -and (Test-Path $IdentityFile)) {
  $sshArgs += @('-i', $IdentityFile)
}

$sshArgs += @(
  '-p', "$Port",
  '-o', 'StrictHostKeyChecking=accept-new',
  "$User@$TargetHost",
  $remoteCmd
)

$header = @(
  "ProctoLearn Security Evidence",
  "Generated at: $(Get-Date -Format s)",
  ("Target = " + $User + "@" + $TargetHost + " port " + $Port),
  ""
)
$header | Out-File -FilePath $destFile -Encoding UTF8

try {
  $sshOutput = & ssh @sshArgs 2>&1
  $sshExitCode = $LASTEXITCODE
}
catch {
  $sshOutput = $_.Exception.Message
  $sshExitCode = 1
}

$sshOutput | Out-File -FilePath $destFile -Encoding UTF8 -Append

if ($sshExitCode -ne 0) {
  Write-Warning "Security audit command failed (exit code: $sshExitCode). Evidence log still saved: $destFile"
  exit $sshExitCode
}

Write-Output "Security evidence saved: $destFile"
