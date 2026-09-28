@echo off
setlocal
where node.exe >nul 2>nul
if not errorlevel 1 (
  node.exe "%~dp0scripts\local-launch.cjs" %*
) else (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" "%~dp0scripts\local-launch.cjs" %*
  ) else (
    echo Install Node.js 24 LTS from https://nodejs.org and try again.
    exit /b 1
  )
)
exit /b %errorlevel%
