# ProctoLearn - Backup for demo/guide
# Run: powershell -ExecutionPolicy Bypass -File scripts\backup.ps1

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackupDir   = Join-Path $ProjectRoot "backups"
$Date        = Get-Date -Format "yyyy-MM-dd_HH-mm"
$Container   = "proctolearn_postgres"
$DbUser      = "postgres"
$DbName      = "proctolearn_db"
$RetainDays  = 30

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
Write-Host "[1/4] Dumping database..."
docker exec $Container pg_dump -U $DbUser -d $DbName --no-password | Out-File -FilePath $SqlFile -Encoding UTF8

if ($LASTEXITCODE -eq 0 -and (Test-Path $SqlFile) -and (Get-Item $SqlFile).Length -gt 0) {
    $sizeKB = [math]::Round((Get-Item $SqlFile).Length / 1KB, 1)
    Write-Host "  OK: $SqlFile ($sizeKB KB)" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Database backup failed!" -ForegroundColor Red
}

# 2. Prisma schema
$SchemaFile = "$BackupDir\schema_$Date.prisma"
Copy-Item (Join-Path $ProjectRoot "backend\prisma\schema.prisma") $SchemaFile -Force
Write-Host "[2/4] Schema saved: $SchemaFile" -ForegroundColor Green

# 3. .env files
$EnvDir = "$BackupDir\env_$Date"
New-Item -ItemType Directory -Path $EnvDir -Force | Out-Null

$envFiles = @(
    @{ Src = (Join-Path $ProjectRoot ".env");                Dst = "root.env" },
    @{ Src = (Join-Path $ProjectRoot "backend\.env");        Dst = "backend.env" },
    @{ Src = (Join-Path $ProjectRoot "frontend\.env");       Dst = "frontend.env" },
    @{ Src = (Join-Path $ProjectRoot "frontend\.env.local"); Dst = "frontend.env.local" }
)
Write-Host "[3/4] Saving .env files..."
foreach ($e in $envFiles) {
    if (Test-Path $e.Src) {
        Copy-Item $e.Src "$EnvDir\$($e.Dst)" -Force
        Write-Host "  OK: $($e.Dst)" -ForegroundColor Green
    }
}

# 4. Project snapshot for the guide
$SnapshotDir = "$BackupDir\snapshot_$Date"
New-Item -ItemType Directory -Path $SnapshotDir -Force | Out-Null

$include = @(
    "Jenkinsfile",
    "docker-compose.yml",
    "docker-compose.dev.yml",
    "backend\src",
    "backend\prisma",
    "frontend\src",
    "n8n\workflows",
    "opal\policies",
    "opal\data",
    "scripts"
)

foreach ($path in $include) {
    $source = Join-Path $ProjectRoot $path
    if (Test-Path $source) {
        Copy-Item $source $SnapshotDir -Recurse -Force
    }
}

Write-Host "[4/4] Project snapshot saved: $SnapshotDir" -ForegroundColor Green

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
