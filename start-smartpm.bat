@echo off
REM ===========================================================================
REM  SmartPM - one-click launcher
REM
REM  Double-click this and wait. It checks prerequisites, starts only the
REM  services that are not already running, waits for each to actually answer
REM  before moving on, and opens the browser.
REM
REM  Safe to run twice: anything already up is left alone, so you never end up
REM  with two backends fighting over port 4000.
REM ===========================================================================

setlocal
set "ROOT=%~dp0"
REM %~dp0 keeps its trailing backslash, which is fine when another path segment
REM follows it but poisonous on its own: `cd /d "C:\...\smartpm\"` ends in \" and
REM the quote gets escaped rather than closed. ROOTDIR is the same path without it.
set "ROOTDIR=%ROOT:~0,-1%"
set "PROBLEM=0"
title SmartPM launcher

REM Sleeping via ping rather than `timeout`, for two reasons. A bare `timeout`
REM resolves to GNU coreutils if this window inherited a PATH from Git Bash, and
REM even the real timeout.exe aborts with "Input redirection is not supported"
REM whenever stdin is not a console. Either way it returns instantly, and the
REM wait loop below would then burn through all its attempts in no time and
REM declare a perfectly healthy service dead. ping just waits.
REM   -n counts pings, so N seconds needs N+1 of them.
set "PING=%SystemRoot%\System32\ping.exe"
if not exist "%PING%" set "PING=ping"

echo.
echo   ==========================================
echo     SmartPM  -  PT Mattel Indonesia
echo   ==========================================
echo.
echo   [1/3] Checking prerequisites
echo.

REM --- tools ----------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo     X  Node.js not found        ^> install Node 22.5+ from nodejs.org
  set "PROBLEM=1"
) else (
  for /f "tokens=*" %%v in ('node --version') do echo     ok Node %%v
)

where python >nul 2>nul
if errorlevel 1 (
  echo     X  Python not found         ^> install Python 3.10+ from python.org
  set "PROBLEM=1"
) else (
  for /f "tokens=2" %%v in ('python --version 2^>^&1') do echo     ok Python %%v
)

where ollama >nul 2>nul
if errorlevel 1 (
  echo     -  Ollama not found         ^> AI Search will degrade, rest still works
) else (
  echo     ok Ollama installed
)

REM --- dependencies ---------------------------------------------------------
if not exist "%ROOT%node_modules" (
  echo     X  Frontend deps missing    ^> run: npm install
  set "PROBLEM=1"
) else (
  echo     ok Frontend dependencies
)

if not exist "%ROOT%server\node_modules" (
  echo     X  Backend deps missing     ^> run: cd server ^&^& npm install
  set "PROBLEM=1"
) else (
  echo     ok Backend dependencies
)

python -c "import cv2, numpy" >nul 2>nul
if errorlevel 1 (
  echo     X  Python deps missing      ^> run: cd ai-service ^&^& pip install -r requirements.txt
  set "PROBLEM=1"
) else (
  echo     ok Python dependencies
)

REM --- config ---------------------------------------------------------------
if not exist "%ROOT%server\.env" (
  echo     X  server\.env missing      ^> copy server\.env.example to server\.env
  set "PROBLEM=1"
) else (
  echo     ok server\.env
)

if not exist "%ROOT%ai-service\.env" (
  echo     X  ai-service\.env missing  ^> copy ai-service\.env.example to ai-service\.env
  set "PROBLEM=1"
) else (
  echo     ok ai-service\.env
)

if "%PROBLEM%"=="1" (
  echo.
  echo   ------------------------------------------
  echo     Cannot start - fix the X lines above.
  echo   ------------------------------------------
  echo.
  pause
  exit /b 1
)

REM --- database -------------------------------------------------------------
REM Created on first run only. Migrating an existing database is a no-op, but
REM seeding twice would be pointless work before a demo, so both are skipped
REM once the file exists.
if not exist "%ROOT%server\data\smartpm.db" (
  echo     -  No database yet - creating and seeding it now...
  pushd "%ROOT%server"
  call npm run db:migrate >nul 2>nul
  call npm run db:seed >nul 2>nul
  popd
  if exist "%ROOT%server\data\smartpm.db" (
    echo     ok Database created
  ) else (
    echo     X  Database setup failed  ^> run manually: cd server ^&^& npm run db:migrate
    echo.
    pause
    exit /b 1
  )
) else (
  echo     ok Database present
)

echo.
echo   [2/3] Starting services
echo.

call :ensure "Ollama    " "http://127.0.0.1:11434/"        "SmartPM - Ollama"     ""                  "ollama serve"
call :ensure "AI service" "http://127.0.0.1:5001/health"   "SmartPM - AI service" "%ROOT%ai-service"  "python -m uvicorn main:app --port 5001"
call :ensure "Backend   " "http://127.0.0.1:4000/api/health" "SmartPM - Backend"  "%ROOT%server"      "npm run dev"
call :ensure "Frontend  " "http://127.0.0.1:5173/"         "SmartPM - Frontend"   "%ROOTDIR%"         "npm run dev -- --host"

echo.
echo   [3/3] Ready
echo.

if "%PROBLEM%"=="1" (
  echo   ------------------------------------------
  echo     Something did not come up. Check the
  echo     service window that stayed blank or
  echo     printed an error.
  echo   ------------------------------------------
  echo.
  pause
  exit /b 1
)

REM Local address for the phone, used by the paper-scan camera capture.
set "LANIP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  if not defined LANIP set "LANIP=%%a"
)
if defined LANIP set "LANIP=%LANIP: =%"

echo     Laptop      http://localhost:5173
if defined LANIP echo     Phone       http://%LANIP%:5173     ^(same Wi-Fi - for camera scan^)
echo.
echo     Supervisor  supervisor / smartpm123
echo     Technician  dewi / smartpm123
echo.
echo   Leave the service windows open for the whole demo.
echo   Closing one stops that service.
echo.

start "" http://localhost:5173
"%PING%" -n 4 127.0.0.1 >nul
exit /b 0


REM ===========================================================================
REM  :ensure  name  healthUrl  windowTitle  workingDir  command
REM
REM  Starts the service only if its health URL is not already answering, then
REM  polls until it does. Polling rather than sleeping a fixed number of
REM  seconds is the point: a cold `npm run dev` can take 20 seconds on one run
REM  and 3 on the next, and a fixed wait reports a healthy service as DOWN.
REM ===========================================================================
:ensure
set "SVC_NAME=%~1"
set "SVC_URL=%~2"
set "SVC_WIN=%~3"
set "SVC_DIR=%~4"
set "SVC_CMD=%~5"

REM -f makes curl fail on 4xx/5xx. Without it an error page counts as "up".
curl -s -f -o nul --max-time 3 "%SVC_URL%" >nul 2>nul
if not errorlevel 1 (
  echo     ok %SVC_NAME%  already running
  exit /b 0
)

if "%SVC_DIR%"=="" (
  start "%SVC_WIN%" cmd /k "%SVC_CMD%"
) else (
  start "%SVC_WIN%" cmd /k "cd /d "%SVC_DIR%" && %SVC_CMD%"
)

set "TRIES=0"
:ensure_wait
"%PING%" -n 3 127.0.0.1 >nul
curl -s -f -o nul --max-time 3 "%SVC_URL%" >nul 2>nul
if not errorlevel 1 (
  echo     ok %SVC_NAME%  started
  exit /b 0
)
set /a TRIES+=1
if %TRIES% lss 30 goto :ensure_wait

echo     X  %SVC_NAME%  did not respond after 60s
set "PROBLEM=1"
exit /b 1
