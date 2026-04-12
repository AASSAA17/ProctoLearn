# ProctoLearn - Database Restore (via Docker)
# Run: powershell -ExecutionPolicy Bypass -File scripts\restore.ps1

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Split-Path -Parent $ScriptDir
$BackupDir = Join-Path $RepoRoot "backups"
$EnvFile   = Join-Path $RepoRoot ".env"

$Container = "proctolearn_postgres"
$DbUser    = "postgres"
$DbName    = "proctolearn_db"

if (Test-Path $EnvFile) {
    $envLines = Get-Content $EnvFile | Where-Object { $_ -match "=" -and -not $_.Trim().StartsWith("#") }
    foreach ($line in $envLines) {
        $parts = $line -split "=", 2
        if ($parts.Count -eq 2) {
            $key = $parts[0].Trim()
            $value = $parts[1].Trim().Trim('"')
            switch ($key) {
                "POSTGRES_USER" { if ($value) { $DbUser = $value } }
                "POSTGRES_DB"   { if ($value) { $DbName = $value } }
            }
        }
    }
}

$sqlFiles = Get-ChildItem $BackupDir -Filter "db_*.sql" | Sort-Object LastWriteTime -Descending

if ($sqlFiles.Count -eq 0) {
    Write-Host "ERROR: No backup files found in $BackupDir" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "========================================"
Write-Host " Available backups:"
Write-Host "========================================"
Write-Host ""

for ($i = 0; $i -lt [Math]::Min($sqlFiles.Count, 10); $i++) {
    $f    = $sqlFiles[$i]
    $size = [math]::Round($f.Length / 1KB, 1)
    $date = $f.LastWriteTime.ToString("yyyy-MM-dd HH:mm")
    Write-Host "  [$($i+1)] $($f.Name)  ($size KB)  $date"
}

Write-Host ""
$choice = Read-Host "Select number (Enter = latest)"

if ([string]::IsNullOrWhiteSpace($choice)) {
    $selected = $sqlFiles[0]
} else {
    $idx = [int]$choice - 1
    if ($idx -lt 0 -or $idx -ge $sqlFiles.Count) {
        Write-Host "ERROR: Invalid selection" -ForegroundColor Red
        exit 1
    }
    $selected = $sqlFiles[$idx]
}

Write-Host ""
Write-Host "WARNING: Database '$DbName' will be WIPED and restored from '$($selected.Name)'" -ForegroundColor Yellow
$confirm = Read-Host "Type 'yes' to confirm"

if ($confirm -ne "yes") {
    Write-Host "Cancelled." -ForegroundColor Gray
    exit 0
}

Write-Host "Dropping and recreating schema..." -ForegroundColor Yellow
docker exec $Container psql -U $DbUser -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" $DbName
if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Failed to drop schema" -ForegroundColor Red; exit 1 }

Write-Host "Restoring from $($selected.Name)..." -ForegroundColor Yellow
Get-Content $selected.FullName -Raw | docker exec -i $Container psql -U $DbUser -d $DbName

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "SUCCESS: Database restored from $($selected.Name)" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "ERROR: Restore failed!" -ForegroundColor Red
}
