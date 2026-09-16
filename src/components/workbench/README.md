# Workbench

The app's main page — a VHDL "IDE" shell built to match a reference
`WorkBench.png` mockup of a DE1-SoC-style board IDE: a file tree, a tabbed
syntax-highlighted VHDL editor, Start/Stop simulation controls, a
GHDL-style console, and the real DE1-SoC board mock from
[`components/board`](../board) wired up and live.

> This copy of the project does not include the `DesignResources/`
> reference renders the components were originally measured against — see
> [`Design_Description.md`](../../../Design_Description.md) § 4 for the
> measurements themselves.

It is rendered by default at `npm run dev` (see [`App.tsx`](../../App.tsx)).
The original per-component gallery this project's top-level
[`README.md`](../../../README.md) documents still exists, at the `#gallery`
hash (`src/ComponentGallery.tsx`).

> **There is no real GHDL, compiler, or file system behind this.** Starting a
> simulation plays a scripted console sequence on a timer; uploading or
> creating a file reads it into React state with `FileReader`, nothing is
> written to disk. It exists to *look and behave* like the workbench in the
> reference render, not to compile VHDL. Wiring a real toolchain in behind it
> — a GHDL binary, a WebSocket, whatever the project ends up using — is future
> work; see "Known limitations" below for exactly where that wiring would go.

---

## Contents

- [Layout](#layout)
- [Components](#components)
  - [`<Workbench>`](#workbench-1)
  - [`<Header>`](#header)
  - [`<FileExplorer>`](#fileexplorer)
  - [`<CodeEditor>`](#codeeditor)
  - [`<SimulationCard>`](#simulationcard)
  - [`<ConsoleOutput>`](#consoleoutput)
- [Supporting modules](#supporting-modules)
  - [`vhdlHighlight.ts`](#vhdlhighlightts)
  - [`files.ts`](#filests)
- [How the simulation sequence works](#how-the-simulation-sequence-works)
- [How the editor overlay works](#how-the-editor-overlay-works)
- [Styling](#styling)
- [Known limitations](#known-limitations)

---

## Layout

```
Workbench                              (CSS grid: header / body / console)
├─ Header                              (grid row 1, full width)
└─ .wb-body                            (grid row 2, flex row)
   ├─ .wb-sidebar                      (draggable width, tinted strip, scrolls as one)
   │  ├─ SimulationCard                (card: Start/Stop + status)
   │  └─ FileExplorer                  (card: Upload/New File + the vhdl/work tree)
   ├─ .wb-resizer                      (drag handle — resizes .wb-sidebar)
   ├─ CodeEditor                       (flex: 1 — takes the remaining width)
   ├─ .wb-resizer                      (drag handle — resizes .wb-right)
   └─ .wb-right                        (draggable width panel)
      └─ Board                        (LEDs + HEX on top, SW + KEY underneath)
└─ ConsoleOutput                       (grid row 3, full width)
```

`SimulationCard` and `FileExplorer` are two independent white, rounded,
drop-shadowed cards stacked inside `.wb-sidebar`'s tinted background — not
one merged panel — matching the reference Simulate-and-Files-pane mockup.
Each owns its own border/radius/shadow (`.wb-simcard`, `.wb-files`); the
sidebar only owns their shared width, background tint and outer scrolling.

All state lives in `Workbench.tsx` — every other component here is a plain,
props-driven function component. This mirrors the board layer's own rule
(`Design_Description.md` § 1.1): a component holds only its own UI state,
the caller owns the data.

`workbench/` has no hardware to measure geometry from — it is application
chrome, not a board part — so it does not follow `Design_Description.md`
§ 1.2 (the reference-PNG / physical-state rules) or § 4 (measured ratios).
It does follow § 1.1 (TypeScript + React + plain CSS, no exceptions) and
§ 1.3 (Clean Code: meaningful names, single responsibility, no magic
numbers, no dead code).

## Components

### `<Workbench>`

The page itself. Owns:

- `files: VhdlFile[]` — every file that exists (the starter project plus
  anything uploaded or created in this session).
- `openTabs: string[]` / `activeTabId: string | null` — which files are open
  in the editor and which one is showing.
- `status: SimStatus` — `'stopped' | 'compiling' | 'running'`.
- `elapsedSeconds: number` — ticks up once a second while `status` is
  `'running'`; reset to `0` on the next Start.
- `logLines: ConsoleLine[]` — the console's content.
- `sw`, `key` — the same `BitVector` state a board demo would hold, passed
  straight to `<Switches>`, `<Leds>`, `<Pushbuttons>` and
  `<SevenSegmentDisplays>` exactly as in `ComponentGallery.tsx`.

Takes no props — it is a page, not a reusable component — so there is
nothing to document as an API. Read the source for the handlers
(`handleOpenFile`, `handleCloseTab`, `handleNewFile`, `handleUploadClick`,
`handleFilesChosen`, `handleContentChange`, `handleStart`, `handleStop`,
`handleClearConsole`); each is small and named for exactly what it does.

### `<Header>`

Static chrome: logo, title, tagline, and the Settings/Help buttons (neither
opens anything — there is nothing behind them yet). No props.

### `<FileExplorer>`

```tsx
interface FileExplorerProps {
  files: VhdlFile[];
  activeFileId: string | null;
  onSelect: (id: string) => void;
  onUpload: () => void;
  onNewFile: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}
```

Renders the `vhdl/` and `work/` folders from `files`, grouped by each file's
`folder`. Folders are collapsible (own local `collapsed` state — purely a UI
concern, not lifted to `Workbench`). Clicking a file calls `onSelect`;
`Workbench` opens it as a tab if it isn't already and makes it active.
`onUpload` is wired to a hidden `<input type="file">` in `Workbench`, not
owned by this component — `FileExplorer` only asks for the click.

**Rename and delete.** Each row reveals a pencil and a trash button on
hover/focus (`.wb-files__row-actions`, `opacity: 0` until `:hover` /
`:focus-within` — kept mounted rather than conditionally rendered, so Tab
can still reach them without a hover first). The pencil, or a double-click
on the file name, swaps the row's `<button>` for a `<input>` — they can't
nest, hence the row being a `<div>` wrapping either one, not the button
itself. Enter or blur commits via `onRename`; Escape discards the draft
without calling it. Delete confirms with `window.confirm` (a plain browser
dialog, not a custom one — the whole point being that a destructive,
unrecoverable action needs a distinct kind of "are you sure" from anything
else in here) and then calls `onDelete`.

Both are local to `FileExplorer` only in their *editing* state (`renamingId`
/ `draftName`); the rename and delete themselves are owned by `Workbench`
(`handleRenameFile`, `handleDeleteFile`), same as every other file mutation.
`handleDeleteFile` reuses `handleCloseTab`'s "hand off to the next tab"
logic — a deleted file cannot stay open — so deleting the active file
behaves exactly like closing its tab, plus removing it from `files`.

Folder and file names are wrapped in `.wb-files__label-text`
(`overflow: hidden; text-overflow: ellipsis`), and every row/button it sits
in carries `min-width: 0` — without both, a long filename resists the flex
row's ability to shrink below its own text width, which visually fights
the sidebar's resize handle (see "Resizing" below) even though the
sidebar's own box did shrink underneath it.

### `<CodeEditor>`

```tsx
interface CodeEditorProps {
  tabs: EditorTab[];               // { id, name, content }[], open files only
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onAddTab: () => void;            // the tab strip's "+"
  onChange: (id: string, content: string) => void;
}
```

The tab strip plus one editing surface for the active tab. See
["How the editor overlay works"](#how-the-editor-overlay-works) for the
textarea/`<pre>` mechanism. With no tabs open it renders a plain "No file
open" placeholder rather than an empty editor.

### `<SimulationCard>`

```tsx
type SimStatus = 'stopped' | 'compiling' | 'running';

interface SimulationCardProps {
  status: SimStatus;
  elapsedSeconds: number;
  topFile: string;          // TOP_LEVEL_ENTITY from files.ts — "top.vhd"
  onStart: () => void;
  onStop: () => void;
}
```

The card at the top of the sidebar: a circular play glyph and "Simulation"
heading, a status pill (dot + label) on the right, one full-width button
that is *either* Start (blue) or Stop (red) — never both — and a footer
line reading `Elapsed: HH:MM:SS | Top: top.vhd`.

Purely presentational: the button is disabled while `compiling`, shows
Start when `stopped` or `compiling`, and Stop once `running`; the status
dot's colour and pulse follow `status` the same way. `Workbench` decides
what `status` means and owns the elapsed-time interval — this component
only formats and renders the number it's given.

The title, status label and footer line all use the same
`.wb-simcard__label-text` truncation treatment as `FileExplorer`'s file
names, for the same reason — the "Top: <file>" line in particular can run
long enough to otherwise resist the sidebar shrinking.

### `<ConsoleOutput>`

```tsx
interface ConsoleLine {
  id: number;
  time: string;      // "HH:MM:SS", already formatted
  text: string;
  tone?: 'success' | 'error';
}

interface ConsoleOutputProps {
  lines: ConsoleLine[];
  onClear: () => void;
}
```

A scrolling, auto-scroll-to-bottom log. `tone` only changes text colour
(green/red); the line's timestamp is always dimmed. `onClear` empties the
log — `Workbench` owns the array, this component never mutates it.

## Supporting modules

### `vhdlHighlight.ts`

```ts
function tokenizeVhdlLine(line: string): Token[]
// Token = { text: string; type: 'keyword' | 'type' | 'comment' | 'string'
//                        | 'number' | 'identifier' | 'punctuation' | 'whitespace' }
```

A single-regex, line-based tokenizer. Line-based is not a shortcut: VHDL has
no block comments and no multi-line strings, so no state needs to carry
across lines, and this stays simple on purpose. `KEYWORDS` and `TYPES` are
two `Set`s at the top of the file — add a word there, not in the regex, to
extend the highlighter.

### `files.ts`

`STARTER_FILES: VhdlFile[]` — the six-file starter project shown in the tree
(`top.vhd`, `display7seg.vhd`, `leds.vhd`, `buttons.vhd`, `utility_pkg.vhd`
under `vhdl/`, `tb_top.vhd` under `work/`). `DEFAULT_OPEN_TABS` is the four
tabs open on first load, matching `WorkBench.png`. `TOP_LEVEL_ENTITY`
(`"top.vhd"`) is what `SimulationCard` shows after "Top:". The VHDL itself
is plausible, internally consistent course-style code — it is not
validated against a real compiler, because there isn't one behind this yet.

## How the simulation sequence works

`Workbench.handleStart`:

1. Sets `status` to `'compiling'` and logs the GHDL version line.
2. Schedules one `Compiling vhdl/<name>.vhd ...` line per file in the
   `vhdl/` folder, ~180 ms apart, via `window.setTimeout`.
3. Schedules `Elaborating design ...`, then `Simulation started (run -all) ...`.
4. Finally sets `status` to `'running'`, logs `Simulation running ...` in
   the success tone, and starts a one-second `setInterval` that ticks
   `elapsedSeconds` up — this is what `SimulationCard`'s "Elapsed:" reads.

`handleStop` clears every pending timer (`timers.current`, cleared on
unmount too) and the elapsed-time interval, and logs `Simulation stopped.`.
`elapsedSeconds` is *not* reset on Stop — it holds the last run's duration
until the next Start zeroes it, the way a stopwatch would. Because every
step is a
`setTimeout` against the *current* `files` list at the moment Start was
clicked, editing a file's content while "compiling" does not retroactively
change what gets logged for that run — the same way a real compile wouldn't
see edits made after it started.

This is the seam where a real backend would attach: replace the body of
`handleStart`/`handleStop` with whatever actually invokes GHDL (a local
process, a WebSocket to a server, WASM — out of scope here), and keep
appending to `logLines` / setting `status` the same way.

## How the editor overlay works

`CodeEditor` uses the standard technique for an editable, syntax-highlighted
text box without a full editor library: a transparent `<textarea>` sits
exactly on top of a highlighted `<pre>`, both absolutely positioned with
identical font, padding and line-height.

- The `<textarea>` holds the real value, the real caret, and real selection
  — typing, cut/paste, undo, everything native.
- The `<pre>` underneath renders the same text run through
  `tokenizeVhdlLine`, coloured with CSS classes (`.wb-tok-keyword` etc. in
  `CodeEditor.css`). It is `aria-hidden` and `pointer-events: none` — purely
  visual.
- The textarea's text is `color: transparent`, so only the highlighted
  layer is ever visible; the caret stays visible via `caret-color`.
- Both layers scroll independently by default (they're two separate boxes),
  so `CodeEditor`'s `onScroll` copies the textarea's `scrollTop`/`scrollLeft`
  onto the `<pre>` (and the line-number gutter) on every scroll event. The
  `<pre>` has `overflow: hidden`, not `auto` — it is scrolled *only*
  programmatically, so it never grows its own draggable scrollbar sitting on
  top of the textarea's real one.

No third-party editor dependency, consistent with this project's "no runtime
dependencies beyond React" rule.

## Styling

Plain CSS per component, same as every other part of this project — no
CSS-in-JS, no Tailwind. `Workbench.css` defines one set of tokens, scoped to
the `.wb` root class, for the chrome that has no hardware reference to
measure (colours, the header/console/sidebar heights, spacing). This is a
parallel structure to `board/tokens.css`'s `.pb-ui` scope, not a reuse of
it — the two token sets serve different things (measured hardware geometry
vs. ordinary UI values) and are kept separate on purpose.

### Resizing

Both side panels are draggable, each via its own `.wb-resizer` handle:
`.wb-sidebar` from the one between it and the editor
(`handleSidebarResizerPointerDown`), `.wb-right` from the one on its own
left edge (`handleBoardResizerPointerDown`). Neither width is applied
directly from the drag delta: every move of either handle, and every resize
of `.wb-body` itself (`ResizeObserver`), goes through `applyLayout`, which

- clamps each panel's requested width between its own minimum and a
  *computed* ceiling — whatever the other two panes don't need,
  `room - otherPaneMin - EDITOR_MIN_W`, where `room` is the measured width
  less the two handles (`CHROME_W`) — then
- if both requested widths together don't leave the editor `EDITOR_MIN_W`,
  shrinks one or both panels via its `shrinkFirst` argument: during an
  active drag, whichever panel *isn't* the one being dragged gives way
  first (so the panel you're actively resizing tracks the pointer
  exactly), falling back to the dragged one too if that's still not
  enough; on a plain window resize (no active drag — the `ResizeObserver`
  callback passes no `shrinkFirst`, so it defaults to `'proportional'`),
  both panels give way together, split in proportion to how much each has
  left above its own minimum. Giving one panel strict priority on a window
  resize (rather than splitting proportionally) leaves the *other* one
  looking frozen — it won't shrink at all until the prioritized one has
  already been squeezed to its floor, which can be a wide range of window
  widths if that panel had been dragged wider than its default.

Each panel remembers the user's actual last-requested width in a ref
(`desiredSidebarWidth` / `desiredBoardWidth`) separately from its rendered,
possibly-clamped state — so dragging the sidebar wide, which shrinks the
board out of the way, doesn't forget the board's preferred width: drag the
sidebar back and the board grows back to it.

This is what keeps either panel from ever being pushed outside the browser
window by the other — they shrink instead, in JS, rather than relying on
flexbox to shrink a `flex: none` panel (which it won't).

Three things here are load-bearing, and each was a bug before it was a rule:

**No fixed maximum for either side panel.** The ceilings are computed, not
constants. A fixed cap silently breaks the divider: widen the window and the
capped panel stays put while the editor swallows all the new space, so the
divider can no longer be dragged back to the screen position it held before
— there is no width that puts it there. The panel also starts pinned against
its own cap if the default equals it, which makes dragging outwards look
dead. Bound a panel by what the *other* panes need, never by a number.

**`min-width: 0` on `.wb-body`.** It is a grid item, so it defaults to
`min-width: auto` — its min-content width — and since every pane inside is
`flex: none`, that min-content is the panes' full combined width. Without
the override the row will not shrink below that sum, so the width
`applyLayout` measures is a frozen number rather than the space actually
available, it concludes everything fits, and *no reconciliation happens at
all* on a window resize. `.wb`'s `overflow-x: hidden` then quietly clips the
board panel off the right edge, which looks enough like a moving divider to
hide the fault.

**The side panels are `border-box`.** `applyLayout` budgets in rendered
pixels, so the width it sets has to be the width on screen. While they were
content-box their padding (14px and 16px a side) sat outside that number and,
with the two 10px handles, 80px of the row went unbudgeted — enough to
squeeze the editor to 120px against a declared `EDITOR_MIN_W` of 200. The
`*_DEFAULT_W` constants include the padding for this reason; changing a
panel's padding means changing them to match.

### Fitting the board to its pane

The board pane never scrolls and the board inside it never reflows. The
parts keep one fixed 2×2 arrangement at one fixed internal size
(`size={24}`), and `.wb-board-fit__inner` is scaled with a CSS `transform`
to whatever the pane currently gives it, so the parts' positions relative
to each other are identical at every pane width — only the scale changes.

The scale is `min(paneW / naturalW, paneH / naturalH)`, recomputed by a
`ResizeObserver` on both the pane and the board (Workbench.tsx's board-fit
effect). Measuring can't feed back into the scale: `offsetWidth` /
`offsetHeight` and `ResizeObserver`'s `contentRect` all report the
*untransformed* layout box, which the `transform` never changes.

`transform` rather than shrinking `--pb-unit`, because a good deal of the
part chrome is hardcoded 1–2px borders and shadows
(`Switches/ToggleSwitch.css`, `Leds/Led.css`, `board/panel.css`). Those do
not scale with the unit, so a smaller unit would leave chunky borders on
shrunken parts; a transform scales every one of them uniformly.

`Board`'s own single-column fallback below a **900px viewport width**
(`components/board/Board.css`) is therefore overridden in here
(`.wb-board-fit .pb-board` in `Workbench.css`) — the scale handles a narrow
pane instead. Standalone `Board` users, such as the gallery, keep the
stacking fallback.

## Known limitations

- **No real GHDL.** See "How the simulation sequence works" above.
- **No persistence.** Files, tabs and console output all live in React state
  and are lost on reload. Nothing is written to disk, and "Upload" only
  reads a file into memory.
- **Settings and Help do nothing.** They're chrome from the reference render
  with no feature behind them yet.
- **Not rendered-checked against `WorkBench.png`.** Build and typecheck are
  clean, and the layout math above was checked by hand, but no automated
  browser was available in the environment this was built in (no
  network access to fetch a Playwright browser, no connected Claude-in-Chrome
  session) — see `Design_Description.md` § 7 for the intended
  screenshot-next-to-reference workflow, and run it once a browser is
  available:

  ```bash
  npm run build && npx vite preview --port 4173
  node tools/screenshot.mjs .wb out.png   # or: full-page, see tools/screenshot.mjs
  ```
