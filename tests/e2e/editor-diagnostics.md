<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# Editor error markers — browser runbook

Acceptance cases for `docs/editor_diagnostics_implementation_plan.md` § 6.4. Same prerequisites and style as
[`verilog-browser.md`](verilog-browser.md): Vite dev server plus a backend with GHDL and Icarus Verilog.

DOM hooks: `.wb-editor__line.is-error`, `.wb-editor__gutter-line.is-error[title]`, `.wb-editor__diag-inline`,
`.wb-editor__tab.has-errors`, `.wb-editor__body [role=status]`, `.wb-console__link`.

## Cases

| Id | Case | Expected | Result |
|---|---|---|---|
| E-D1 | In `DE1_SoC.vhdl` delete the `;` of `LEDR <= SW;` (line 27), Start | console as before; that line tinted red; gutter ✕ with the GHDL message in its tooltip; inline message; caret on that line; tab dot; status text names the error | faked backend only (2026-09-29) |
| E-D2 | then type one character anywhere in the file | all markers of the file gone | faked backend only |
| E-D3 | recreate E-D1, then **click** in the text (no typing) | markers gone | faked backend only |
| E-D4 | recreate E-D1, then click a **line number** | markers gone | faked backend only |
| E-D5 | error in a file whose tab is closed | the tab opens, becomes active, scrolled to the line | not run |
| E-D6 | Verilog: in `DE1_SoC.v` remove the `;` of `assign LEDR = SW;` (line 19) | red on line 19 (`Syntax error in left side of continuous assignment.`) **and** on line 23 (`syntax error`, tooltip shows the hint); caret on line 19 | not run |
| E-D7 | Verilog: assign to a `wire` from `always` (plan A.5 `regassign`) | red on the assign line; tooltip includes `LEDR is declared here as wire.`; the declaration line is **not** marked | not run |
| E-D8 | Verilog: implicit wire (plan A.5 `warn.v`) | amber on that line, run **still starts**, view not moved | not run |
| E-D9 | VHDL portless testbench with `assert false report "x" severity error;` | red on the assert line when it fires; view not moved | not run |
| E-D10 | `LEDR` declared `(7 downto 0)` (plan A.4 wrapper error) | console shows the internal error; **no** marker anywhere | not run |
| E-D11 | press Start again after E-D1 without fixing | old markers cleared, then the same line marked again | faked backend only |
| E-D12 | start a compile, type in the file before it finishes | no markers appear in that file | not run |
| E-D13 | console **Clear** after E-D1 | markers stay | faked backend only |
| E-D14 | click the error line in the console | file opens at the line; markers unchanged | link rendered; click not verified |
| E-D15 | VHDL testbench with `assert false report "x" severity error;` inside a clocked process (fires every cycle), accessibility tree open | the status text changes once, when the marker first appears, and not again while the assertion keeps firing; the page stays responsive | not run |
| E-D16 | after E-D1, select part of the error text in the console by dragging across it, and copy | the text is copied; the view does not jump to the file | not run |
| E-D17 | after E-D1 (the reveal has put the caret on the line), wait without touching anything | markers are still there: the reveal's own focus and scroll do not clear them | faked backend only |

"Faked backend only": checked with Chromium and a `WebSocket` stub that answers `RUN` with the plan's A.7 GHDL
capture, so the frontend behaviour is confirmed but no real simulator ran. Re-run every row against the real
backend before relying on this.
