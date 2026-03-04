# ProctoLearn - Database Backup (via Docker)
# Run: powershell -ExecutionPolicy Bypass -File scripts\backup.ps1

$BackupDir  = "C:\Users\user\ProctoLearn\backups"
$Date       = Get-Date -Format "yyyy-MM-dd_HH-mm"
$Container  = "proctolearn_postgres"
$DbUser     = "postgres"
$DbName     = "proctolearn_db"
$RetainDays = 30

if (!(Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

Write-Host ""
Write-Host "========================================"
Write-Host " ProctoLearn Backup: $Date"
Write-Host "========================================"
Write-Host ""

# 1. PostgreSQL dump
$SqlFile = "$BackupDir\db_$Date.sql"
Write-Host "[1/3] Dumping database..."
docker exec $Container pg_dump -U $DbUser -d $DbName --no-password | Out-File -FilePath $SqlFile -Encoding UTF8

if ($LASTEXITCODE -eq 0 -and (Test-Path $SqlFile) -and (Get-Item $SqlFile).Length -gt 0) {
    $sizeKB = [math]::Round((Get-Item $SqlFile).Length / 1KB, 1)
    Write-Host "  OK: $SqlFile ($sizeKB KB)" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Database backup failed!" -ForegroundColor Red
}

# 2. Prisma schema
$SchemaFile = "$BackupDir\schema_$Date.prisma"
Copy-Item "C:\Users\user\ProctoLearn\backend\prisma\schema.prisma" $SchemaFile -Force
Write-Host "[2/3] Schema saved: $SchemaFile" -ForegroundColor Green

# 3. .env files
$EnvDir = "$BackupDir\env_$Date"
New-Item -ItemType Directory -Path $EnvDir -Force | Out-Null

$envFiles = @(
    @{ Src = "C:\Users\user\ProctoLearn\.env";                Dst = "root.env" },
    @{ Src = "C:\Users\user\ProctoLearn\backend\.env";        Dst = "backend.env" },
    @{ Src = "C:\Users\user\ProctoLearn\frontend\.env";       Dst = "frontend.env" },
    @{ Src = "C:\Users\user\ProctoLearn\frontend\.env.local"; Dst = "frontend.env.local" }
)
Write-Host "[3/3] Saving .env files..."
foreach ($e in $envFiles) {
    if (Test-Path $e.Src) {
        Copy-Item $e.Src "$EnvDir\$($e.Dst)" -Force
        Write-Host "  OK: $($e.Dst)" -ForegroundColor Green
    }
}

# 4. Cleanup old backups
$cutoff = (Get-Date).AddDays(-$RetainDays)
$old = @(
    Get-ChildItem $BackupDir -Filter "db_*.sql"        | Where-Object { $_.LastWriteTime -lt $cutoff }
    Get-ChildItem $BackupDir -Filter "schema_*.prisma" | Where-Object { $_.LastWriteTime -lt $cutoff }
    Get-ChildItem $BackupDir -Directory -Filter "env_*"| Where-Object { $_.LastWriteTime -lt $cutoff }
)
if ($old.Count -gt 0) {
    $old | Remove-Item -Recurse -Force
    Write-Host "Removed $($old.Count) old backup(s) (older than $RetainDays days)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================"
Write-Host " Backup complete! Saved to: $BackupDir"
Write-Host "========================================"
Write-Host ""
