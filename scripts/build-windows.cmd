@echo off
rem SPDX-License-Identifier: GPL-2.0-only
rem Copyright (C) 2026 Rune Langoy
rem
rem Builds the Windows installer, winInstaller\output\HDLBoard-Setup-<version>.exe,
rem from this checkout: winInstaller\build.ps1 run with the execution policy it
rem needs, after checking Node.js. See docs/BUILDING.md "Building the Windows installer".
rem
rem   scripts\build-windows.cmd                 the full build
rem   scripts\build-windows.cmd -SkipAppBuild   repackage only, reusing dist\ and server\dist\
rem   scripts\build-windows.cmd -CleanInstall   reinstall the Electron dependencies first
rem
rem Close a running HDLBoard first: it locks files the build overwrites.

setlocal EnableExtensions
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install Node 18 or newer from https://nodejs.org/ and run this again. 1>&2
  exit /b 1
)

tasklist /FI "IMAGENAME eq HDLBoard.exe" | find /I "HDLBoard.exe" >nul
if not errorlevel 1 (
  echo HDLBoard is running. Close it first: it locks files the build overwrites. 1>&2
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File winInstaller\build.ps1 %*
if errorlevel 1 (
  echo The installer build failed - see the output above. 1>&2
  exit /b 1
)

echo.
powershell -NoProfile -Command "Get-ChildItem winInstaller\output\HDLBoard-Setup-*.exe | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { 'Installer: ' + $_.FullName }"
exit /b 0
