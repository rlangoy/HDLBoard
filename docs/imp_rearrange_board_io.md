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
button of a collapsed panel – and drop it on another panel. **The two change places.**

| Moment | What is seen |
|---|---|
| Over a title bar | `grab` cursor. The controls in the bar (`•••`, *n hidden*) keep their own meaning. |
| Pressed, moved < 4 px | Nothing: it is a click (a collapsed panel still expands). |
| Dragging | The panel lifts (shadow, slightly see-through) and follows the pointer. The panel it would change places with has a dashed blue outline. |
| Release on a panel | The two panels change places. |
| Release elsewhere, or **Esc** | Nothing changes; the panel goes back. After Esc the release does nothing either (a collapsed panel does not expand). |

Swapping, not inserting, was chosen because it is the easiest rule to predict in a
2 × 2 grid: *the panel you drop on goes to where yours was*.

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
| `src/project/panelOrder.ts` | Pure: `parsePanelOrder`, `swapPanels`. |
| `src/project/displaySettings.ts` | Reads `panelOrder` with the other display settings. |
| `src/components/workbench/boardArrangement.ts` | Pure: each layout's own order, and which panel a board cell shows. |
| `src/components/workbench/usePanelDrag.ts` | The pointer gesture. It only sets `data-board-drag` attributes and two CSS variables, so nothing re-renders until the drop. |
| `src/components/dragGesture.ts` | The 4 px drag threshold and the click swallowed after a drag, shared with the waveform's signal drag. |
| `src/components/workbench/BoardIoPanel.tsx` | Draws the parts in the arranged order; the DOM order is the grid order. |
| `src/components/board/Board.css` | Grab cursor, lifted panel, drop outline. |

The single-column order used to be CSS `order` rules in `Workbench.css`; it is now the
DOM order from `arrangedPanels`, so one mechanism decides where a panel goes.

## 4. Tests

* `src/project/panelOrder.test.ts` – saved and restored through `serializeProject` /
  `parseProject` with the version unchanged; forgiving reading; swapping.
* `src/components/workbench/boardArrangement.test.ts` – each layout's order; panels of cells.
* `src/components/workbench/BoardIoPanel.test.tsx` – the panels are drawn in the saved
  order in both layouts, and are draggable only when a move can be kept.
* In Chrome: drag, cancel with Esc, drop on a collapsed panel, save, reopen.

## 5. Not in this version

* Moving a panel with the keyboard.
* A *Reset arrangement* command; dragging the panels back does the same.
