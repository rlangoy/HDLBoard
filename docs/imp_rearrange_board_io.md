# Arranging the Board I/O Panels — Implementation Note

> Licensed under the [GNU General Public License v2.0](../LICENSE).

| | |
|---|---|
| **Document** | `docs/imp_rearrange_board_io.md` |
| **Status** | Implemented (unit tests, lint and an end-to-end check in Chrome) |
| **Owner** | Rune Langøy |
| **Branch** | `imp_rearange_board_io` |
| **Code standard** | Clean Code as in [wojteklu/73c6914c](https://gist.github.com/wojteklu/73c6914cc446146b8b533c0988cf8d29) and `eslint.config.js` |

## 1. What the student does

Grab a panel of the **Board I/O** pane by its frame – the coloured title bar, or the
button of a collapsed panel – and move it. **The board shows the new order while you
drag; release, and that is the order.**

| Moment | What is seen |
|---|---|
| Any time | A six-dot grip before each panel title (and in a collapsed panel's button), stronger when the pointer is over the frame and always plain on a touch screen. |
| Over a title bar | `grab` cursor. The controls in the bar (`•••`, *n hidden*) keep their own meaning. |
| Pressed, moved < 4 px | Nothing: it is a click (a collapsed panel still expands). |
| Dragging | A copy of the panel, lifted with a soft shadow and a blue border, follows the pointer (`grabbing` cursor). Where the panel was is a pale blue space of its size with a dashed blue edge and a blue line along its top. |
| Past the middle of another panel | The dragged panel takes that panel's place; the panels between slide one step to make room (180 ms). |
| Release | The panel settles into the blue space, its shadow fading, and its border flashes blue once. |
| **Esc**, or the window loses the pointer | Every panel glides back; the release changes nothing (a collapsed panel does not expand). |

The order is **reading order**: one column top to bottom, two columns row by row. The
same rule in both layouts – *the panel goes where the blue space is* – and the board
already shows the result, so there is nothing to predict. A panel only moves once the
pointer has passed the other panel's middle, and a panel still sliding is ignored, so
panels of different sizes do not flicker back and forth. With *reduced motion* set in
the system, the panels jump instead of sliding.

## 2. Saved in the project file

The order is kept in the project's display settings, beside the other panel options:

```json
"displaySettings": {
  "panelOrder": ["sevenSegment", "leds", "switches", "pushbuttons"]
}
```

* **No new file version.** `panelOrder` is optional; an HDLBoard that does not know it
  ignores it (unknown display settings are skipped), so the version stays `2`.
* **Only a move writes it.** A project that never moved a panel has no `panelOrder`,
  and opening one never marks the project as changed. A move does, like any other
  project edit, and *Save project*, *Save to GitHub* and *Download All* write it.
* **Moving the panels back writes nothing.** When a drop puts the panels back in the
  layout's own order, `panelOrder` is removed again, so the project reads as saved.
* **Read forgivingly** (`src/project/panelOrder.ts`): unknown or repeated names are
  dropped, and panels it leaves out go last, so every panel is drawn once. A list that
  names no panel is no order. A value that is not a list is ignored with a warning in
  the console; the project still opens.
* **One order for both layouts.** Without a saved order, *Two columns* draws LEDs,
  7-segment, switches, buttons (row by row) and *One column* draws LEDs, switches,
  7-segment, buttons, as before. Once a panel is moved, both layouts use the saved order.
* A board without a part (no switches, say) keeps its place in the list, so the order
  survives changing to another board and back.
* The board settings preview shows the same order, but its panels cannot be moved.

## 3. Code

| File | Role |
|---|---|
| `src/project/types.ts` | `BoardPanel`, `BOARD_PANELS`, `DisplaySettings.panelOrder`. |
| `src/project/panelOrder.ts` | Pure: `parsePanelOrder`, `withShownOrder` (the panels on show in their new order; absent ones keep their places). |
| `src/project/displaySettings.ts` | Reads `panelOrder` with the other display settings. |
| `src/components/workbench/boardArrangement.ts` | Pure: each layout's own order, which panel a board cell shows, `moveItem`, and `passesMiddle` (when the pointer has passed a panel). |
| `src/components/workbench/usePanelDrag.ts` | The pointer gesture. The preview is CSS `order` on the cells plus a copy of the panel, slid with the Web Animations API; nothing re-renders until the drop. The board keeps its width while dragging, so the Board pane's scale stays put. |
| `src/components/dragGesture.ts` | The 4 px drag threshold and the click swallowed after a drag, shared with the waveform's signal drag. |
| `src/components/workbench/BoardIoPanel.tsx` | Draws the parts in the arranged order; the DOM order is the grid order. |
| `src/components/board/Board.css` | Grip, cursors, placeholder, lifted copy, drop flash. |

The single-column order used to be CSS `order` rules in `Workbench.css`; it is now the
DOM order from `arrangedPanels`, so one mechanism decides where a panel goes.

## 4. Tests

* `src/project/panelOrder.test.ts` – saved and restored through `serializeProject` /
  `parseProject` with the version unchanged; forgiving reading; the shown order.
* `src/components/workbench/boardArrangement.test.ts` – each layout's order; panels of cells; moving; passing the middle.
* `src/components/workbench/BoardIoPanel.test.tsx` – the panels are drawn in the saved
  order in both layouts, and are draggable only when a move can be kept.
* In Chrome: dragging in both layouts step by step, Esc, a real mouse drag, save, reopen.

## 5. Not in this version

* Moving a panel with the keyboard (left out by choice).
* A *Reset arrangement* command; dragging the panels back does the same.
