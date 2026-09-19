# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Downloads the GHDL release the installer vendors, verifies it, and unpacks
# it to winInstaller/vendor/ghdl/.
#
# Why the `ucrt64` zip and not one of the `mingw-w64-*.pkg.tar.zst` packages:
# the zip is self-contained (ghdl.exe, the three DLLs it links, and the
# analyzed standard libraries), so installing it is an unpack. The .pkg.tar.zst
# variants are MSYS2 packages that assume an MSYS2 root and a package manager
# to resolve their dependencies — components this installer would then have to
# ship and wire up. UCRT is the Windows 10+ system C runtime, so the ucrt64
# build needs nothing preinstalled on a student's machine.
#
# Idempotent: re-running is a no-op once VERSION.txt matches, unless -Force.

[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$GhdlTag    = "v5.0.1"
$GhdlAsset  = "ghdl-mcode-5.0.1-ucrt64.zip"
$GhdlSha256 = "1B5F203DD498A2C17715E832762B849C3230878C80258430436E76A48123E793"

$AssetUrl   = "https://github.com/ghdl/ghdl/releases/download/$GhdlTag/$GhdlAsset"
# The release zip carries no license text; GPL-2.0 distribution requires it,
# so it comes from the repo at the same tag.
$CopyingUrl = "https://raw.githubusercontent.com/ghdl/ghdl/$GhdlTag/COPYING.md"

$VendorDir  = Join-Path $PSScriptRoot "vendor"
$GhdlDir    = Join-Path $VendorDir "ghdl"
$VersionTxt = Join-Path $GhdlDir "VERSION.txt"

$Stamp = "ghdl $GhdlTag mcode ucrt64 ($GhdlAsset)"

if ((Test-Path $VersionTxt) -and -not $Force) {
  $existing = (Get-Content $VersionTxt -Raw).Trim()
  if ($existing -like "*$Stamp*") {
    Write-Host "GHDL $GhdlTag already present in vendor/ghdl - nothing to do (use -Force to refetch)."
    exit 0
  }
  Write-Host "vendor/ghdl holds a different version; replacing it."
}

New-Item -ItemType Directory -Force $VendorDir | Out-Null
$zipPath   = Join-Path $VendorDir $GhdlAsset
$unpackDir = Join-Path $VendorDir "_unpack"

$ProgressPreference = 'SilentlyContinue'   # Invoke-WebRequest is ~10x slower with the progress bar.

Write-Host "Downloading $GhdlAsset ..."
Invoke-WebRequest -Uri $AssetUrl -OutFile $zipPath

Write-Host "Verifying SHA-256 ..."
$actual = (Get-FileHash $zipPath -Algorithm SHA256).Hash
if ($actual -ne $GhdlSha256) {
  Remove-Item $zipPath -Force
  throw "SHA-256 mismatch for ${GhdlAsset}:`n  expected $GhdlSha256`n  actual   $actual`nRefusing to unpack. If the upstream asset was legitimately rewritten, update `$GhdlSha256 in this script after verifying the new file by hand."
}

Write-Host "Unpacking ..."
Remove-Item -Recurse -Force $unpackDir -ErrorAction SilentlyContinue
Expand-Archive -Path $zipPath -DestinationPath $unpackDir -Force

if (-not (Test-Path (Join-Path $unpackDir "bin\ghdl.exe"))) {
  throw "Unpacked archive has no bin\ghdl.exe - the asset layout changed. Inspect $unpackDir."
}

Write-Host "Fetching COPYING (GPL-2.0 text, from the repo at $GhdlTag) ..."
Invoke-WebRequest -Uri $CopyingUrl -OutFile (Join-Path $unpackDir "COPYING")

Set-Content -Path (Join-Path $unpackDir "VERSION.txt") -Encoding utf8 -Value @"
$Stamp
Source: https://github.com/ghdl/ghdl/releases/tag/$GhdlTag
Repository at this tag: https://github.com/ghdl/ghdl/tree/$GhdlTag
SHA-256 ($GhdlAsset): $GhdlSha256
Fetched: $(Get-Date -Format 'yyyy-MM-dd')

GHDL is Copyright (C) 2003-2025 Tristan Gingold and the GHDL contributors,
licensed under GPL-2.0. Full text in COPYING, alongside this file.
"@

Remove-Item -Recurse -Force $GhdlDir -ErrorAction SilentlyContinue
Move-Item $unpackDir $GhdlDir
Remove-Item $zipPath -Force

$v = & (Join-Path $GhdlDir "bin\ghdl.exe") --version | Select-Object -First 1
Write-Host "Done: $v"
Write-Host "  -> $GhdlDir"
