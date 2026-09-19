# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Builds the Windows installer, end to end, from a clean checkout.
#
#   winInstaller\build.ps1
#
# Produces winInstaller\output\DE1-SoC Workbench-Setup-<version>.exe
#
# The two source projects are built by their own npm scripts and are never
# reached into for anything else: this script consumes only their build
# output (dist/ and server/dist/), which is what keeps winInstaller/ a
# strictly additive layer over the existing repo.

[CmdletBinding()]
param(
  # Skip the two npm builds — for iterating on packaging alone.
  [switch]$SkipAppBuild,
  # Reinstall electron/node_modules from the lockfile.
  [switch]$CleanInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$WinDir      = $PSScriptRoot
$RepoRoot    = Split-Path $WinDir -Parent
$ElectronDir = Join-Path $WinDir "electron"
$ResDir      = Join-Path $ElectronDir "resources"
$VendorGhdl  = Join-Path $WinDir "vendor\ghdl"

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# npm on Windows is npm.cmd, and a bare `npm` inside a script resolves
# inconsistently depending on how PowerShell was launched.
function Invoke-Npm {
  param([string]$WorkDir, [string[]]$NpmArgs)
  Push-Location $WorkDir
  try {
    & npm.cmd @NpmArgs
    if ($LASTEXITCODE -ne 0) { throw "npm $($NpmArgs -join ' ') failed in $WorkDir (exit $LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
}

# --- 0. GHDL must be vendored before anything is assembled ---------------
Step "Checking vendored GHDL"
if (-not (Test-Path (Join-Path $VendorGhdl "bin\ghdl.exe"))) {
  Write-Host "vendor/ghdl missing - running fetch-ghdl.ps1"
  & (Join-Path $WinDir "fetch-ghdl.ps1")
  if ($LASTEXITCODE -ne 0) { throw "fetch-ghdl.ps1 failed" }
} else {
  $v = & (Join-Path $VendorGhdl "bin\ghdl.exe") --version | Select-Object -First 1
  Write-Host "  $v"
}

# --- 1. Frontend ---------------------------------------------------------
if (-not $SkipAppBuild) {
  Step "Building frontend (repo root)"
  if (-not (Test-Path (Join-Path $RepoRoot "node_modules"))) { Invoke-Npm $RepoRoot @("install") }
  Invoke-Npm $RepoRoot @("run", "build")
}
if (-not (Test-Path (Join-Path $RepoRoot "dist\index.html"))) {
  throw "No frontend build at $RepoRoot\dist - run without -SkipAppBuild."
}

# --- 2. Backend ----------------------------------------------------------
if (-not $SkipAppBuild) {
  Step "Building backend (server/)"
  $serverDir = Join-Path $RepoRoot "server"
  if (-not (Test-Path (Join-Path $serverDir "node_modules"))) { Invoke-Npm $serverDir @("install") }
  Invoke-Npm $serverDir @("run", "build")
}
if (-not (Test-Path (Join-Path $RepoRoot "server\dist\server.js"))) {
  throw "No backend build at $RepoRoot\server\dist - run without -SkipAppBuild."
}

# --- 3. Electron project deps -------------------------------------------
Step "Installing desktop build dependencies"
if ($CleanInstall -and (Test-Path (Join-Path $ElectronDir "node_modules"))) {
  Remove-Item -Recurse -Force (Join-Path $ElectronDir "node_modules")
}
if (-not (Test-Path (Join-Path $ElectronDir "node_modules"))) {
  # `ci` needs a lockfile; a fresh clone of this folder may not have one.
  if (Test-Path (Join-Path $ElectronDir "package-lock.json")) {
    Invoke-Npm $ElectronDir @("ci")
  } else {
    Invoke-Npm $ElectronDir @("install")
  }
}

# --- 4. Branding assets --------------------------------------------------
Step "Branding assets"
$iconPath    = Join-Path $ElectronDir "build\icon.ico"
$sidebarPath = Join-Path $ElectronDir "build\installerSidebar.bmp"
if ((-not (Test-Path $iconPath)) -or (-not (Test-Path $sidebarPath))) {
  Write-Host "  rendering icon.ico + installerSidebar.bmp from the project logo"
  & (Join-Path $ElectronDir "node_modules\.bin\electron.cmd") (Join-Path $WinDir "make-assets.cjs")
  if (-not (Test-Path $iconPath))    { throw "icon generation failed" }
  if (-not (Test-Path $sidebarPath)) { throw "sidebar generation failed" }
} else {
  Write-Host "  using existing build\icon.ico and build\installerSidebar.bmp"
}

# --- 5. Assemble resources/ ---------------------------------------------
Step "Assembling resources/"
# Rebuilt from scratch every time: a stale frontend or an old GHDL left
# behind here would ship silently.
Remove-Item -Recurse -Force $ResDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $ResDir | Out-Null

Write-Host "  backend.mjs (esbuild, ws inlined)"
Push-Location $ElectronDir
try {
  & node "build-backend.mjs"
  if ($LASTEXITCODE -ne 0) { throw "backend bundling failed" }
} finally {
  Pop-Location
}

Write-Host "  frontend/"
Copy-Item -Recurse (Join-Path $RepoRoot "dist") (Join-Path $ResDir "frontend")

Write-Host "  ghdl/"
Copy-Item -Recurse $VendorGhdl (Join-Path $ResDir "ghdl")

if (-not (Test-Path (Join-Path $ResDir "ghdl\COPYING"))) {
  throw "resources\ghdl\COPYING is missing - the license page references it, so the installer must not ship without it."
}

# --- 6. Package ----------------------------------------------------------
Step "Running electron-builder (NSIS)"
Push-Location $ElectronDir
try {
  & (Join-Path $ElectronDir "node_modules\.bin\electron-builder.cmd") --win
  if ($LASTEXITCODE -ne 0) { throw "electron-builder failed (exit $LASTEXITCODE)" }
} finally {
  Pop-Location
}

Step "Done"
Get-ChildItem (Join-Path $WinDir "output") -Filter "*.exe" |
  Select-Object Name, @{n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } }, LastWriteTime |
  Format-Table -AutoSize
