@echo off
setlocal
if "%~1"=="" (
  node "%~dp0pilot-bootstrap.cjs" verify
) else (
  node "%~dp0pilot-bootstrap.cjs" verify --env-file "%~1"
)
set "PILOT_EXIT=%ERRORLEVEL%"
endlocal & exit /b %PILOT_EXIT%
