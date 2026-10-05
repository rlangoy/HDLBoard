<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# File switching without tabs — manual check

Run after changing the Files panel, the pane headers, the file menu, `fileRows.ts`,
`paneRun.ts` or the workspace format (docs/cleanup_file_tabs.md § 7.2).

## Prerequisites

- `npm run dev` from the repo root and the backend (`server`, `npm start`, with `GHDL_DIR`
  and `IVERILOG_DIR` set); open `http://localhost:5173/`.

## Steps

1. Fresh start: one header row over `DE1_SoC.vhdl` (Play, a divider, a grey chip, the name,
   a chevron; the view switch at the right), no tab strip; its bottom edge lines up with the
   Explorer's and Board I/O's title strips.
2. Open all 12 examples: no horizontal scrollbar in the editor; every name in the Files panel
   readable in full at the default width; testbenches show a violet flask, designs a grey
   chip. Hover a row: Download / Rename / Delete appear at its end and the name ellipsizes
   before them.
3. Click `and_gate_tb.v`: TB pane left, RTL pane right, one header row; both files highlighted
   in Files; the blue dot has not moved.
4. Click the RTL pane's file name: the menu lists every file by folder, both shown files
   ticked, focus on the first ticked one; it stays inside the editor's right edge. `↑` `↓`
   `Home` `End` move; `Enter` on another file shows it and puts the caret in its code. `Esc`
   and `Tab` close it and focus the name. *New file…* opens the New File dialog.
5. Hide the Explorer (`Ctrl+B`): switch files with the header menu alone.
6. Break `LEDR <= SW;` and press Play: a red dot with "1 error" on the file in Files, in its
   header and in the menu. Click into the code: the marks go.
7. While a run goes, show another design: its Play is greyed out with "Stop the simulation
   first" and does nothing; the name does not move; *Top:* stays on the running file.
8. Delete the shown file: the next file in Files shows. Delete the other pane's file: the
   remaining file is shown with its empty pane. Delete every file: *No files yet* with
   Examples / New file / Upload, each working.
9. Drag the split divider until a pane is at its 200 px minimum, then narrow the window until
   the editor column is under 405 px (one pane, *Both* disabled): the headers still fit, the
   view switch and badge show icons only, and only the name shrinks.
10. Browser zoom 200 %: header, menu and Files neither clip nor overlap.
11. Keyboard only, then NVDA + Chrome: the name button ("…, switch file", expanded/collapsed),
    the menu (folder groups, ticked items), Files rows, the greyed-out Play and its reason.
12. Desktop app: restart keeps the shown file; a workspace saved by 1.3.0 opens on its file.
13. A copied testbench, in VHDL and in Verilog: open the AND Gate Testbench example and add
    `mytest_tb.vhd` / `mytest_tb.v` with the same entity / module name `and_gate_tb` but its own
    messages. Play in its TB pane runs the copy's code, after the note "and_gate_tb is declared in
    mytest_tb… and in and_gate_tb…"; Play on `and_gate_tb.vhd` / `.v` still runs the original.
    Rename the copy's entity / module to `mytest_tb` and press Play at once: it runs as
    `mytest_tb`, with no note.

## Results

| Date | Build | Steps passed | Not run | Notes |
|---|---|---|---|---|
| 2026-10-05 | branch `cleanup_filetabs`, browser (Chrome, Vite + GHDL and Icarus backend) | 1–9, 13 | 10, 11, 12 | Checked by measuring the page, then by screenshots once the Chrome window was in front: header bottom 94.99 px = side strips; menu right edge 8 px inside the editor; at 255 px per pane (50/50, 1440 px window) both names fit in full, at the 200 px minimum a name keeps about 41–47 px. A 260 px minimum pane width (the plan) was tried and dropped: it disabled the split at a 1440 px window. Found and fixed during the run: a stored split fraction was not clamped (a pane could drop below its minimum), the menu's shift-left was undone by React StrictMode's second effect run, and the view switch's labels were clipped at a 200 px editor column. | Step 13 found two bugs, both fixed: a copy that kept its name ran the original (VHDL) or did not compile (Verilog), and after a rename Play still asked for the old name.
