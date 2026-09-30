@echo off
setlocal DisableDelayedExpansion
set "BUNDLE_ROOT=%~dp0"
PowerShell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%BUNDLE_ROOT%powershell\Invoke-RunReconciliation.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
