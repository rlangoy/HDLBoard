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
   ├─ .wb-sidebar                      (fixed width, tinted strip, scrolls as one)
   │  ├─ SimulationCard                (card: Start/Stop + status)
   │  └─ FileExplorer                  (card: Upload/New File + the vhdl/work tree)
   ├─ CodeEditor                       (flex: 1 — takes the remaining width)
   └─ .wb-right                        (fixed width panel)
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
}
```

Renders the `vhdl/` and `work/` folders from `files`, grouped by each file's
`folder`. Folders are collapsible (own local `collapsed` state — purely a UI
concern, not lifted to `Workbench`). Clicking a file calls `onSelect`;
`Workbench` opens it as a tab if it isn't already and makes it active.
`onUpload` is wired to a hidden `<input type="file">` in `Workbench`, not
owned by this component — `FileExplorer` only asks for the click.

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

One layout detail worth knowing before changing panel widths:
`Board`'s 2-column grid (`components/board/Board.css`) only drops to a
single column below a **900px viewport width** — it has no way to know it is
sitting inside a narrower sidebar. At the `size={24}` this page passes, the
two columns need roughly 700px, so `.wb-right` is sized (`--wb-right-w:
760px`) to give it that room, and a `@media (max-width: 1350px)` rule in
`Workbench.css` shrinks the panel *and* forces `.pb-board`'s
`grid-template-columns` back to one column, rather than letting the grid
overflow its container. If you resize the board (`size={…}` on `<Board>`),
re-check that math — it does not resize itself automatically.

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
