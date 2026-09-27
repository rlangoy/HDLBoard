# SPDX-License-Identifier: GPL-2.0-only
# Copyright (C) 2026 Rune Langøy
#
# Smoke test for the assembled Icarus Verilog tree. Run by hand after
# fetch-iverilog.ps1 and by build.ps1 before anything is packaged:
#
#     winInstaller\verify-iverilog.ps1 [-TreeDir <dir>]
#
# It runs the tools EXACTLY as the backend will:
#   - `-B<dir>` for iverilog and `-M<dir>` for vvp, as backslash Windows paths;
#   - a child environment whose PATH is only System32;
#   - from a working directory whose name contains a space and a non-ASCII letter.
# Each of those is a condition under which a broken tree still looks fine on the
# build machine: PATH there usually holds an MSYS2 or GHDL directory that supplies
# the missing DLLs, and the user's own profile is usually plain ASCII. Checking
# results and not message text matters too - the OS's error text is localised.
#
# Exit code 0 when every check passes, 1 otherwise.
# See docs/Verilog_implementation_plan.md, sections 4 (M2, M11, M21) and 7.8.

[CmdletBinding()]
param(
  [string]$TreeDir
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

# Resolved here, not as the parameter's default: Windows PowerShell 5.1 leaves
# $PSScriptRoot empty inside a param block.
if (-not $TreeDir) { $TreeDir = Join-Path $PSScriptRoot "vendor\iverilog" }
$FixtureDir = Join-Path $PSScriptRoot "..\tests\fixtures\verilog"
$TreeDir = (Resolve-Path $TreeDir).Path
$Iverilog = Join-Path $TreeDir "iverilog.exe"
$Vvp = Join-Path $TreeDir "vvp.exe"

# Built from a code point: a literal "ø" in this file would be misread by Windows
# PowerShell 5.1 unless the file carried a byte-order mark.
$NonAsciiLetter = [char]0x00F8
$ChildPath = Join-Path $env:SystemRoot "System32"
$TimescaleFile = "_hdlboard_ts.v"
$CompileTimeoutMs = 30000
$BoardRunTimeoutMs = 8000
$PollIntervalMs = 50
$UnpacedGrantLines = 2000

$script:Failures = 0

function Write-Result([bool]$ok, [string]$name, [string]$detail = "") {
  $mark = if ($ok) { "PASS" } else { "FAIL"; $script:Failures++ }
  Write-Host ("{0}  {1}{2}" -f $mark, $name, $(if ($detail) { "  ($detail)" } else { "" }))
}

function ConvertTo-Argument([string]$value) {
  if ($value -match '[\s"]') { return '"' + $value.Replace('"', '\"') + '"' }
  return $value
}

function New-ChildProcess([string]$exe, [string[]]$arguments, [string]$workDir) {
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $exe
  $info.Arguments = ($arguments | ForEach-Object { ConvertTo-Argument $_ }) -join " "
  $info.WorkingDirectory = $workDir
  $info.UseShellExecute = $false
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.RedirectStandardInput = $true
  $info.EnvironmentVariables["PATH"] = $ChildPath   # only this child sees it
  return [System.Diagnostics.Process]::Start($info)
}

function Invoke-Tool([string]$exe, [string[]]$arguments, [string]$workDir) {
  $process = New-ChildProcess $exe $arguments $workDir
  $process.StandardInput.Close()
  $stdout = $process.StandardOutput.ReadToEndAsync()
  $stderr = $process.StandardError.ReadToEndAsync()
  if (-not $process.WaitForExit($CompileTimeoutMs)) { $process.Kill(); throw "$exe did not finish within $CompileTimeoutMs ms" }
  return @{ ExitCode = $process.ExitCode; Stdout = $stdout.Result; Stderr = $stderr.Result }
}

function New-WorkDir {
  $name = "hdlboard smoke $([guid]::NewGuid().ToString('N').Substring(0, 8)) $NonAsciiLetter"
  $path = Join-Path ([System.IO.Path]::GetTempPath()) $name
  New-Item -ItemType Directory $path | Out-Null
  Copy-Item (Join-Path $FixtureDir "*.v") $path
  Copy-Item (Join-Path $FixtureDir "golden\hdl_board_tb.DE1_SoC.v") $path
  Set-Content (Join-Path $path $TimescaleFile) "``timescale 1ns/1ps" -Encoding ascii
  return $path
}

function Invoke-Iverilog([string]$workDir, [string[]]$options, [string[]]$sources) {
  $arguments = @("-B$TreeDir", "-Wall", "-Wno-timescale", "-I.") + $options + @($TimescaleFile) + $sources
  return Invoke-Tool $Iverilog $arguments $workDir
}

function Test-CleanCompile([string]$workDir, [string]$label, [string]$top, [string[]]$sources) {
  $result = Invoke-Iverilog $workDir @("-s", $top, "-o", "$top.vvp") $sources
  $silent = ($result.Stdout + $result.Stderr).Trim().Length -eq 0
  Write-Result (($result.ExitCode -eq 0) -and $silent) "compiles clean: $label" "exit $($result.ExitCode)"
}

function Test-BatchTestbench([string]$workDir) {
  $run = Invoke-Tool $Vvp @("-M$TreeDir", "-n", "-i", "tb_counter8.vvp") $workDir
  Write-Result (($run.ExitCode -eq 0) -and ($run.Stdout -match "(?m)^PASS\s*$")) "batch testbench prints PASS" "exit $($run.ExitCode)"
}

function Wait-ForBoardState([string]$workDir) {
  $stateFile = Join-Path $workDir "output.txt"
  $deadline = [DateTime]::UtcNow.AddMilliseconds($BoardRunTimeoutMs)
  while ([DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Milliseconds $PollIntervalMs
    $line = if (Test-Path $stateFile) { (Get-Content $stateFile -ErrorAction SilentlyContinue | Select-Object -First 1) } else { $null }
    if ($line -match '^([01]{10})([01]{42}) (\d+)$' -and [int]$Matches[3] -ge 1) { return $Matches }
  }
  return $null
}

function Test-BoardRun([string]$workDir) {
  $compiled = Invoke-Iverilog $workDir @("-s", "hdl_board_tb", "-o", "board.vvp") @("hdl_board_tb.DE1_SoC.v", "DE1_SoC.v")
  if ($compiled.ExitCode -ne 0) { Write-Result $false "board wrapper compiles" $compiled.Stderr.Trim(); return }
  Set-Content (Join-Path $workDir "input.txt") "1 10101010101111" -Encoding ascii
  # Relative file names and stdin grants, as the backend gives them (M5, M11).
  $arguments = @("-M$TreeDir", "-n", "-i", "board.vvp", "+input_file=input.txt", "+output_file=output.txt", "+poll_interval_ns=10000", "+min_dwell_ns=10000")
  $process = New-ChildProcess $Vvp $arguments $workDir
  try {
    $process.StandardInput.Write("`n" * $UnpacedGrantLines)
    $process.StandardInput.Flush()
    $state = Wait-ForBoardState $workDir
  } finally {
    if (-not $process.HasExited) { $process.Kill() }
  }
  $ok = ($null -ne $state) -and ($state[1] -eq "1010101010") -and ($state[2] -eq ("1" * 42))
  Write-Result $ok "board run: switches reach the LEDs, displays blank" $(if ($ok) { "" } else { "no expected state in output.txt" })
}

function Test-Banner {
  $result = Invoke-Tool $Iverilog @("-B$TreeDir", "-V") $env:TEMP
  Write-Result (($result.ExitCode -eq 0) -and ($result.Stdout -match "Icarus Verilog version 1[23]\.")) "iverilog -V names a supported version" ($result.Stdout -split "`n" | Select-Object -First 1)
}

$workDir = New-WorkDir
Write-Host "Verifying $TreeDir"
Write-Host "  from   $workDir"
try {
  Test-Banner
  Test-CleanCompile $workDir "DE1_SoC.v" "DE1_SoC" @("DE1_SoC.v")
  Test-CleanCompile $workDir "blinkTest.v" "blinkTest" @("blinkTest.v")
  Test-CleanCompile $workDir "keyCouter2Led.v" "counter8" @("keyCouter2Led.v")
  Test-CleanCompile $workDir "tb_counter8.v" "tb_counter8" @("keyCouter2Led.v", "tb_counter8.v")
  Test-BatchTestbench $workDir
  Test-BoardRun $workDir
} finally {
  Remove-Item -Recurse -Force $workDir -ErrorAction SilentlyContinue
}

if ($script:Failures -gt 0) {
  Write-Host "`n$($script:Failures) check(s) FAILED." -ForegroundColor Red
  exit 1
}
Write-Host "`nAll checks passed." -ForegroundColor Green
exit 0
