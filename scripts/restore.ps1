# ProctoLearn - Database Restore (via Docker)
# Run: powershell -ExecutionPolicy Bypass -File scripts\restore.ps1

$BackupDir = "C:\Users\user\ProctoLearn\backups"
$Container = "proctolearn_postgres"
$DbUser    = "postgres"
$DbName    = "proctolearn_db"

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
