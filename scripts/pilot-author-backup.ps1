param([ValidateSet('backup','restore-check')][string]$Operation = 'backup', [string]$BackupFile)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.Security.Cryptography.ProtectedData
$repoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourcePath = [IO.Path]::GetFullPath((Join-Path $repoPath '.local\pilot-author'))
$backupDirectory = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'ProctoLearn-private-backups'
if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) { throw 'Private author directory does not exist' }
if ((Get-Item -LiteralPath $sourcePath).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Symlink author directory refused' }
if (Get-ChildItem -LiteralPath $sourcePath -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) { throw 'Linked author entries refused' }
if ($Operation -eq 'backup') {
    [IO.Directory]::CreateDirectory($backupDirectory) | Out-Null
    $temporaryFile = Join-Path $repoPath ('.local\author-backup-' + [guid]::NewGuid().ToString() + '.zip')
    try {
        [IO.Compression.ZipFile]::CreateFromDirectory($sourcePath, $temporaryFile)
        $archiveBytes = [IO.File]::ReadAllBytes($temporaryFile)
        $protectedBytes = [Security.Cryptography.ProtectedData]::Protect($archiveBytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        $BackupFile = Join-Path $backupDirectory ('pilot-author-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8) + '.dpapi')
        [IO.File]::WriteAllBytes($BackupFile, $protectedBytes)
    } finally { if (Test-Path -LiteralPath $temporaryFile) { Remove-Item -LiteralPath $temporaryFile } }
}
if (-not $BackupFile) { throw 'restore-check requires -BackupFile pointing to the encrypted backup' }
$resolvedBackup = [IO.Path]::GetFullPath($BackupFile)
if (-not $resolvedBackup.StartsWith(([IO.Path]::GetFullPath($backupDirectory) + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup must be inside the dedicated private backup directory' }
$decryptedBytes = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($resolvedBackup), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
$archiveStream = [IO.MemoryStream]::new($decryptedBytes)
$archive = [IO.Compression.ZipArchive]::new($archiveStream, [IO.Compression.ZipArchiveMode]::Read)
try {
    $filesChecked = 0
    foreach ($entry in $archive.Entries) {
        if (-not $entry.Name) { continue }
        $entryPath = [IO.Path]::GetFullPath((Join-Path $sourcePath $entry.FullName))
        if (-not $entryPath.StartsWith(($sourcePath + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected archive path' }
        $entryStream = $entry.Open()
        try { $memory = [IO.MemoryStream]::new(); $entryStream.CopyTo($memory); $restoredHash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($memory.ToArray())) }
        finally { $entryStream.Dispose(); if ($memory) { $memory.Dispose() } }
        $sourceHash = (Get-FileHash -LiteralPath $entryPath -Algorithm SHA256).Hash
        if ($restoredHash -ne $sourceHash) { throw 'Private backup differs from current author source; no source was overwritten' }
        $filesChecked++
    }
    if ($filesChecked -ne @(Get-ChildItem -LiteralPath $sourcePath -Recurse -File -Force).Count) { throw 'Current author tree has files absent from this backup; create a fresh backup' }
    Write-Output ('VERIFIED encrypted author backup and in-memory restore comparison: ' + $filesChecked + ' files. ' + $resolvedBackup)
    Write-Output 'DPAPI CurrentUser: recovery requires this Windows account and its keys. Keep an independently secured/off-device copy for machine-loss recovery.'
} finally { $archive.Dispose(); $archiveStream.Dispose(); [Array]::Clear($decryptedBytes,0,$decryptedBytes.Length) }
