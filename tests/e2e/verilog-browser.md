<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# Verilog browser end-to-end runbook

Executed by Claude through the Claude-in-Chrome extension (plan § 7.7). No script, no dependency.

## Prerequisites

- Frontend: `npx vite --port 5173 --strictPort`
- Backend: `cd server && npm run build`, then `node dist/server.js` with `ghdl` on `PATH` and
  `IVERILOG_DIR=<repo>\winInstaller\vendor\iverilog` (absolute, backslashes) set.
- A fresh tab on `http://localhost:5173/`.

## Helpers (paste with `javascript_tool`)

```js
window.__drop = async (name, text) => {
  const panel = document.querySelector('.wb-files');
  const dt = new DataTransfer();
  dt.items.add(new File([text], name, { type: 'text/plain' }));
  for (const t of ['dragenter', 'dragover', 'drop'])
    panel.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true }));
  await new Promise(r => setTimeout(r, 400));
};
window.__tree = () => [...document.querySelectorAll('.wb-files__folder')].map(f =>
  f.querySelector('.wb-files__folder-label').textContent.trim() + ': ' +
  [...f.querySelectorAll('.wb-files__file .wb-files__label-text')].map(e => e.textContent).join(', '));
window.__console = () => [...document.querySelectorAll('.wb-console__body .wb-console__line')].map(e => e.textContent);
```

DOM hooks: `.wb-files__top-dot` (`aria-label` names the file), `.wb-simcard__top`, `.wb-simcard__button.is-start|.is-stop`,
`.wb-simcard__status`, `.pb-switches button[role=switch]`, `.pb-leds [role=img]` (label ends in `on`/`off`).
Note: `computer` clicks use the screenshot frame, which is about 1.46x smaller than the page's CSS pixels; click the
top dot through the DOM (`.click()`) and use real clicks for Start/Stop and a switch.
Before E-7 run `window.confirm = () => true`.

## Cases and last results (2026-09-26, Chrome + Vite dev server, Icarus 13.0 bundled tree, GHDL 5.0.1)

| Id | Case | Result |
|---|---|---|
| E-1 | Drop `inv.v` | Pass: appears under `verilog/`, not `vhdl/` |
| E-2 | Drop `.vhd`, `tb_x.vhd`, `tb_y.v`, `notes.txt` | Pass: `vhdl/`, `work/`, `verilog/`; `.txt` rejected with `Skipped notes.txt: not a .vhd / .vhdl / .v / .vh file.` |
| E-3 | Mark `inv.v` top, Start, click SW0 with a real click | Pass: LEDs followed |
| E-4 | `assign LEDR = ~SW;` | Pass: all LEDs on with all switches off; SW0 on gave `1111111110`. With the backend stopped, Start reports `Could not reach the simulation backend` and the LEDs stay off, so the result needs Icarus |
| E-5 | Console after Start | Pass: `Icarus Verilog version 13.0 (stable) (v13_0)`, `Simulation running ...`, the design's `$display` |
| E-6 | VHDL top, Start; then Verilog top again | Pass: `GHDL 5.0.1 (mcode)`, LEDs follow; Verilog run works again afterwards |
| E-7 | Delete the Verilog top (confirm stubbed) | Pass: top falls to another `verilog/` file; the VHDL dot is not lit |
| E-8 | Rename `tb_y.v` to `tb_y.vhd` | Moved, but to `work/`, because a VHDL `tb_` name belongs there (same rule as upload). Use a non-`tb_` name to see `vhdl/` (unit cases K-8, K-9). A top file renamed into `work/` keeps the top role but is not sent; known edge |

Browser console errors: none. GIFs of E-3, E-4 and E-6 were not recorded in this run.
