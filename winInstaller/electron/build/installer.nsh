; SPDX-License-Identifier: GPL-2.0-only
; Copyright (C) 2026 Rune Langøy
;
; Custom NSIS hooks, pulled in via `nsis.include` in electron-builder.yml.

!macro customUnInstall
  ; electron-builder's uninstaller deletes every file it installed but
  ; leaves the installation directory itself behind. Observed effect: a
  ; later run of Setup.exe reports "There is already a per-user
  ; installation ... Will reinstall/upgrade" instead of presenting as a
  ; clean first install, because the directory it probes for still exists.
  ;
  ; This macro cannot simply RMDir: it runs *before* the app's files are
  ; removed (verified — a plain RMDir here is a silent no-op on a
  ; still-populated directory), and the uninstaller is itself executing
  ; from $INSTDIR and holding it open.
  ;
  ; So the removal is handed to a detached cmd that waits for this process
  ; to exit first. `rmdir` WITHOUT /s deletes the directory only if it is
  ; genuinely empty by then, so anything the user chose to keep in there
  ; survives — the reason not to reach for a recursive delete, which on a
  ; custom install location could take far more than this app with it.
  ;
  ; It polls for the directory to become empty instead of waiting a fixed
  ; delay. Deleting ~324 MB was measured at 9 s, 44 s, 186 s and 307 s on
  ; four consecutive runs of the same machine — antivirus scanning the
  ; deletes — so no fixed budget is defensible; an earlier 5-minute
  ; version expired seconds before the 307 s run finished. The deadline
  ; here is therefore generous, and the loop exits the instant it wins,
  ; so the normal case is one pass and costs nothing.
  ;
  ; Directory::Delete's single-argument overload is NON-recursive: it
  ; throws if anything is still in there, so a user's own files are never
  ; destroyed. That is the whole reason not to reach for a recursive
  ; delete, which on a custom install location could take far more than
  ; this app with it. The catch swallows exactly that expected throw.
  ;
  ; SW_HIDE because this outlives the uninstaller by design — a console
  ; sitting visible for the minutes it may wait would be a worse artefact
  ; than the stray directory it exists to remove.
  ; The cleanup is written out as a script file rather than passed as
  ; -Command: an inline command has to survive both NSIS string escaping
  ; and PowerShell quoting at once, and an earlier attempt that did so
  ; silently did nothing at all. A path argument has no such hazard.
  FileOpen $1 "$TEMP\hdl-board-cleanup.ps1" w
  FileWrite $1 "$$dir = '$INSTDIR'$\r$\n"
  FileWrite $1 "$$deadline = (Get-Date).AddMinutes(20)$\r$\n"
  FileWrite $1 "while ((Get-Date) -lt $$deadline) {$\r$\n"
  FileWrite $1 "  Start-Sleep -Seconds 2$\r$\n"
  FileWrite $1 "  if (-not (Test-Path -LiteralPath $$dir)) { break }$\r$\n"
  ; Only attempt the delete once nothing is left inside: Delete() on a
  ; populated directory throws, and there is no point generating an
  ; exception every two seconds for several minutes.
  FileWrite $1 "  if (Get-ChildItem -LiteralPath $$dir -Force -EA 0) { continue }$\r$\n"
  FileWrite $1 "  try { [IO.Directory]::Delete($$dir); break } catch { }$\r$\n"
  FileWrite $1 "}$\r$\n"
  ; Leaves no trace of itself behind, having just argued that leftovers
  ; are the problem.
  FileWrite $1 "Remove-Item -LiteralPath $$PSCommandPath -Force -EA 0$\r$\n"
  FileClose $1
  ExecShell "" "powershell.exe" '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$TEMP\hdl-board-cleanup.ps1"' SW_HIDE
!macroend
