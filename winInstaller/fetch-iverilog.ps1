# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Downloads the pinned MSYS2 packages that make up Icarus Verilog for Windows,
# verifies each against its SHA-256, and assembles them into ONE flat directory,
# winInstaller/vendor/iverilog/, that the backend runs as
#
#     iverilog -B<dir> ...      vvp -M<dir> ...
#
# Why assembled and not unpacked: unlike GHDL, Icarus ships no self-contained zip
# for Windows, so the tree is built from MSYS2's `ucrt64` packages (the same
# toolchain family as the vendored GHDL; the Windows 10+ system C runtime).
#
# Why ONE flat directory (docs/Verilog_implementation_plan.md, M2 and M21):
#   - iverilog.exe starts lib/ivl/ivl.exe, and Windows finds a program's DLLs next
#     to that program. A bin/ + lib/ivl/ layout therefore needs every DLL twice, or
#     a modified PATH on every spawn. One directory needs each DLL once and does not
#     depend on PATH at all.
#   - Every .vpi module must be kept: iverilog.exe loads a fixed list of them on
#     every compile, and a missing one only prints an error while still exiting 0.
#   - The -B directory must be a backslash Windows path; with forward slashes
#     iverilog reaches ivl through cmd.exe, which cannot parse `C:/...`.
#
# Idempotent: re-running is a no-op once VERSION.txt matches the pins, unless -Force.
# Needs Windows' built-in tar.exe (bsdtar with zstd), present on Windows 10 1803+
# and 11. That is a build-machine requirement only; end users never run this.

[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$RepoUrl = "https://repo.msys2.org/mingw/ucrt64/"
$SourcesUrl = "https://repo.msys2.org/mingw/sources/"

# One row per package: a short name, the file as MSYS2 names it, and its SHA-256
# (computed locally when these pins were chosen). Bump a pin only together with its hash,
# and re-verify the whole tree with verify-iverilog.ps1.
$Packages = @(
  @{ Name = "iverilog";     File = "mingw-w64-ucrt-x86_64-iverilog-1~13.0-2-any.pkg.tar.zst";                     Sha256 = "FD4D7D7CB60CDA1EB437F5476673503D92964CF47CE6C11B460EB3BD05C43582" },
  @{ Name = "readline";     File = "mingw-w64-ucrt-x86_64-readline-8.3.003-1-any.pkg.tar.zst";                    Sha256 = "DE2423C2E10FCD88272A0AB2F833F6A082CFE613D4C17C2F548CC50A5D2190C4" },
  @{ Name = "termcap";      File = "mingw-w64-ucrt-x86_64-termcap-1.3.1-7-any.pkg.tar.zst";                        Sha256 = "17B78EB63E89458A6AE4D56AA1DC357E1DECB2F845B29FDED79BCCDD628D9D41" },
  @{ Name = "zlib";         File = "mingw-w64-ucrt-x86_64-zlib-1.3.2-2-any.pkg.tar.zst";                          Sha256 = "841401182976D2F9E17E5C0EBAAC51F2A8014140EA53D67625E91C8FB3C85EA0" },
  @{ Name = "bzip2";        File = "mingw-w64-ucrt-x86_64-bzip2-1.0.8-4-any.pkg.tar.zst";                          Sha256 = "F03A2174034DDD2D96CECD34F617C5F8E2EF86C812B8D2BB3B8875257F2C8BFA" },
  @{ Name = "winpthreads";  File = "mingw-w64-ucrt-x86_64-libwinpthread-14.0.0.r426.g4564ee4b5-1-any.pkg.tar.zst"; Sha256 = "F8DE8153BBC0E47BA244A423C12C426FA1D9F56395117ECAA34C6AD6EBED6CA3" },
  @{ Name = "libgcc";       File = "mingw-w64-ucrt-x86_64-libgcc-16.2.0-4-any.pkg.tar.zst";                       Sha256 = "DE65B4ADAE899D9278427402E29D03860BACBA481794460F3A1D078610CBB783" },
  @{ Name = "libstdcxx";    File = "mingw-w64-ucrt-x86_64-libstdc++-16.2.0-4-any.pkg.tar.zst";                    Sha256 = "2211DBBF1220287E49F5D66BB6CB09EE5A157901A485197553C9A940CC902D5B" }
)

# Targets and tools HDLBoard never runs. Everything ELSE in lib/ivl is kept — a
# deny-list, never an allow-list: an allow-list is how a needed .vpi gets dropped.
$UnusedTargets = @("blif", "pcb", "sizer", "vlog95", "vhdl")
$UnusedFiles = @("vhdlpp.exe", "iverilog-vpi.exe", "libvpi.a")

# What must exist for the tree to work; checked after assembly so a package layout
# change fails here, loudly, and not on a student's machine.
$RequiredFiles = @(
  "iverilog.exe", "vvp.exe", "ivl.exe", "ivlpp.exe", "vvp.tgt", "vvp.conf", "null.tgt", "stub.tgt",
  "system.vpi", "v2005_math.vpi", "v2009.vpi", "va_math.vpi", "vhdl_sys.vpi", "vhdl_textio.vpi",
  "libgcc_s_seh-1.dll", "libstdc++-6.dll", "libwinpthread-1.dll", "zlib1.dll", "libbz2-1.dll",
  "libreadline8.dll", "libhistory8.dll", "libtermcap-0.dll", "COPYING"
)

$VendorDir = Join-Path $PSScriptRoot "vendor"
$TreeDir = Join-Path $VendorDir "iverilog"
$CacheDir = Join-Path $VendorDir "_downloads"
$UnpackDir = Join-Path $VendorDir "_unpack_iverilog"
$VersionFile = Join-Path $TreeDir "VERSION.txt"
$Tar = Join-Path $env:SystemRoot "System32\tar.exe"

$ProgressPreference = "SilentlyContinue"   # Invoke-WebRequest is ~10x slower with the progress bar.

function Get-PinStamp {
  # Identifies this exact set of pins, so a bumped pin invalidates an existing tree.
  $joined = ($Packages | ForEach-Object { $_.Sha256 }) -join ""
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($joined)
  $hash = [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash($bytes)).Replace("-", "")
  return "iverilog 13.0 ucrt64 flat tree, pins " + $hash.Substring(0, 16)
}

function Test-TreeIsCurrent([string]$stamp) {
  if ($Force -or -not (Test-Path $VersionFile)) { return $false }
  return ((Get-Content $VersionFile -Raw) -like "*$stamp*")
}

function Get-FileSha256([string]$path) {
  return (Get-FileHash $path -Algorithm SHA256).Hash
}

function Save-Package($package) {
  $path = Join-Path $CacheDir $package.File
  $url = $RepoUrl + [uri]::EscapeDataString($package.File)
  Write-Host "  downloading $($package.File)"
  Invoke-WebRequest -Uri $url -OutFile $path
  return $path
}

function Get-VerifiedPackage($package) {
  $path = Join-Path $CacheDir $package.File
  $cachedIsGood = (Test-Path $path) -and ((Get-FileSha256 $path) -eq $package.Sha256)
  if (-not $cachedIsGood) { $path = Save-Package $package }
  $actual = Get-FileSha256 $path
  if ($actual -ne $package.Sha256) {
    Remove-Item $path -Force
    throw "SHA-256 mismatch for $($package.File):`n  expected $($package.Sha256)`n  actual   $actual`nRefusing to unpack. If MSYS2 legitimately republished this file, verify the new one by hand and update its pin."
  }
  return $path
}

function Expand-Package($package, [string]$archivePath) {
  $destination = Join-Path $UnpackDir $package.Name
  New-Item -ItemType Directory -Force $destination | Out-Null
  & $Tar -xf $archivePath -C $destination
  if ($LASTEXITCODE -ne 0) { throw "tar failed unpacking $($package.File) (exit $LASTEXITCODE)" }
  return (Join-Path $destination "ucrt64")
}

function Copy-IcarusFiles([string]$root) {
  Copy-Item (Join-Path $root "bin\iverilog.exe") $TreeDir
  Copy-Item (Join-Path $root "bin\vvp.exe") $TreeDir
  $unused = $UnusedFiles + ($UnusedTargets | ForEach-Object { "$_.tgt"; "$_.conf"; "$_-s.conf" })
  Get-ChildItem (Join-Path $root "lib\ivl") -File |
    Where-Object { $unused -notcontains $_.Name } |
    Copy-Item -Destination $TreeDir
}

function Copy-RuntimeDlls([string]$root) {
  Get-ChildItem (Join-Path $root "bin") -Filter *.dll -File | Copy-Item -Destination $TreeDir
}

function Copy-Licenses($package, [string]$root) {
  $licenseDir = Join-Path $root "share\licenses"
  if (-not (Test-Path $licenseDir)) { return }
  $destination = Join-Path $TreeDir "licenses\$($package.Name)"
  New-Item -ItemType Directory -Force $destination | Out-Null
  Copy-Item (Join-Path $licenseDir "*") $destination -Recurse
}

function Assert-TreeIsComplete {
  $missing = $RequiredFiles | Where-Object { -not (Test-Path (Join-Path $TreeDir $_)) }
  if ($missing) { throw "The assembled tree is missing: $($missing -join ', '). A package layout changed - inspect $UnpackDir." }
}

function Write-VersionFile([string]$stamp) {
  $rows = ($Packages | ForEach-Object { "  $($_.File)`n    SHA-256 $($_.Sha256)" }) -join "`n"
  Set-Content -Path $VersionFile -Encoding utf8 -Value @"
$stamp
Source: MSYS2 ucrt64 packages from $RepoUrl
Matching source packages (GPL): $SourcesUrl
Recipe: https://github.com/msys2/MINGW-packages/tree/master/mingw-w64-iverilog
Upstream: https://github.com/steveicarus/iverilog at tag v13_0

Packages:
$rows

Fetched: $(Get-Date -Format 'yyyy-MM-dd')

Icarus Verilog is Copyright (C) 2000-2026 Stephen Williams, licensed GPL-2.0-or-later
(full text in COPYING). The runtime libraries keep their own licenses, in licenses/.
"@
}

function Build-Tree {
  New-Item -ItemType Directory -Force $CacheDir | Out-Null
  Remove-Item -Recurse -Force $UnpackDir, $TreeDir -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $UnpackDir, $TreeDir | Out-Null
  foreach ($package in $Packages) {
    $root = Expand-Package $package (Get-VerifiedPackage $package)
    Copy-RuntimeDlls $root
    Copy-Licenses $package $root
    if ($package.Name -eq "iverilog") {
      Copy-IcarusFiles $root
      Copy-Item (Join-Path $root "share\licenses\iverilog\COPYING") $TreeDir
    }
  }
  Assert-TreeIsComplete
  Remove-Item -Recurse -Force $UnpackDir
}

if (-not (Test-Path $Tar)) { throw "Windows' built-in tar.exe was not found at $Tar (needs Windows 10 1803+ or 11)." }

$stamp = Get-PinStamp
if (Test-TreeIsCurrent $stamp) {
  Write-Host "Icarus Verilog already present in vendor/iverilog - nothing to do (use -Force to rebuild)."
  exit 0
}

Write-Host "Assembling vendor/iverilog from $($Packages.Count) pinned packages ..."
Build-Tree
Write-VersionFile $stamp

$banner = & (Join-Path $TreeDir "iverilog.exe") -V | Select-Object -First 1
Write-Host "Done: $banner"
Write-Host "  -> $TreeDir"
