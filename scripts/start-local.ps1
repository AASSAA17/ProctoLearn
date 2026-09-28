param([switch]$Native, [switch]$Demo, [switch]$DemoMinimal, [switch]$SkipBuild, [switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Install Node.js 24 LTS from https://nodejs.org, then run this script again.' }
$launchArgs = @((Join-Path $PSScriptRoot 'local-launch.cjs'))
if ($Native) { $launchArgs += '--native' }
if ($Demo) { $launchArgs += '--demo' }
if ($DemoMinimal) { $launchArgs += '--demo-minimal' }
if ($SkipBuild) { $launchArgs += '--skip-build' }
if ($PrepareOnly) { $launchArgs += '--prepare-only' }
& $nodePath @launchArgs
if ($LASTEXITCODE -ne 0) { throw "Local launch failed (exit $LASTEXITCODE). See .local/logs for details." }
