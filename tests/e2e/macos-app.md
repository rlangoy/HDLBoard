<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# macOS app end-to-end runbook

Manual checks of the DMGs on real Macs: what `.github/workflows/build-mac.yml` and `macDmg/smoke-test.sh` cannot
see. Above all, that is Gatekeeper's first start of a downloaded app. Record each run in the results table at
the end and in `macDmg/README.md` § Tests. A Mac is listed as supported only after a passing run.

## Prerequisites

- A Mac with Apple silicon on macOS 14, 15 or 26, and an Intel Mac on macOS 12 or later. Both clean: no
  Homebrew `ghdl` or `icarus-verilog` (check: `which ghdl iverilog vvp` prints nothing).
- `HDLBoard-<version>-arm64.dmg` or `-x64.dmg` and its `.sha256`, **downloaded with Safari** from the draft
  release or the workflow artifact. Safari marks the file as downloaded (quarantine), as a student's would be.
- To read the log: `~/Library/Application Support/HDLBoard/logs/backend.log`, or **Help › Open Logs Folder**.

## Checks

### 1. Download, install, first start

1. In Terminal: `cd ~/Downloads && shasum -a 256 -c HDLBoard-*.dmg.sha256` prints `OK`.
2. Double-click the DMG. The window shows HDLBoard and an Applications folder. Drag HDLBoard onto Applications,
   then eject the DMG.
3. Turn Wi-Fi **off**. Double-click HDLBoard in Applications. Note Gatekeeper's exact wording (it goes into the
   README):
   - macOS 15/26: *"HDLBoard" Not Opened*. Click **Done**, then **System Settings › Privacy & Security** ›
     **Open Anyway**, then the password.
   - macOS 14: *cannot be opened*. Right-click › **Open** › **Open**.
4. The window opens within ~10 s. No second Gatekeeper prompt appears for `ghdl` or `vvp`, now or at the first
   **Start** in checks 2–3. (This is the open question in `macDmg/README.md` § Signing and Gatekeeper. If one
   appears, note it and try the `xattr` line from the README.)
5. The Dock shows the HDLBoard icon, sharp, at the same size as its neighbours.

### 2. VHDL

1. Choose the DE1-SoC board, open the VHDL switch→LED example, press **Start**. Flip SW0: LEDR0 follows.
2. Open `blinkTest.vhdl`, **Start**: LEDR0 toggles about twice per second (250 ms per state; 10 s ≈ 20 changes
   against a stopwatch). **Stop**: it stops changing at once.
3. Add `tests/fixtures/project/adder4.vhd` + `adder4_tb.vhdl` and run the testbench. The console shows
   `PASS: all 256 additions correct` and the waveform opens.

### 3. Verilog

The same three steps with `DE1_SoC.v`, `blinkTest.v`, and `keyCouter2Led.v` + `tb_counter8.v` (prints `PASS`).

### 4. A Mac app

1. **⌘Q** quits. Then `pgrep -l ghdl; pgrep -l vvp` in Terminal prints nothing. The same with a board run active
   and the red close button.
2. **HDLBoard › About HDLBoard** shows the About dialog with this version.
3. ⌘C, ⌘V, ⌘X, ⌘Z and ⌘A work in the editor; ⌘S saves; ⌘F finds.
4. **Help › Open Logs Folder** opens Finder at `logs/`.
5. Projects page: a project saved to the projects folder has **Show in Finder** in its ⋮ menu, and it selects
   the file in Finder. The first time the app opens `Documents`, macOS asks for permission with HDLBoard's reason.
6. Settings › Updates: the check runs at start-up (Wi-Fi on) and points to the GitHub release.

### 5. Persistence and update

1. Save a project, quit, start again: the project reopens and a changed setting (the board) is kept.
2. Sign in to GitHub, quit, start again: still signed in. The keychain may ask about *HDLBoard Safe Storage*;
   **Always Allow**.
3. "Update": drag the same DMG's app over the installed one (Replace) and start it. Settings and projects are
   kept. Note whether Gatekeeper or the keychain asks again.

### 6. Odd places

1. Run HDLBoard straight from the mounted DMG, without dragging it to Applications. Both languages work.
2. Copy it to `~/Downloads/HDL Board ø/` and start it from there. Both languages work.

### 7. Failure is reported

```sh
cp -R /Applications/HDLBoard.app /tmp/HDLBoard.app
chmod -x /tmp/HDLBoard.app/Contents/Resources/ghdl/bin/ghdl
/tmp/HDLBoard.app/Contents/MacOS/HDLBoard
```

A dialog says *GHDL could not be started, so VHDL designs will not simulate*, with the reason (`EACCES`) and the
log path. Verilog still works. Delete `/tmp/HDLBoard.app` afterwards.

## Results

| Date | Mac | macOS | DMG | 1 | 2 | 3 | 4 | 5 | 6 | 7 | Gatekeeper wording | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | Apple silicon | 14 | arm64 | | | | | | | | | not yet run |
| | Apple silicon | 15 or 26 | arm64 | | | | | | | | | not yet run |
| | Intel | 12 or later | x64 | | | | | | | | | not yet run |
