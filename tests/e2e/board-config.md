<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# Boards: port names per board — manual check

Run after changing `src/boards/`, `useBoards.ts`, `useBoardChange.ts`, `BoardChangeDialog.tsx`,
`BoardIoPanel.tsx`, `boardText.ts`, `SettingsDialog.tsx`'s Board group, `hdlClient.ts`'s `BOARD` frame
or the backend's `boardPorts.ts` / `boardFrame.ts` (docs/board_io_config_spec.md § 14.3).

## Prerequisites

- `npm run dev` from the repo root and the backend (`server`, `npm start`, with `IVERILOG_DIR` set for
  Verilog); open `http://localhost:5173/`.
- For step 1, a browser profile without HDLBoard's site data, or remove `hdlboard.board.v1` from
  localStorage (put back what was there afterwards).

## Steps

1. **First visit.** The pane reads **Board I/O · Default**, the headings `Pushbuttons (KEY_N[3:0])` and
   `7-Segment Displays (HEXn_N[6:0])`. Settings › Board → **DE1-SoC** → the dialog lists `KEY_N → KEY`
   and `HEX0_N … HEX5_N → HEX0 … HEX5` and the two starter files → **Update files**. The starter file
   reads `KEY`/`HEX0` with its port columns still aligned; the pane reads **Board I/O · DE1-SoC** and
   `Pushbuttons (KEY[3:0])`; the console says `Board: DE1-SoC. Renamed 26 names in 2 files.` with Undo.
2. **Start** → the console's first line is `Board: DE1-SoC`; SW0 lights LEDR0. Open **Key Counter to
   7-Segment** (VHDL) from Examples → it declares `KEY`, `HEX0` … → Start → KEY0 twice shows `02`.
   Repeat with the Verilog example.
3. **Undo** → names and board come back. Change the board again, type in a file, then Undo →
   `Nothing to undo: …`; Settings › Board → Default renames back.
4. **Returning visit.** After choosing DE1-SoC, reload → the starter files use `KEY`/`HEX0`.
5. **Change board only** → Start → `⚠ … uses names of the … board (…), but the board is …` with
   **Fix…** → **Rename files to … names** → Start runs without the hint. Repeat with **Switch board to …**.
6. Change the board while a simulation runs → the dialog says it is stopped; it stops; Start runs with
   the new names.
7. Add `signal key : std_logic;` to a VHDL file on the Default board → Settings › Board → DE1-SoC →
   **Update files** is disabled and the file is named (`KEY is already a name in this file.`);
   **Change board only** still works; **Cancel** goes back to Settings.
8. Open an old (version 1) project, e.g. a gist saved by HDLBoard 1.5 → board Default, it runs as before,
   no question. Save → the project file says `"version": 2` and `"board": "default"`.
9. Open a project file whose `board` is `"de10-lite"` → the Project page says `Board "de10-lite" is not
   installed here; using Default.` with **Choose a board…**; Start logs the same with the action; save →
   the id is kept.
10. Put a broken board in `public/boards/boards.json` (for example 8 display names) → reload → Settings
    lists the warning with its JSON path. Put a valid one there → it is listed, choosing it renames the
    files, its labels show under the parts, and a run works. Put the shipped file back.
11. **Windows app:** steps 1–2, and an edit of `resources\frontend\boards\boards.json` is picked up after a
    restart.

Checked in Chrome on the dev server on 2026-10-24: steps 1, 2 (VHDL), 3 (Undo), 4 (with a user board),
5 (Rename files), 6, 10. Not yet checked: 2 (Verilog), 7, 8 and 9 by hand (all covered by unit tests),
and 11 (the Windows app).
