@echo off
rem SPDX-License-Identifier: GPL-2.0-only
rem Copyright (C) 2026 Rune Langoy
rem
rem Starts HDLBoard on native Windows - the frontend (Vite) and the simulation
rem backend - for testing a server on this machine. The Windows counterpart of
rem scripts/start.sh; see docs/HOSTING.md "Test it on native Windows".
rem
rem   scripts\start-windows.cmd
rem
rem Config:  set STATIC_PORT=8080 & set HDL_WS_PORT=9090 & scripts\start-windows.cmd
rem
rem Every step is idempotent, so a second run only checks and starts:
rem   1. Node.js 18+ is installed (it is not installed for you)
rem   2. npm install in the root and in server\ when node_modules is missing or
rem      older than package-lock.json (what a git pull leaves behind)
rem   3. GHDL and Icarus Verilog in winInstaller\vendor\ - downloaded and
rem      checksum-verified by the installer's own fetch scripts when missing
rem   4. the backend is built (tsc -b, so a no-op when nothing changed)
rem   5. both servers start in minimised windows, logging to .run\*.log
rem
rem Stop them with scripts\stop-windows.cmd; check them with scripts\test-windows.cmd.

setlocal EnableExtensions
cd /d "%~dp0.."

if not defined STATIC_PORT set "STATIC_PORT=5173"
if not defined HDL_WS_PORT set "HDL_WS_PORT=9010"
rem The page connects to the backend on this port (vite.config.ts).
set "VITE_HDL_WS_PORT=%HDL_WS_PORT%"
set "GHDL_DIR=%CD%\winInstaller\vendor\ghdl"
set "IVERILOG_DIR=%CD%\winInstaller\vendor\iverilog"

call :require_node || exit /b 1
call :require_free_ports || exit /b 1
call :npm_install "%CD%" || exit /b 1
call :npm_install "%CD%\server" || exit /b 1
call :vendor_tools || exit /b 1

echo === Building the backend ===
pushd server
call npm.cmd run build
if errorlevel 1 (
  popd
  echo Backend build failed. 1>&2
  exit /b 1
)
popd

echo === Starting the servers ===
if not exist .run mkdir .run
rem The local vite binary, not npx: stop-windows.cmd stops the process that
rem holds the port, and with npx that would be a child left running.
start "HDLBoard backend" /MIN /D "%CD%\server" cmd /c "node dist\server.js > ..\.run\backend.log 2>&1"
start "HDLBoard frontend" /MIN /D "%CD%" cmd /c "node_modules\.bin\vite.cmd --host --port %STATIC_PORT% > .run\frontend.log 2>&1"

call :wait_for_ports
if errorlevel 1 (
  echo The servers did not start within 30 seconds. See .run\backend.log and .run\frontend.log. 1>&2
  exit /b 1
)

echo.
echo Frontend: http://localhost:%STATIC_PORT%/
echo Backend:  ws://localhost:%HDL_WS_PORT%/hdlsim
echo.
echo From another machine on the network (open the firewall first, see docs\HOSTING.md):
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object { '  http://' + $_.IPAddress + ':%STATIC_PORT%/' }"
echo.
echo Logs: .run\backend.log, .run\frontend.log
echo Check it:  scripts\test-windows.cmd
echo Stop it:   scripts\stop-windows.cmd
exit /b 0

rem ---------------------------------------------------------------- helpers

:require_node
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node 18 or newer from https://nodejs.org/ and run this again. 1>&2
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)"
if errorlevel 1 (
  echo Node.js 18 or newer is needed. Update it from https://nodejs.org/ and run this again. 1>&2
  exit /b 1
)
exit /b 0

:require_free_ports
powershell -NoProfile -Command "$held = Get-NetTCPConnection -State Listen -LocalPort %STATIC_PORT%,%HDL_WS_PORT% -ErrorAction SilentlyContinue; if ($held) { $held | Select-Object -Unique LocalPort, OwningProcess | ForEach-Object { 'Port ' + $_.LocalPort + ' is already in use (pid ' + $_.OwningProcess + ').' }; exit 1 }; exit 0"
if errorlevel 1 (
  echo Stop what holds the port first - scripts\stop-windows.cmd stops HDLBoard's own servers. 1>&2
  exit /b 1
)
exit /b 0

:npm_install
pushd "%~1"
powershell -NoProfile -Command "$stamp = 'node_modules\.package-lock.json'; if (-not (Test-Path $stamp) -or (Get-Item package-lock.json).LastWriteTime -gt (Get-Item $stamp).LastWriteTime) { exit 1 }; exit 0"
if errorlevel 1 (
  echo === npm install in %~1 ===
  call npm.cmd install
  if errorlevel 1 (
    popd
    echo npm install failed in %~1 1>&2
    exit /b 1
  )
)
popd
exit /b 0

:vendor_tools
if not exist "%GHDL_DIR%\bin\ghdl.exe" (
  echo === Fetching GHDL into winInstaller\vendor\ghdl ===
  powershell -NoProfile -ExecutionPolicy Bypass -File winInstaller\fetch-ghdl.ps1
  if errorlevel 1 exit /b 1
)
if not exist "%IVERILOG_DIR%\iverilog.exe" (
  echo === Fetching Icarus Verilog into winInstaller\vendor\iverilog ===
  powershell -NoProfile -ExecutionPolicy Bypass -File winInstaller\fetch-iverilog.ps1
  if errorlevel 1 exit /b 1
)
exit /b 0

:wait_for_ports
powershell -NoProfile -Command "$until = (Get-Date).AddSeconds(30); while ((Get-Date) -lt $until) { $up = @(Get-NetTCPConnection -State Listen -LocalPort %STATIC_PORT%,%HDL_WS_PORT% -ErrorAction SilentlyContinue | Select-Object -Unique LocalPort); if ($up.Count -ge 2) { exit 0 }; Start-Sleep -Milliseconds 500 }; exit 1"
exit /b %errorlevel%
