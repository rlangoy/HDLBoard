<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# Linux AppImage end-to-end runbook

Manual acceptance checks 6–12 of `docs/linux_appimage_spec.md`, on real desktops. Checks 1–5 are automated
(`.github/workflows/build-linux.yml`, `linuxAppImage/smoke-test.sh`). Record each run in the results table at the
end and in `linuxAppImage/README.md` § Tested on. A distribution is listed as supported only after a passing run.

## Prerequisites

- A **clean** Ubuntu 24.04 LTS desktop and a clean Linux Mint 22.x desktop, x86-64 (a VM is fine): no Node.js, no
  GHDL, no Icarus Verilog, no `libfuse2` (check: `ldconfig -p | grep libfuse.so.2` prints nothing).
- `HDLBoard-<version>-linux-x86_64.AppImage` and its `.sha256` from the draft release or the workflow artifact,
  copied to `~/Nedlastinger/` (or `~/Downloads/`).
- To read the log: `~/.config/HDLBoard/logs/backend.log`.

## Checks

### 6. Clean offline start

1. `sha256sum -c HDLBoard-*.AppImage.sha256` prints `OK`.
2. Turn the network **off**.
3. In the file manager: *Properties → Permissions → Allow executing file as program*, then double-click the file.
4. The HDLBoard window opens within ~10 s, without a terminal and without a password prompt.
5. In `backend.log`, note the `chromium sandbox:` line. On a default Ubuntu 24.04 / Mint 22 it is expected to read
   `off (--no-sandbox) - user namespaces unavailable …`.

### 7. VHDL

1. Choose the DE1-SoC board. Open the VHDL switch→LED example (or `tests/fixtures/vhdl/DE1_SoC.vhdl`), press
   **Start**. Flip SW0: LEDR0 follows.
2. Open `blinkTest.vhdl`, **Start**: LEDR0 toggles about twice per second (250 ms per state; time it against a
   stopwatch for 10 s ≈ 20 changes). **Stop**: it stops changing at once.
3. Add a VHDL testbench (`tests/fixtures/project/adder4.vhd` + `adder4_tb.vhdl`), run it: the console shows
   `PASS: all 256 additions correct` and the waveform opens.

### 8. Verilog

The same three steps with `DE1_SoC.v`, `blinkTest.v`, and `keyCouter2Led.v` + `tb_counter8.v` (prints `PASS`).

### 9. Bundled tools only

1. Make failing impostors first on `PATH`:
   ```sh
   mkdir -p ~/fake && for t in ghdl iverilog vvp; do printf '#!/bin/sh\necho FAKE >&2; exit 1\n' > ~/fake/$t; chmod +x ~/fake/$t; done
   PATH=~/fake:$PATH ~/Nedlastinger/HDLBoard-*.AppImage
   ```
   Checks 7.1 and 8.1 still work, and no output says `FAKE`.
2. Start it from another directory: `cd /tmp && ~/Nedlastinger/HDLBoard-*.AppImage`. Both languages work.
3. Path with a space and `ø`: `mkdir -p ~/"HDL Board ø" && cp ~/Nedlastinger/HDLBoard-*.AppImage ~/"HDL Board ø"/`
   and start it from there; then the extracted form in the same folder:
   `cd ~/"HDL Board ø" && ./HDLBoard-*.AppImage --appimage-extract && ./squashfs-root/AppRun`. Both languages work
   in both.

### 10. Persistence and cleanup

1. Save a project, close the app, start it again: the project reopens and a changed setting (for example the board)
   is kept.
2. With a VHDL board run active, close the window. Then `pgrep -a ghdl; pgrep -a vvp; grep .mount_HDLBo /proc/mounts`
   print nothing.
3. Start it from a terminal, start a Verilog board run, then from another terminal `pkill -TERM -f '/hdlboard'`.
   The same three commands print nothing; `backend.log` ends with `stopping backend`.
4. Start two copies: the second one's `backend.log` says `backend port: 9011`, and both simulate.

### 11. Failure is reported

```sh
./HDLBoard-*.AppImage --appimage-extract
chmod -x squashfs-root/resources/ghdl/bin/ghdl
./squashfs-root/AppRun
```

A dialog says *GHDL could not be started, so VHDL designs will not simulate*, with the reason (`EACCES`) and the
log path. Verilog still works. Restore with `chmod +x`.

### 12. FUSE fallback

On a system where the AppImage cannot mount (for example inside a container without `/dev/fuse`), the README's D2
steps work: `./HDLBoard-*.AppImage --appimage-extract` then `squashfs-root/AppRun`.
The AppImage uses a static runtime, so it is **not** expected to need `libfuse2` on Ubuntu 24.04 / Mint 22: record
whether check 6 passed without it.

## Results

| Date | Distribution | AppImage | GHDL / Icarus | 6 | 7 | 8 | 9 | 10 | 11 | 12 | Sandbox | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | Ubuntu 24.04 desktop | | 6.0.0 / 13.0 | | | | | | | | | not yet run |
| | Linux Mint 22.x | | 6.0.0 / 13.0 | | | | | | | | | not yet run |
