@echo off
rem SPDX-License-Identifier: GPL-2.0-only
rem Copyright (C) 2026 Rune Langoy
rem
rem Checks a running HDLBoard on this machine - the docs/HOSTING.md section 11
rem checks, in one go:
rem   1. the page answers with 200
rem   2. the backend answers with 426 Upgrade Required (it speaks WebSocket)
rem   3. every board scenario runs, in VHDL and Verilog, through the backend
rem      (tools\verify-backend.mjs prints PASS/FAIL per scenario)
rem
rem   scripts\test-windows.cmd
rem
rem Start the servers first (scripts\start-windows.cmd). Uses the same
rem STATIC_PORT / HDL_WS_PORT. Exit code 0 only when everything passes.

setlocal EnableExtensions
cd /d "%~dp0.."
if not defined STATIC_PORT set "STATIC_PORT=5173"
if not defined HDL_WS_PORT set "HDL_WS_PORT=9010"

set "FAILED=0"
call :expect_status "Page" "http://localhost:%STATIC_PORT%/" 200
call :expect_status "Backend" "http://localhost:%HDL_WS_PORT%/hdlsim" 426

echo.
echo === Board scenarios through ws://localhost:%HDL_WS_PORT%/hdlsim ===
node tools\verify-backend.mjs ws://localhost:%HDL_WS_PORT%/hdlsim
if errorlevel 1 set "FAILED=1"

echo.
if "%FAILED%"=="1" (
  echo FAIL - see the lines above. 1>&2
  exit /b 1
)
echo PASS - the page, the backend, GHDL and Icarus Verilog all work.
echo Last check by hand: open http://localhost:%STATIC_PORT%/, press Start and flip a switch.
exit /b 0

:expect_status
set "STATUS="
for /f %%s in ('curl.exe -s -o NUL -w "%%{http_code}" %~2') do set "STATUS=%%s"
if "%STATUS%"=="%~3" (
  echo PASS  %~1 %~2 answered %STATUS%
) else (
  echo FAIL  %~1 %~2 answered %STATUS%, expected %~3 1>&2
  set "FAILED=1"
)
exit /b 0
