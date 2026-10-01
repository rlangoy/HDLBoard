@echo off
rem SPDX-License-Identifier: GPL-2.0-only
rem Copyright (C) 2026 Rune Langoy
rem
rem Stops the servers scripts\start-windows.cmd started: the node process
rem listening on each port. A port held by anything other than node is reported
rem and left alone. Safe to run when nothing is running.
rem
rem   scripts\stop-windows.cmd
rem
rem Uses the same STATIC_PORT / HDL_WS_PORT as start-windows.cmd.

setlocal EnableExtensions
if not defined STATIC_PORT set "STATIC_PORT=5173"
if not defined HDL_WS_PORT set "HDL_WS_PORT=9010"

powershell -NoProfile -Command "foreach ($port in %STATIC_PORT%,%HDL_WS_PORT%) { $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1; if (-not $listener) { 'Port ' + $port + ': nothing running'; continue }; $process = Get-Process -Id $listener.OwningProcess; if ($process.ProcessName -ne 'node') { 'Port ' + $port + ': held by ' + $process.ProcessName + ' (pid ' + $process.Id + '), not stopped'; continue }; Stop-Process -Id $process.Id; 'Port ' + $port + ': stopped node (pid ' + $process.Id + ')' }"
