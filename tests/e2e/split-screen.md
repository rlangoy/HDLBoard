<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# Testbench split view — manual check

Run after changing `tbDetect/`, `editorView.ts`, `editorSplit.ts`, `useTestbenchSplit.tsx`,
`SplitEditor.tsx` or the run routing in `Workbench.tsx` (docs/impl_split_screen.md § 7.3).

## Prerequisites

- `npm run dev` from the repo root and the backend (`server`, `npm start`, with `GHDL_DIR`
  and `IVERILOG_DIR` set); open `http://localhost:5173/`.
- Drop `tests/fixtures/tbdetect/vhdl/counter.vhd`, `counter_tb.vhd` and `alu_with_tb.vhd`
  on the editor.

## Steps

1. Click `counter.vhd` in the Explorer: TB pane left (`counter_tb.vhd`, violet header,
   "1/2 clock generator"), RTL pane right (`counter.vhd`, teal header) at `entity counter`.
   The `counter_tb.vhd` tab is drawn lighter than the active one.
2. Play in the TB pane: the console shows `simulation stopped @225ns` and "Simulation
   complete."; the Simulation card reads `Top: counter_tb.vhd › counter_tb`.
3. Click `alu_with_tb.vhd`: both panes show the same file, TB at the `alu_tb` process, RTL at
   `entity alu`. Type in one pane: the other updates at once.
4. The tab's Play on `alu_with_tb.vhd` runs `alu_tb` (TB pane focused). Play in the RTL pane
   asks "Run testbench" (alu has no board ports) listing `alu_with_tb.vhd › alu_tb`.
5. New File `scratch` (VHDL), replace its content with a portless entity and type
   `wait for 10 ns;` into a process: the layout does not change; about half a second after
   typing stops the chip "Testbench code found in scratch.vhd" appears. Open split view:
   TB pane left, RTL pane "This testbench does not instantiate a design".
6. View switch: RTL pins the single design pane; switch tabs away and back: still RTL. Both
   restores the split.
7. Close the partner's tab while split: the split collapses and stays collapsed for that pair.
8. Narrow the window (or open Explorer and board wide) until the editor column is under
   405 px: one pane shows, Both is disabled with the "Too narrow" tooltip, TB/RTL toggle.
   Widen again: both panes return.
9. Keyboard only: Tab to the view switch (arrows move it), the pane headers, and the divider
   (arrows 2 %, Shift 10 %, Home/End, double-click 50 %, Enter collapses the TB pane and
   focuses the switch). Alt+PageDown / Alt+PageUp cycle TB regions.
10. The pane headers show no "?" button (the explanation view is left for later).
11. Settings → Testbench split view → Never: opening `counter.vhd` shows one pane; the view
    switch still splits. Always: every file shows both panes. Back to Automatic.
12. Desktop app only: restart; the divider position, the preference and a role override
    ("Treat as testbench" in the badge menu) are kept.
