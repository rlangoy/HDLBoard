# Reordering Signals in the Waveform View — Implementation Specification

> Licensed under the [GNU General Public License v2.0](../LICENSE).

| | |
|---|---|
| **Document** | `docs/imp_wave_rearange.md` |
| **Version** | 1.1 |
| **Status** | Implemented (unit tests, lint and an end-to-end check in Chrome; see § 12) |
| **Changes in 1.1** | Owner decision: **the waveform view is saved in the project file** (`.hdlboard.json`, field `waveViews`) and restored when the view is opened with the Waveform button (§ 11, D15, D18–D22). Keyboard: Alt + Home / End dropped, as browsers keep Alt + Home for the home page; *Move to top / bottom* stay in the menu (D13). The ghost shows the name and a bits badge, not the value (D10). § 5 describes the code as built. |
| **Owner** | Rune Langøy |
| **Source** | Owner's proposal *Wave Reordering in HDLBoard* and three review notes on it (2026-10-23) |
| **Verified against** | `main` @ `b4ac362` (package.json 1.5.0) |
| **Target** | `src/components/waveform/`, React 18.3 + TypeScript 5.6 + Vite 5, plain CSS, no new runtime dependency (NFR-9) |
| **Related** | `docs/waveform_viewer_spec.md` § 8.6 (signal list), FR-5, FR-17, FR-21, NFR-9 – NFR-11; `docs/Impl_project_file_and_online_storage.md` § 4.1 (project file fields) |
| **Code standard** | Clean Code as in [wojteklu/73c6914c](https://gist.github.com/wojteklu/73c6914cc446146b8b533c0988cf8d29) and `eslint.config.js` (functions ≤ 40 lines, ≤ 3 parameters, complexity ≤ 8, no magic numbers) |

---

## Contents

1. [Summary](#1-summary)
2. [What HDLBoard already has](#2-what-hdlboard-already-has)
3. [Decisions](#3-decisions)
4. [User experience](#4-user-experience)
5. [Architecture and code](#5-architecture-and-code)
6. [Test plan](#6-test-plan)
7. [Implementation steps](#7-implementation-steps)
8. [Acceptance criteria](#8-acceptance-criteria)
9. [Out of scope](#9-out-of-scope)
10. [Open questions](#10-open-questions)
11. [Saving the view in the project file](#11-saving-the-view-in-the-project-file)
12. [As built](#12-as-built)

---

## 1. Summary

A student can put the shown signals in the order that tells the story of the design – `clk`, then `start`, then `state`, then `tx` – by **dragging a signal by its name** (or by a grip that appears on hover) and dropping it between two others. A blue insertion line, drawn across the **whole row, list and waveform alike**, shows where the trace will land. The waveform area stays reserved for zooming and the cursor: a reorder can only *start* in the signal list, so it can never begin a zoom selection.

Signals move **within their own section only** (`TB`, or one `RTL` instance). A vector with its bits unfolded moves as one block. The same moves are available from the keyboard (**Alt + ↑ / ↓**) and from the right-click menu (**Move up / down / to top / to bottom**), so nothing depends on the mouse.

The order is part of the view's existing state, so it is kept across reruns of the same project exactly like the choice of shown signals (FR-17), and it flows into the report figure for free. Since 1.1 the view – which signals are shown, their order, "Show as" and unfolded vectors – is also **saved in the project file** and comes back when the project is opened again and the Waveform button shows the view (§ 11).

![Dragging `a` above `sum` in TB: the veiled origin, the ghost, and the insertion line across names and traces](images/wave_reorder_drag.png)

### 1.1 Core behaviour rules

1. **Only the list starts a move.** A press on the grip or the name of a shown signal starts a move after 4 px of travel. A press anywhere on the waveform is a zoom or cursor gesture, as today.
2. **Nothing moves until the mouse does.** Below 4 px a press is a click: the checkbox ticks, the row is selected, a double-click on the name goes to the declaration.
3. **The insertion line always tells the truth.** If you release now, the signal lands exactly on the line. No line means no change.
4. **A signal stays in its section.** Over another section the line disappears and the dragged row says *Moves only within TB*; releasing there changes nothing.
5. **Esc always backs out** – during a drag it cancels the drag and does *not* close the waveform.
6. **Reordering is a view change only.** Values, traces, the cursor, the zoom, "Show as", unfolded vectors and the simulation are untouched.
7. **List and waveform never disagree.** Both are drawn from the same row model in the same frame; no animation is allowed to move one without the other.

---

## 2. What HDLBoard already has

The review notes raised several risks. Reading the code shows most of them are already handled by the existing architecture, which keeps this feature small.

| Finding | Where | Consequence for this feature |
|---|---|---|
| The order of shown signals **is** `ListState.shown: readonly SignalPath[]`; each section lists `state.shown.filter(section.owns)` in array order. | `signalRows.ts` `shownRows()` | Reordering is one pure array operation. No new state. |
| Rows are keyed by **hierarchical path** (`tb/start` vs `tb/dut/start`), not by name. React keys, selection, "Show as" and `expanded` all use the path. | `SignalList.tsx`, `viewSetup.ts` | The duplicate-name concern (`start`, `tx`, `complete` in both TB and RTL) is already solved. Expanded bits and "Show as" follow the signal automatically. |
| List and canvas are drawn from **one `ListModel`** (`rows`, `tops`); the canvas paints row *i* at `AXIS_HEIGHT + tops[i] − scrollTop`. | `WaveformPane.tsx` `Body`, `paintWaveform.ts` `rowTop()` | Row alignment after a drop is structural, as long as we never animate rows in the DOM only (rule 7, D9). |
| `ListState` is copied into `ViewMemory` on every change and restored for every signal that still exists; the memory is reset when the project changes. | `useWaveView.ts`, `viewSetup.ts` `setupFor()`, `useWaveformView.ts` `useProjectReset()` | "Persist during the project session" needs no work. FR-21 (save in project file) already plans to store the order. |
| The list and the canvas are **sibling elements**; the canvas has its own pointer routing (`useRoutedPointer`). | `WaveformPane.tsx`, `useCanvasGestures.ts` | A drag that starts in the list and captures the pointer never reaches the canvas. Zoom protection is structural, not a rule we must remember to check. |
| A press that moves less than `DRAG_THRESHOLD_PX = 4` is a click. | `useTimeGestures.ts` | The list reuses the same threshold, so both halves of the view feel the same. |
| Section heads are rows of kind `section`; bits of an unfolded vector are `trace` rows with a `parent`. | `signalRows.ts` | Sections and their extents can be derived from the rows; bit rows are easy to exclude. |
| The pane's Esc handler closes the menu, then report mode, then **the waveform**. | `WaveformPane.tsx` `keyAction()` | A drag must catch Esc first (D7), or a student cancelling a drag loses the view. |
| Alt + key combinations are ignored by the pane's key handler. | `keyAction()` returns `undefined` when `altKey` | Alt + ↑ / ↓ is free for reordering. |
| The list is not virtualized: every row is a DOM element; the canvas paints only the visible part. | `SignalList.tsx`, `WaveCanvas.tsx` | During a drag the list must not re-render on every pointer move (D11). |
| Report mode makes the list and canvas inert. | `ReportStage.tsx` | No drag can start in report mode. The figure follows the new order because it reads the same view. |

---

## 3. Decisions

The owner asked Claude to decide. Each decision says what was chosen and why, including where the review notes disagreed.

| # | Decision | Rationale |
|---|---|---|
| **D1** | **Drag source: the grip *and* the signal's name.** Not the checkbox, the chevron or the value. | One note wanted the grip only, to protect future name actions. But a beginner's first instinct is to grab the word they are looking at; a 12 px grip alone is a small target that novices miss. The 4 px threshold (D3) keeps click, double-click (Go to declaration) and selection working on the name, so nothing is lost. The checkbox, chevron and value keep single, unambiguous meanings. |
| **D2** | **The grip appears on row hover and on the selected row**, inside the row's existing left indent, so no layout shifts. On touch screens (`hover: none`) it is always visible at reduced opacity. | Clean look at rest (S3: few controls on screen), discoverable on approach, visible for keyboard users on the selected row. |
| **D3** | **Threshold: 4 px of vertical or horizontal travel**, the same constant as the canvas. | One feel for "click vs drag" across the whole view. |
| **D4** | **What moves:** a shown, top-level signal (a `trace` row without `parent`). An unfolded vector moves **with all its bits** as one block. Bit rows, section heads, folders, not-shown and unavailable signals have no grip and cannot be moved. A section with only one shown signal shows no grip either. | Keeps the hierarchy intact and avoids dead affordances: a grip only appears where a move is possible. |
| **D5** | **Where it can land: between the shown signals of its own section.** The drop slot is chosen by the **midpoint rule**: above the middle of a block → insert before it, below → after it. Over its own section head the slot is the first one; over its own section's not-shown rows (open section) it is the last one. Only the pointer's **y** counts – the pointer may drift over the waveform. | The midpoint rule is the standard that users expect. Clamping inside the own section is forgiving (a sloppy drop still does something sensible). Ignoring x means the drag does not break when the hand drifts right, which it will, because the line spans the waveform. |
| **D6** | **Across a section boundary: no line, a muted ghost with the hint *Moves only within TB* (or *RTL*), `not-allowed` cursor; release = cancel with snap-back.** No toast, no red line. | A red "forbidden" line still looks like a drop target; no line is the unambiguous "you can't drop here". The hint on the ghost teaches the rule at the moment it matters, in words, which is better for novices than a silent cancel. |
| **D7** | **Cancel:** Esc, right-click, pointer cancel, window blur, or release where no line is shown. Esc during a drag is consumed and does not reach the pane's Esc (which would close the waveform). | Rule 5. Losing the whole view by pressing Esc to abort a drag would be the worst possible surprise. |
| **D8** | **Drop indicator: a 2 px accent line across the full width of the grid (names, values and waveform), with a 7 px ring at its left end.** It is hidden when the drop would not change the order (just above or below the origin). | A line between rows is unambiguous (insert, not replace). Spanning the waveform shows where the trace lands, which is the point of reordering. The ring is the modern convention (Notion, Linear, VS Code) and makes the line visible even over busy traces. |
| **D9** | **No sliding (FLIP) animation of rows.** On drop the new order is drawn at once in list and canvas; the moved block gets a **landing flash** – a full-width accent tint that fades out in 700 ms. | The canvas cannot slide rows in step with the DOM; a 150 ms slide in the list only would break rule 7 for 150 ms – the one thing the owner's note called "the single easiest thing to break". The flash gives the same "it went *there*" feedback without misalignment. |
| **D10** | **Origin while dragging:** the dragged block stays in place, covered by a veil (list and waveform) with a dashed outline in the list. The **ghost** – grip, tone bar, name and, for an unfolded vector, a `+5 bits` badge on a raised card – follows the pointer vertically inside the names column, starting right of the line's ring so the ring stays in sight. The value is not repeated: it is still readable on the veiled origin row. | The student always sees where the signal came from and what is moving. Vertical-only movement matches the one-dimensional task. |
| **D11** | **Performance:** the live drag position lives in a small external store read only by the drag layer. `SignalList` and the canvas re-render only at drag start, drop and cancel. | The list is not virtualized; re-rendering 500 rows per pointer move would drop frames. |
| **D12** | **Auto-scroll:** within 32 px of the visible top (below the sticky time axis) or bottom of the scrolling body, the body scrolls, faster the deeper the pointer is in the zone (quadratic, up to 18 px per frame). | Long lists must stay usable; graduated speed gives both precision and reach. |
| **D13** | **Keyboard and menu:** Alt + ↑ / Alt + ↓ move the selected signal one place within its section. (Alt + Home / End were dropped in 1.1: Alt + Home opens the browser's home page and cannot always be stopped.) The right-click menu gets a **Move** group: *Move up*, *Move down*, *Move to top*, *Move to bottom*, disabled at the edges, with shortcut hints. Each move is announced in a polite live region: *"busy moved to place 2 of 6 in TB."* | NFR-10 (every control keyboard-operable). The menu is where many novices look first ("right-click it"). |
| **D14** | **No undo (Ctrl + Z) in this version.** | The view has no undo for any other action (tick, Show as, zoom). Undo for one action only would teach an inconsistent rule. A wrong drop is fixed by dragging back; a wrong drag is cancelled with Esc. Revisit with a view-wide undo (Q2). |
| **D15** | **Persistence: in the session and in the project file.** Kept across reruns for signals that still exist; reset on project change; **saved in `.hdlboard.json`** and restored when the view opens (§ 11). One order per section, shared by the view and the report figure. | Already true of `ListState.shown` in the session (§ 2); the project file makes it survive closing HDLBoard and travel with a shared project. One rule for the student: "the view remembers what you set up – and so does the project." |
| **D16** | **A signal ticked again appears at the bottom of its section's shown signals** (today's behaviour, unchanged). Unticking forgets its place. | Predictable and visible: the new trace appears where the student's eye already is, next to the list of signals they just ticked. Remembering a hidden signal's old slot would need a second, invisible order. |
| **D18** | **What the project file keeps:** per testbench, the shown signals in their order, each with its "Show as" when chosen and `expanded` when its bits are unfolded. Not kept: the time window, the cursor and which folders are open. | Those are the parts of a view a teacher sets up for a class (FR-21). The window and cursor belong to one run; folder state is a momentary navigation choice. |
| **D19** | **Keyed by testbench name, paths below it** (`"adder4_tb": { "signals": [{ "path": "dut/sum" }] }`). | One project often has several testbenches; each keeps its own view. Paths without the testbench prefix read well and are easy to edit by hand. |
| **D20** | **Only the student's own changes are written.** Ticking, unticking, moving, "Show as" and unfolding a vector update the project; the first view, a restored view, zooming, scrolling and the cursor never do. A change makes the project read as *Unsaved changes*, like any other project edit, and *Save project*, *Save to GitHub* and *Download All* write it. | Opening a waveform must never make a project "dirty" by itself. The view is part of the project file, so changing it is a project change – honest, and it is what lets the student save it. |
| **D21** | **Restore order: this session's own view, then the project's saved view, then the first view.** A saved view is used when at least one of its signals exists in the waveform; signals that no longer exist are skipped; a run with an error still opens at the error (W11). | The session's view is the newest. Skipping lost signals keeps a project usable after the testbench changes. |
| **D22** | **Reading the field is forgiving.** A `waveViews` that is not an object, a testbench without a `signals` list, or a signal without a `path` is left out with a warning in the console; the project always opens. An unknown "Show as" is ignored. A view with no signals is not written. | The view is a convenience; it must never stop a project from opening (the project file rules of § 7 of the project file spec). |
| **D17** | **Single-signal moves only.** Multi-selection (Ctrl / Shift + click) and moving a selection as a block are phase 2 (§ 9). | The view has a single-selection model today; multi-select touches the arrow-key stepping, the menus and the canvas highlight. Ship the simple, solid version first. |

---

## 4. User experience

### 4.1 States

| State | What the student sees | Cursor |
|---|---|---|
| **Idle** | Exactly as today: checkbox, name, value, trace. | Default. Over the waveform: the existing zoom / cursor cursors. |
| **Hover a movable row** | The row's hover tint (existing). A **grip** (two columns of three dots, 10 × 14 px, 55 % opacity) fades in over 120 ms in the left indent, before the checkbox. | `grab` over the grip and the name; the checkbox and chevron keep `pointer`; the value keeps `default`. |
| **Hover the grip** | Grip at 100 % opacity, in the accent colour. Tooltip: *Drag to move · Alt + ↑ / ↓*. | `grab` |
| **Pressed, < 4 px** | Nothing changes. Releasing is a click (select / tick / double-click to declaration). | `grab` |
| **Dragging, valid slot** | The origin block is veiled (list and waveform at ≈ 35 % strength) with a dashed outline in the list. A **ghost card** follows the pointer. The **insertion line** sits at the slot, across names, values and waveform. Every other row is still. | `grabbing` everywhere in the pane |
| **Dragging, slot = origin** | Ghost and veil as above, no line ("release here changes nothing"). | `grabbing` |
| **Dragging over another section** | No line. Ghost turns muted (grey border, no tone bar) and shows a chip under it: *Moves only within TB*. | `not-allowed` |
| **Near the top / bottom edge** | The body scrolls; line and ghost follow the content under the pointer. | `grabbing` |
| **Drop** | Ghost disappears; list and waveform show the new order in the same frame; the moved block flashes (accent tint fading out over 700 ms). The selection moves to the dropped signal. | Back to `grab` (pointer is over the name) |
| **Cancel** | Ghost glides back to the origin (160 ms) and disappears; veil lifts; nothing changes. | Back to `grab` |

With `prefers-reduced-motion: reduce`, fades and glides are replaced by instant changes; the landing flash becomes a 700 ms static tint without fading.

### 4.2 Mockups

Hover (the grip appears in the left indent, nothing shifts):

```text
 SIGNAL                         VALUE │ 0ns        200ns        400ns
 ▾ ⚗ TB                     3 not shown│
  ⠿ ☑   clk                         1 │ ┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐
     ☑   start                       0 │ ──┐_____________________________
     ☑   busy                        1 │ __┌──────────────────┐_________
     ☑   complete                    0 │ _____________________┌─┐_______
  ↑ grip on hover, grab cursor over grip and name
```

Dragging `complete` up between `start` and `busy`:

```text
 ▾ ⚗ TB                     3 not shown│
     ☑   clk                         1 │ ┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐
     ☑   start                       0 │ ──┐_____________________________
  ○━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┿━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  ← insertion line, full width
   ╭──────────────────────────────╮    │
   │ ⠿ ▌ complete               0 │    │                                    ← ghost card (raised, follows pointer)
   ╰──────────────────────────────╯    │
     ☑   busy                        1 │ __┌──────────────────┐_________
  ┊  ☑   complete                    0 ┊ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  ← origin, veiled + dashed outline
```

Over another section:

```text
 ▾ ⚙ RTL                    5 not shown│
     ☑   start                       0 │ ──┐_____________________________
   ╭──────────────────────────────╮    │
   │ ⠿   complete               0 │    │                                    ← muted ghost, no line
   ╰──────────────────────────────╯    │
     ⦸ Moves only within TB             │                                    ← hint chip, not-allowed cursor
```

After the drop (the moved row flashes in list and waveform together):

```text
     ☑   clk                         1 │ ┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐┌┐
     ☑   start                       0 │ ──┐_____________________________
  ▓▓ ☑   complete                    0 │ _____________________┌─┐_______ ▓▓  ← 700 ms fading tint
     ☑   busy                        1 │ __┌──────────────────┐_________
```

An unfolded vector moves as one block; the veil, the ghost's height hint and the flash cover all its bit rows. The ghost shows the vector's row only, with a small stack badge (`+8 bits`).

### 4.3 Keyboard and menu

| Input | Where | Action |
|---|---|---|
| Alt + ↑ / Alt + ↓ | Selected shown signal | One place up / down within its section. No-op at the edge. |
| Esc | During a drag | Cancels the drag. Does not close menus or the view. |
| Right-click → **Move up / Move down / Move to top / Move to bottom** | Shown top-level signal | Up and down as the keys; top and bottom to the ends of the section. Items are disabled at the edges; up and down show their shortcut on the right. Not shown for bits, hidden or unavailable signals, nor for a signal alone in its section. |

The selection and keyboard focus stay on the moved signal, and it is scrolled into view (`scrollIntoView({ block: 'nearest' })`), so repeated Alt + ↓ walks it down a long list.

Shown rows get `aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"` and, on the grip, `aria-label="Move complete"` with `aria-describedby` pointing at the shared hint *"Drag, or press Alt + Up / Down."* A polite live region in the pane announces each move: *"complete moved to place 2 of 4 in TB."*

### 4.4 Text

| Where | Text |
|---|---|
| Grip tooltip | `Drag to move · Alt + ↑ / ↓` |
| Shown row tooltip (was `<label>. Double-click to go to its declaration.`) | `<label>. Drag the name to move it; double-click to go to its declaration.` |
| Hint chip over another section | `Moves only within TB` / `Moves only within RTL` |
| Menu group | `Move up  Alt+↑` · `Move down  Alt+↓` · `Move to top` · `Move to bottom` |
| Live region | `<label> moved to place <n> of <m> in <TB/RTL>.` |
| `WaveHelp`, new paragraph | `Drag a signal by its name to change the order, or select it and press Alt + ↑ or ↓. Signals move within their own section, TB or RTL. The order and the signals shown are saved with the project.` |

### 4.5 Visual tokens

New tokens in `Waveform.css`, built on the existing ones so the feature matches the TB/RTL colours and the editor's accent:

```css
--wv-drag-accent: var(--wb-accent, #2f6fed);          /* line, ring, grip hover, ghost border */
--wv-drag-grip: #94a3b8;                             /* grip at rest */
--wv-drag-veil: rgb(255 255 255 / 0.65);             /* over the origin block */
--wv-drag-ghost-bg: #ffffff;
--wv-drag-ghost-shadow: 0 8px 24px rgb(15 23 42 / 0.18), 0 1px 3px rgb(15 23 42 / 0.12);
--wv-drag-flash: rgb(47 111 237 / 0.16);             /* landing flash start */
--wv-drag-muted: #cbd5e1;                            /* ghost border over another section */
```

Ghost card: names-column width minus 8 px, `ROW_HEIGHT` high, 6 px radius, 1 px accent border, a 3 px tone bar on the left (`--wv-tb-ink` / `--wv-rtl-ink`), ghost shadow, 97 % opacity, `pointer-events: none`. Line: 2 px, accent, ring 7 px with 2 px accent border and white fill at the names column's left edge + 6 px. Over the waveform the line is the same colour; it is horizontal, so it cannot be mistaken for the amber cursor or the blue zoom range.

---

## 5. Architecture and code

As built. Every new function follows the lint limits in `eslint.config.js`; the pure parts have unit tests, the DOM parts are thin.

### 5.1 Files

| File | Kind | Responsibility |
|---|---|---|
| `src/components/waveform/signalOrder.ts` | **new**, pure | Sections and their blocks from the `ListModel`; the drop target at a height; keyboard / menu moves; the order after a move; the place for the announcement. |
| `src/components/waveform/dragStore.ts` | **new**, tiny | An external store (`get` / `set` / `subscribe`) for what the drag layer draws, read with `useSyncExternalStore`. |
| `src/components/waveform/rowDragGesture.ts` | **new** | One press → drag → drop or cancel: threshold, pointer capture, auto-scroll, Esc / right-click / blur, swallowing the click after a drag, the page cursor. `autoScrollSpeed` and `startsDrag` are exported and tested. |
| `src/components/waveform/useReorder.ts` | **new** hook | The one way every move is done (move, select, flash, announce), for drag, keys and menu alike; which signals can move. |
| `src/components/waveform/RowDragLayer.tsx` | **new** | Veil, insertion line, ghost, hint chip and landing flash over `.wv-grid`. |
| `src/components/waveform/savedView.ts` | **new**, pure | The view ↔ the project file's saved view (§ 11). |
| `src/components/waveform/useSavedView.ts` | **new** hook | Reads the saved view for a new waveform; writes it after the student's own changes (D20). Declares the `SavedViews` port. |
| `src/project/waveViews.ts` | **new**, pure | Parsing (forgiving, D22), writing in a fixed field order, and replacing one testbench's view. |
| `src/components/workbench/useProjectWaveViews.ts` | **new** hook | The `SavedViews` port on the open project's state (`withWaveView`). |
| `viewSetup.ts` | changed | `ViewLayout` (the signals part of a view), `withMove`, and `setupFor`'s restore order (D21). |
| `useWaveView.ts` | changed | `move` action; signal-changing actions tell `useSavedView`. |
| `SignalRow.tsx`, `SignalList.tsx` | changed | Grip, press on grip / name, Alt + ↑ / ↓, `aria-keyshortcuts`; `SignalList` is memoised so scrolling a long list does not redraw it. |
| `WaveformPane.tsx`, `WaveMenus.tsx`, `WaveNotes.tsx`, `waveIcons.tsx`, `radix.ts`, `useTimeGestures.ts`, `Waveform.css` | changed | Wiring, Move menu group, help text, grip icon, shared `isShowAs`, shared `DRAG_THRESHOLD_PX`, styles. |
| `src/project/types.ts`, `parseProject.ts`, `workbench/projectFile.ts`, `Workbench.tsx` | changed | `waveViews` in the project model, the file, the stored workspace and `withWaveView`. |

Nothing changes in the parsers, the worker, `paintWaveform.ts`, the canvas gestures or the server.

### 5.2 The pure model — `signalOrder.ts`

```ts
interface Block   { path; label; top; bottom }                 // a shown signal, with its bits when unfolded
interface Section { path; label; tone; top; bottom; blocks }   // TB or one RTL instance
interface Move    { section; from; to }                        // block `from` to slot `to` (0 … blocks.length)
type DropTarget = { kind: 'slot'; move; lineY } | { kind: 'unchanged' } | { kind: 'other-section'; label };
type MoveStep   = 'up' | 'down' | 'top' | 'bottom';

sectionsOf(list): Section[]                      // geometry from list.tops – never the DOM
blockOf(sections, path)                          // { section, index } | undefined
movablePaths(sections): Set<SignalPath>          // signals that share their section with another
dropTargetAt(sections, { own, from }, y)         // midpoint rule, clamping, other section (D5, D6)
stepMove(sections, path, step): Move | null      // null at the edge
orderAfter(shown, move): SignalPath[]            // the section's signals in new order, in their own places
placeOf(move): { place, of }                     // for "a moved to place 1 of 2 in TB."
```

`orderAfter` writes the section's new order back into the positions its signals had in `ListState.shown`, so other sections' signals do not move at all. `viewSetup.withMove(setup, move)` is the only state change.

### 5.3 The gesture — `rowDragGesture.ts`

`startRowDrag(press, input)` follows one press. It listens on `window` for `pointermove`, `pointerup`, `pointercancel`, `keydown` (capture phase, so Esc never reaches the pane), `contextmenu` and `blur`.

1. Below `DRAG_THRESHOLD_PX` (shared with the canvas) nothing happens; the click, tick or double-click goes through.
2. At the threshold: `setPointerCapture` on the pressed grip or name, the text selection is cleared, the auto-scroll loop starts.
3. On every move: list-y = `clientY − grid top − AXIS_HEIGHT`; `dropTargetAt`; the store gets the ghost's top and the target. The page cursor (`data-wv-reordering` on `<html>`) is set only when it changes – setting it on every move restyled the whole page and cost a frame each time.
4. Auto-scroll: within 32 px of the edge, quadratic up to one row (`ROW_HEIGHT`) per frame.
5. Release on a slot → `onDrop(move)`; anywhere else, or a cancel → the ghost glides back (`returning`, 160 ms) and nothing changes. The click that follows a drag is swallowed.

### 5.4 Why the waveform cannot start a zoom

The drag is started only by handlers on the grip and the name, which live in `.wv-names`. Once started, the pointer is captured by that element, so pointer and mouse events never reach the canvas; `useRoutedPointer` never sees a press and the hover tooltip stays quiet. Checked in Chrome: a drag released over the traces leaves the window and the cursor unchanged.

### 5.5 The layer — `RowDragLayer.tsx`

An absolutely positioned, `pointer-events: none` overlay inside `.wv-grid`, `AXIS_HEIGHT` below its top, so it scrolls with the list and needs no scroll bookkeeping. It reads only the drag store. The ghost is one element in both the *dragging* and *returning* states, so the glide back is a CSS transition. The landing flash is keyed by a move counter, so two moves of the same signal flash twice.

### 5.6 Keyboard and menu wiring

`RowCallbacks` has `onMove(path, step)` and `onPressMove(path, event)`; `RowContext` has `movable(path)`. Alt + ↑ / ↓ on a row call `onMove` and give the row its focus back after React has moved its element. The menu's **Move** group gets `MoveChoices` (`can(step)`, `onMove(step)`) from the pane, or nothing for a signal that cannot move. Drag, keys and menu all end in `useReorder`'s `apply`, which moves, selects, flashes and announces.

## 6. Test plan

### 6.1 Unit tests (`vitest`)

`signalOrder.test.ts`, on hand-built `ListModel`s and on the `ghdl_wave_types` / `icarus_counter` fixtures through `listRows`:

| Test | Checks |
|---|---|
| sections and blocks | TB and two RTL instances; a section with zero, one and many shown signals; an unfolded vector forms one block spanning its bit rows; geometry equals `tops` + `ROW_HEIGHT`. |
| same names in two sections | `tb/start` and `tb/dut/start` land in different sections and move independently. |
| midpoint rule | y just above / below the midpoint of each block, including an unfolded vector. |
| clamping | y over the own head → slot 0; over own not-shown rows → last slot; above / below the list. |
| unchanged | slots `from` and `from + 1` → `unchanged`. |
| other section | y in another section, and in the 8 px gap above it → `other-section` with its label. |
| moveShown | first ↔ last, to the end of a section that is not last in `shown`, other sections' order untouched, no-op returns an equal array, unknown path is a no-op. |
| keyboardTarget | ±1, top, bottom; null at the edges. |
| moveSignal | returns the same object for a no-op; `expanded`, `showAs`, `window`, `cursor` untouched. |
| rerun | `setupFor` with a reordered memory keeps the order for surviving signals and drops missing ones. |
| alignment | after any move, for every trace row, the row's index in `listRows(...).rows` equals the index `rowIndexAt` resolves for its painted y – list and canvas agree. |

The gesture is tested through its pure core: `autoScrollSpeed` and the drop target (`dropTargetAt`) are exported and unit-tested. The pointer wiring itself is covered by the manual script.

### 6.2 Manual end-to-end — `tests/e2e/wave-reorder.md`

Run on the UART transmitter testbench from the owner's screenshot (TB and RTL both have `start`, `tx`, `complete`; RTL has `state` with named segments; any testbench with a vector and an enum works) in Chrome, Firefox and the Windows app:

1. Hover each kind of row: grip only on movable shown signals; none on bits, heads, folders, not-shown, unavailable, or a section with one shown signal.
2. Drag `complete` above `busy` in TB, releasing over the waveform half: order changes in list and waveform; no zoom; cursor unchanged; flash on both halves.
3. Click the checkbox, click the name, double-click the name, each with a slight hand tremor: tick, select and Go to declaration still work.
4. Drag a TB signal into RTL: line disappears, chip *Moves only within TB*, `not-allowed`; release → snaps back, nothing changes.
5. Esc during a drag: drag cancelled, **waveform stays open**. Esc again: waveform closes (existing behaviour).
6. Unfold `data`, drag it: all bits move with it; drag `state` and check that its `idle` / `start_bit` / `data_bits` segments follow.
7. Alt + ↑ / ↓ / Home / End and the Move menu items, including disabled items at the edges; screen reader (NVDA) reads the announcement.
8. Rerun the testbench: order kept. Switch project and back: first view (reset).
9. Report mode: no grip, no drag; the figure shows the new order.
10. Long list (generated testbench with 400 signals, all shown): drag from top to bottom with auto-scroll; check the Performance panel (§ 8, AC-11).
11. Reduced motion on: no fades or glides.
12. Touch screen (Windows tablet or Chrome device mode): grip always visible; dragging by the grip works; swiping the names scrolls the list.

---

## 7. Implementation steps

| Step | Content | Done when |
|---|---|---|
| 1 | `signalOrder.ts` + tests; `moveSignal` in `viewSetup.ts` + tests | All unit tests in § 6.1 pass. |
| 2 | Keyboard: `onMove`, Alt-keys, live region, `scrollIntoView` | Signals can be reordered without a mouse (useful before any visuals). |
| 3 | Menu: **Move** group in `SignalMenu` | Menu items work and disable at the edges. |
| 4 | Grip and cursors in `SignalRow.tsx` / CSS; `movable` flag | Hover state of § 4.1 matches the mockup. |
| 5 | `dragStore.ts`, `rowDragGesture.ts`, `useReorder.ts` (threshold, capture, cancel, drop) without visuals | A drag reorders; clicks and double-clicks unaffected; Esc does not close the view. |
| 6 | `RowDragLayer.tsx`: veil, line, ghost, chip, flash; reduced motion | States of § 4.1 complete. |
| 7 | Auto-scroll | Long-list steps of § 6.2 pass. |
| 8 | Texts, help, spec update (FR-29 in `waveform_viewer_spec.md`), changelog | § 4.4 in place. |
| 9 | Manual script § 6.2 on three platforms; short hallway test with two students | Acceptance criteria § 8. |

Steps 1–3 deliver a complete, accessible feature on their own; steps 4–7 add the mouse interaction on top of the same model.

---

## 8. Acceptance criteria

| # | Criterion |
|---|---|
| AC-1 | Dragging a shown signal to another slot in its section changes the order in the list and the waveform. Values, checkbox states, trace colours, "Show as", unfolded vectors, the time window, the cursor and the parsed waveform data are unchanged (no reparse, no worker message). |
| AC-2 | A press that starts on the grip or the name never starts a zoom range or moves the cursor, including when released over the waveform. A press on the waveform behaves exactly as before. |
| AC-3 | With less than 4 px of travel, the checkbox ticks, the row is selected and a double-click on the name goes to the declaration. |
| AC-4 | The insertion line spans names, values and waveform, and the dropped signal lands exactly where the line was. No line is shown when the drop would not change the order. |
| AC-5 | A signal cannot leave its section. Over another section the line disappears, the hint *Moves only within TB / RTL* appears with a `not-allowed` cursor, and releasing changes nothing. |
| AC-6 | Esc, right-click, window blur and pointer cancel end a drag without change. Esc during a drag does not close the waveform. |
| AC-7 | An unfolded vector moves with all its bits; bit rows, section heads, folders, not-shown and unavailable signals cannot be moved; annotated buses (`state` with its segment names) keep their annotations. |
| AC-8 | **After every move, list rows and waveform traces stay aligned row for row**, including unfolded vectors, annotated buses and section gaps; no frame shows them out of step. |
| AC-9 | Alt + ↑ / ↓ / Home / End and the Move menu items reorder the selected signal; they do nothing at the edges; each move is announced in a live region; focus stays on the moved signal. |
| AC-10 | The order is kept across reruns for signals that still exist and reset when the project changes. A signal ticked again appears at the bottom of its section. |
| AC-11 | **Long lists:** with 400 shown signals, a pointer move updates the line within one frame (no long task while dragging and auto-scrolling in the browser's performance trace), a drop is drawn in about one long frame (≈ 50 ms, the cost of drawing 400 rows once), and auto-scroll moves about 1 300 px/s. *Measured on the production build in headless Chromium (§ 12).* |
| AC-12 | With `prefers-reduced-motion: reduce`, no fade, glide or flash animation runs. |
| AC-13 | The report figure shows the signals in the new order. |
| AC-14 | **Learnability** (NFR-11 style): at least four of five first-year students who have not been shown the feature move `complete` to directly under `clk` without help, within one minute. |

---

## 9. Out of scope

Phase 2 candidates, deliberately left out of this version:

- **Multi-selection** (Ctrl / Shift + click) and moving a selection as a block (D17).
- **Undo / redo** for view changes, as one view-wide feature (D14, Q2).
- Moving signals **across sections**, moving **section heads**, moving **single bits** of a vector.
- **User-defined groups, separators or dividers** (already listed as out of scope in `waveform_viewer_spec.md` § 10).
- Saving the **time window and cursor** in the project file (D18).
- Reordering in **report mode** (the figure follows the view).
- Remembering the slot of a signal that was unticked (D16).

---

## 10. Open questions

| # | Question | Proposal |
|---|---|---|
| Q1 | Should **FR-27** (DUT ports grouped as Inputs / Outputs) constrain moves to within a port group once it exists? | Yes: treat each group like a section in `sectionBlocks`; the model generalises without UI changes. |
| Q2 | A view-wide **undo** (tick, Show as, zoom, order) – worth it? | Decide after the usability test in step 9; a single history of `ViewSetup` values in `useWaveView` would make it cheap. |
| Q3 | Should a **double-click on the grip** do something (e.g. move to top)? | No. Keep the grip single-purpose; the menu has *Move to top*. |

---

## 11. Saving the view in the project file

### 11.1 What the student sees

1. Open a project, run a testbench, press **Waveform**: the view shows the signals saved for that testbench, in their order, with their "Show as" and unfolded vectors. Without a saved view it is the first view, as before (FR-5).
2. Tick, untick, drag, "Show as", unfold: the project reads as *Unsaved changes* (the dot beside the project in Files).
3. *Save project*, *Save to GitHub* or *Download All*: the view is in the `.hdlboard.json`. Opened again – on another computer, or by a student from the teacher's gist – the view comes back.

Zooming, scrolling and moving the cursor never mark the project as changed (D20).

### 11.2 Format

A new optional field of the project file, after `files`:

| Field | Type | Required | Description |
|---|---|---|---|
| `waveViews` | object | no | Saved waveform views, keyed by **testbench name** (the top unit of the run, e.g. `adder4_tb`). |
| `waveViews.<tb>.signals` | array | yes | The shown signals, **in their order in the view**. A signal not listed is not shown. |
| `….signals[].path` | string | yes | The signal below the testbench: `sum`, `dut/sum`, `pair/a` (a record field). |
| `….signals[].showAs` | string | no | `hex`, `decimal`, `ascii` or `binary`, when chosen; left out means the default (hex for vectors). |
| `….signals[].expanded` | boolean | no | `true` when a vector is shown with its bits unfolded. |
| `waveViews.<tb>.notShown` | array | no | Signals **not shown** that keep a "Show as" or an unfolded vector, so the choice comes back when the signal is ticked again. Same fields as `signals`. Left out when empty. |

```json
{
  "version": 1,
  "name": "4-bit Adder",
  "board": "DE1-SoC",
  "description": "…",
  "files": [ … ],
  "waveViews": {
    "adder4_tb": {
      "signals": [
        { "path": "sum", "showAs": "decimal" },
        { "path": "a" },
        { "path": "dut/sum", "expanded": true },
        { "path": "dut/a" }
      ]
    }
  }
}
```

The order of signals within one section (TB, or one RTL instance) is the order in the view. Signals of different sections may be interleaved in the array; each section takes its own in array order. The file format version stays `1`: an older HDLBoard ignores the field (and drops it when it saves).

A save keeps what the run cannot see. A saved signal the current run does not have – one of the other language's testbench of the same name (`counter_tb.vhd` and `counter_tb.v` share `counter_tb`), or one commented out for this run – stays in `signals`, after the signal it followed before, and in `notShown`. Only signals the run has are added, moved or dropped.

### 11.3 Code

| Layer | Function | What it does |
|---|---|---|
| `src/project/waveViews.ts` | `parseWaveViews(raw, warnings)` | Forgiving read (D22). |
| | `serializableWaveViews(views)` | Fixed field order, so an unchanged view saves as the same text and does not read as a change. |
| | `withWaveViewOf(views, tb, view)` | One testbench's view replaced; the same object back when nothing changed; an empty view removed. |
| `workbench/projectFile.ts` | `withWaveView(project, tb, view)` | The project with it; `projectFileText` writes it, `openProject` and `parseStoredProject` read it (the Windows app's stored workspace keeps it too). |
| | `waveViewOf(views, tb)` | One testbench's view; only own entries, so a testbench named `constructor` finds nothing. |
| `waveform/savedView.ts` | `savedViewOf(tb, setup, { known, previous })` / `layoutOf(tb, saved)` | View setup ↔ saved view: full paths ↔ paths below the testbench; signals the run does not have kept from `previous`; unknown "Show as" dropped. |
| `waveform/useSavedView.ts` | `savedLayoutFor(data, saved)`, `useSavedView(view, saved)` | Read for a new waveform; write after a signal action (D20). The view state counts the student's edits, so only an edit that was applied is saved, under the testbench of the waveform it was made on. |
| `waveform/viewSetup.ts` | `setupFor(data, memory, { saved })` | Restore order (D21). |
| `workbench/useProjectWaveViews.ts` | `useProjectWaveViews(project, setProject)` | The port the Workbench hands to the viewer. |

The waveform viewer does not know about projects: it gets a `SavedViews` port (`of(testbench)`, `save(testbench, next)`, where `next` makes the new view from the one saved now), and the Workbench implements it on the project state.

A move is checked against the order the list has when it lands (`fitsOrder`): a drag that a new waveform outlives does nothing if the section's signals changed under it.

## 12. As built

- **Tests:** 1 814 frontend unit tests pass (35 new: `signalOrder`, `savedView`, `waveViews`, `projectFile`), `npm run typecheck` and `npm run lint` (the Clean Code limits) are clean.
- **End to end in Chrome** (dev server and production build, GHDL 4.1, the 4-bit adder testbench and a generated 400-signal testbench):
  - a project file with `waveViews` opens with that view: order, unticked `b`, `sum` in decimal, the RTL `sum` unfolded;
  - drag `a` above `sum` while drifting over the traces: order changes, cursor and window unchanged, flash, announcement *"a moved to place 1 of 2 in TB."*;
  - Alt + ↓ moves and keeps the focus; at the edge nothing happens;
  - the Move menu items are disabled at the edges and work;
  - dragging into RTL shows *Moves only within TB*, `not-allowed`, and changes nothing on release;
  - Esc during a drag cancels it and the view stays open;
  - a checkbox click with a 2 px tremor still unticks; double-click on a name still goes to the declaration;
  - a rerun keeps the order; the project shows *Unsaved changes*; *Download All* contains the new `waveViews`;
  - 400 signals: auto-scroll ≈ 1 300 px/s, no long task while dragging, one ≈ 50 ms frame at the drop (production build).
- **Not checked by hand:** the Windows app, touch screens, a screen reader (the live region text was read from the DOM), Firefox and Safari.

