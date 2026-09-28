# Pass the same --flags as backup-cli.cjs; see docs/BACKUP_RESTORE.md.
$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'backup-cli.cjs') backup @args
exit $LASTEXITCODE
