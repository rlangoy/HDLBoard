<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# Waveform view: reordering signals and the saved view — manual check

Run after changing `signalOrder.ts`, `rowDragGesture.ts`, `useReorder.ts`,
`RowDragLayer.tsx`, `savedView.ts`, `useSavedView.ts`, `SignalRow.tsx` or
`src/project/waveViews.ts` (docs/imp_wave_rearange.md § 6.2, § 11).

## Prerequisites

- `npm run dev` from the repo root and the backend (`server`, `npm start`); open
  `http://localhost:5173/`.
- Open Project with `tests/fixtures/waveform/wave-reorder.hdlboard.json` together with
  `public/projects/adder-and-counter/adder4.vhd` and `adder4_tb.vhdl`.

## Steps

1. Run `adder4_tb.vhdl` and press **Waveform**. TB lists `sum` (decimal, `30`) then `a`;
   `b` is not shown ("1 not shown"). RTL lists `sum` unfolded into `sum[4]`…`sum[0]`, then
   `a`. The project shows no unsaved changes.
2. Hover TB `a`: a grip (⋮⋮) fades in left of the tick box; the cursor over the name is a
   hand. Hover a bit row (`sum[3]`) or a section head: no grip.
3. Drag TB `a` by its name above `sum`, drifting right over the traces on the way: a blue
   line with a ring runs across names and traces, the origin row is veiled, a ghost card
   follows. Release: `a` is first, both rows flash, the time window and cursor are as before.
4. Drag a TB signal down into RTL: the line disappears, the ghost says *Moves only within
   TB*, the cursor is a no-entry sign. Release: the ghost glides back, nothing changes.
5. Start a drag and press Esc: the drag is cancelled and the waveform stays open. Esc again
   closes it (as before).
6. Click a name, then Alt + ↓: the signal moves down one place and stays selected and
   focused. Alt + ↓ at the bottom of its section does nothing.
7. Right-click RTL `a`: a **Move** group with Move up (Alt+↑), Move down (disabled), Move
   to top, Move to bottom (disabled). Move to top moves it above `sum` and its bits.
8. Click a tick box with a slight hand tremor: it unticks. Double-click a name: Go to
   declaration still opens the code.
9. Close the waveform: the project in Files shows the unsaved-changes dot. Download All:
   the zip's `.hdlboard.json` has `waveViews` in the new order.
10. Run the testbench again and open the waveform: the order is kept.
11. Open the downloaded project again (or Save project and reopen it), run, open the
    waveform: the saved view comes back.
12. Zoom, scroll and move the cursor in a freshly opened project: no unsaved-changes dot.
13. A long list: a testbench with a few hundred shown signals. Drag the first one and hold
    it at the bottom edge: the list scrolls, faster nearer the edge; drop near the end.
