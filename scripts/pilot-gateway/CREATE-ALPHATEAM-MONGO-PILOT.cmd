@echo off
setlocal
if "%~1"=="" (
  node "%~dp0pilot-bootstrap.cjs" create
) else (
  node "%~dp0pilot-bootstrap.cjs" create --env-file "%~1"
)
set "PILOT_EXIT=%ERRORLEVEL%"
endlocal & exit /b %PILOT_EXIT%
