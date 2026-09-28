# Dry-run unless --apply is explicit. Never selects the latest backup or drops a schema.
$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'backup-cli.cjs') restore @args
exit $LASTEXITCODE
