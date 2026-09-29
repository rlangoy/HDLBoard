# Workbench

`<Workbench>` is a self-contained HDL "IDE" component: a file tree, a tabbed
syntax-highlighted editor, Start/Stop simulation controls, a simulator
console, and the DE1-SoC board from [`components/board`](../board), driven
by a real GHDL or Icarus Verilog simulation over WebSocket
([`ghdlClient.ts`](#ghdlclientts); the backend and wire protocol are in
[`ghdl_implementation_plan.md`](../../../docs/ghdl_implementation_plan.md)).
Its building blocks (`<FileExplorer>`, `<CodeEditor>`, `<SimulationCard>`,
`<ConsoleOutput>`, `<Header>` and the dialogs) are exported too and can be
used on their own.

## Using the component

```tsx
import { Workbench } from './components/workbench';

export default function Page() {
  return <Workbench />;
}
```

`<Workbench>` takes no props and owns all of its state (see
[`<Workbench>`](#workbench-1)). What the host has to provide:

- **A backend.** Start does nothing useful without the simulation server
  (`server/`) running. The client connects to
  `ws://<page host>:<port>/ghdlsim` — the host is always the one the page was
  loaded from, never a hardcoded `localhost`, and the port defaults to `9010`,
  overridable at build time with `VITE_GHDL_WS_PORT`. Without a backend,
  Start fails fast with a red console line
  (`ERROR internal, "Could not reach the GHDL backend at …"`), not a hang.
- **The whole viewport.** The root `.wb` is `height: 100vh` with its own
  header / body / console grid, so mount it as the page, not inside a
  scrolling container.
- **`__APP_VERSION__`.** The About dialog shows a version string the bundler
  must define (`vite.config.ts` injects it from `package.json`; it is
  declared in `src/vite-env.d.ts`).
- **Optionally, a host bridge.** If `window.hdlboard` exists
  ([`desktop.ts`](#desktopts)), the Settings dialog offers project storage and
  the workspace is loaded on mount and auto-saved. In a plain browser it is
  absent and nothing is stored. Dispatching `ABOUT_EVENT` on `window` opens
  the About dialog from outside React (a native menu, for instance).

The barrel (`index.ts`) exports `Workbench`, `Header`, `AboutDialog`,
`SettingsDialog`, `HelpDialog`, `FileExplorer`, `CodeEditor`,
`SimulationCard`, `ConsoleOutput` and their prop types, plus `REPO_URL`,
`ISSUES_URL`, `STARTER_FILES`, `DEFAULT_OPEN_TABS`, `TOP_LEVEL_ENTITY`,
`VhdlFile`, `EditorTab`, `SimStatus`, `ConsoleLine`, `tokenizeVhdlLine`,
`Token` and `TokenType`.

---

## Contents

- [Using the component](#using-the-component)
- [Layout](#layout)
- [Components](#components)
  - [`<Workbench>`](#workbench-1)
  - [`<Header>`](#header)
  - [`<AboutDialog>`, `<SettingsDialog>` and `<HelpDialog>`](#aboutdialog-settingsdialog-and-helpdialog)
  - [`<FileExplorer>`](#fileexplorer)
  - [`<CodeEditor>`](#codeeditor)
  - [`<SimulationCard>`](#simulationcard)
  - [`<ConsoleOutput>`](#consoleoutput)
- [Supporting modules](#supporting-modules)
  - [`vhdlHighlight.ts`](#vhdlhighlightts)
  - [`files.ts`](#filests)
  - [`fileKinds.ts` and `consoleLines.ts`](#filekindsts-and-consolelinests)
  - [`Dialog.tsx` and `project.ts`](#dialogtsx-and-projectts)
  - [`helpResources.ts`](#helpresourcests)
  - [`icons.tsx`](#iconstsx)
  - [`desktop.ts`](#desktopts)
  - [`ghdlClient.ts`](#ghdlclientts)
- [How the simulation runs](#how-the-simulation-runs)
- [How the editor overlay works](#how-the-editor-overlay-works)
- [Styling](#styling)
- [Known limitations](#known-limitations)

---

## Layout

```
Workbench                              (CSS grid: header / body / divider / console)
├─ Header                              (grid row 1, full width)
└─ .wb-body                            (grid row 2, flex row)
   ├─ .wb-sidebar                      (draggable width, tinted strip, scrolls as one)
   │  ├─ SimulationCard                (card: Start/Stop + status)
   │  └─ FileExplorer                  (card: Upload/New File/Download All + the vhdl/verilog/work tree)
   ├─ .wb-resizer                      (drag handle — resizes .wb-sidebar)
   ├─ CodeEditor                       (flex: 1 — takes the remaining width)
   ├─ .wb-resizer                      (drag handle — resizes .wb-right)
   └─ .wb-right                        (draggable width panel)
      └─ Board                        (LEDs + HEX on top, SW + KEY underneath)
├─ .wb-resizer--row                    (grid row 3, drag handle — resizes the console)
└─ ConsoleOutput                       (grid row 4, full width, draggable height)
```

`SimulationCard` and `FileExplorer` are two independent white, rounded,
drop-shadowed cards stacked inside `.wb-sidebar`'s tinted background — not
one merged panel. Each owns its own border/radius/shadow (`.wb-simcard`,
`.wb-files`); the sidebar only owns their shared width, background tint and
outer scrolling.

All state lives in `Workbench.tsx` — every other component here is a plain,
props-driven function component. This mirrors the board layer's own rule
(`Design_Description.md` § 1.1): a component holds only its own UI state,
the caller owns the data.

`workbench/` has no hardware to measure geometry from — it is UI chrome,
not a board part — so it does not follow `Design_Description.md` § 1.2 (the
reference-PNG / physical-state rules) or § 4 (measured ratios). It does
follow § 1.1 (TypeScript + React + plain CSS, no exceptions) and § 1.3
(Clean Code: meaningful names, single responsibility, no magic numbers, no
dead code).

## Components

### `<Workbench>`

The composed component. Owns:

- `files: VhdlFile[]` — every file that exists (the starter project, or the
  stored workspace when a host bridge provides one, plus anything uploaded
  or created since).
- `openTabs: string[]` / `activeTabId: string | null` — which files are open
  in the editor and which one is showing.
- `topFileId: string | null` — the design file a run starts from.
- `status: SimStatus` — `'stopped' | 'compiling' | 'running'`.
- `elapsedSeconds: number` — ticks up once a second while `status` is
  `'running'`; reset to `0` on the next Start.
- `logLines: ConsoleLine[]` — the console's content.
- `sw`, `key` — the same `BitVector` state a board demo would hold, passed
  straight to `<Switches>`, `<Leds>`, `<Pushbuttons>` and
  `<SevenSegmentDisplays>`.

It takes no props, so there is no API beyond mounting it. Read the source
for the handlers (`handleOpenFile`, `handleCloseTab`, `handleNewFile`,
`handleUploadClick`, `handleFilesChosen`, `handleContentChange`,
`handleStart`, `handleStop`, `handleClearConsole`); each is small and named
for exactly what it does.

### `<Header>`

Chrome: logo, title, tagline, and the Settings, Help and About buttons. It
owns no state; `<Workbench>` passes `onSettings`, `onHelp` and `onAbout` (all
optional), which open the three dialogs below.

### `<AboutDialog>`, `<SettingsDialog>` and `<HelpDialog>`

Three modal dialogs, all `{ open, onClose }` and all built on the shared
`<Dialog>` shell (see [`Dialog.tsx` and `project.ts`](#dialogtsx-and-projectts)).
`<Workbench>` keeps a single `dialog: 'about' | 'settings' | 'help' | null`
state, so at most one is open.

- **About** — the project's public face: the GitHub repository address
  (`REPO_URL`), the copyright notice (`Copyright © 2026 Rune Langøy`), the
  licence (free software, GPL-2.0), the version (`__APP_VERSION__`), credit
  to GHDL, the statement that it was developed at USN – University of
  South-Eastern Norway for use in its entry course on VHDL programming, and
  the **"ABSOLUTELY NO WARRANTY — use it at your own risk"** notice. Opened
  from the header's About button, or by dispatching `ABOUT_EVENT` on
  `window`, which `<Workbench>` listens for.
- **Settings** — with a host bridge present it has one option, "Keep my
  project between sessions" (applies after restart; see
  [`desktop.ts`](#desktopts)); without one the dialog says there are no
  settings. Either way it invites users to file suggestions and bug reports
  as GitHub issues: "Report a bug" and "Suggest an improvement" open
  `ISSUES_URL/new` with a prefilled title, and "Browse existing issues"
  opens the issue list. The links open in a new tab (`target="_blank"`); an
  Electron host should hand `https:` URLs to `shell.openExternal`.
- **Help** — a wide dialog in two parts. First, *the board's signal names*:
  a table of the `DE1_SoC` entity's ports (`CLOCK_50`, `CLOCK_500Hz`, `SW`,
  `KEY_N`, `LEDR`, `HEXn_N`) with direction, the panel each is shown as and
  what it means, then a plain-language guide to the naming (`_N` = active low,
  the `n` in `HEXn_N`, `[3:0]` bit ranges), a small figure of the board's
  segment numbering with a worked `"1111001"` example, and a note on what to
  change before taking a design to the real board (drop `_N`, remove
  `CLOCK_500Hz`). Second, *Learn VHDL*: one cheat sheet, up to five guides and
  courses ranked best first (numbered), and two references (the DE1-SoC manual
  and GHDL). The port table and segment figure are in `HelpDialog.tsx` and
  must be kept in step with `DE1_SoC.vhdl` (`files.ts`) and
  `SevenSegment/segments.ts`; the links are data in `helpResources.ts`.

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
  onDownload: (id: string) => void;
  onDownloadAll: () => void;
  onFilesDropped: (files: FileList) => void;
  topFileId: string | null;
  onSetTopFile: (id: string) => void;
}
```

Renders the `vhdl/`, `verilog/` and `work/` folders from `files`, grouped by
each file's `folder`; a folder with no files is not drawn, so `work/` only
appears once a VHDL `tb_*` file has been uploaded (the starter project has
none; it has `vhdl/` and `verilog/`). Folders are collapsible (own local
`collapsed` state — purely a UI concern, not lifted to the caller). Clicking
a file calls `onSelect`; `Workbench` opens it as a tab if it isn't already
and makes it active. `onUpload` is wired to a hidden `<input type="file">`
in `Workbench`, not owned by this component — `FileExplorer` only asks for
the click.

**Drag-and-drop.** The whole panel (`<aside className="wb-files">`, not
just the tree) is a drop target — `onDragEnter`/`onDragOver`/`onDragLeave`/
`onDrop` all live on the root element, and a translucent
`.wb-files__drop-hint` overlay (`position: absolute; inset: 0`, needs the
root's `position: relative`) covers it while a file is dragged over.
`onDragOver` calling `e.preventDefault()` is not optional — a browser
treats a drop target as declining the drop, and never fires `onDrop` at
all, unless something in the drag sequence calls that. The highlight is a
ref-counted `dragDepth` (an integer, not a boolean): entering a child
element fires that child's `dragenter` and the parent's `dragleave` in the
same tick (before the child's own `dragenter` — the browser doesn't
guarantee an order that makes a boolean safe), so naively setting the
highlight false on any `dragleave` flickers it off and on as the pointer
crosses every row underneath it while still over the panel. `e.dataTransfer
.types.includes('Files')` gates all four handlers so dragging page text or
another element over the panel is inert.

`onFilesDropped` hands the raw `FileList` straight to the caller, which
owns file-reading (`Workbench`'s `readAndAddFiles`, shared with the `<input
type="file">` picker) — `FileExplorer` does no reading itself. This matters
beyond not repeating code: a native file picker's
`accept=".vhd,.vhdl,.v,.vh"` only filters what the *dialog* shows, never
what a drop can deliver, so `readAndAddFiles` is where other files actually
get rejected (a red console line, `Skipped <name>: not a .vhd / .vhdl / .v /
.vh file.`), regardless of which path they arrived by. Which folder a file
lands in is `folderForUpload` in `fileKinds.ts` (see below), not this
component.

**The top file.** Every `vhdl/` and `verilog/` row (never `work/` — a
testbench isn't a candidate; `hasTopDot(folder)` decides) gets a small dot
before its name: a blue `.wb-files__top-dot.is-top` for whichever file's
`id` equals `topFileId`, a gray `.wb-files__top-dot` for every other. It's a
sibling of the file-select `<button>`, not nested inside it — an
interactive element can't nest inside another one, which is the same reason
the rename `<input>` replaces that button rather than sitting inside it.
The current top's dot is `disabled`: there's nothing a second click on it
would do; single-select is the caller owning one `topFileId`, not anything
enforced here. Clicking any other file's dot calls `onSetTopFile(id)`
directly — no need to first open/select that file. Each dot also carries a
native `title` tooltip — "Top-File" on the current one, "Set Top-File" on
every other — which a browser shows on hover regardless of `disabled`;
`aria-label` carries the fuller, file-named version of the same thing for
screen readers.

`Workbench` sends the top file's `name` as `RUN`'s optional inline arg
(`ghdl_implementation_plan.md` § 6.3) so the backend elaborates *that*
entity specifically, rather than guessing from board-port matches — with
two files declaring the same board ports, the dot decides which one runs.

**Rename and delete.** Each row reveals an edit and a delete button
(`icons.tsx`) on hover/focus (`.wb-files__row-actions`, `opacity: 0` until
`:hover` / `:focus-within` — kept mounted rather than conditionally
rendered, so Tab can still reach them without a hover first). The edit
button, or a double-click on the file name, swaps the row's `<button>` for
an `<input>` — they can't nest, hence the row being a `<div>` wrapping
either one, not the button itself. Enter or blur commits via `onRename`;
Escape discards the draft without calling it. Delete confirms with
`window.confirm` (a plain browser dialog, so a destructive, unrecoverable
action gets a distinct kind of "are you sure" from anything else in here)
and then calls `onDelete`.

Only the *editing* state (`renamingId` / `draftName`) is local to
`FileExplorer`; the rename and delete themselves are owned by the caller
(`Workbench`'s `handleRenameFile`, `handleDeleteFile`), same as every other
file mutation. `handleDeleteFile` reuses `handleCloseTab`'s "hand off to
the next tab" logic — a deleted file cannot stay open — so deleting the
active file behaves exactly like closing its tab, plus removing it from
`files`.

**Download.** Each row also has a download button (before rename), and the
actions column has **Download All**, which saves the whole project as one
`.zip` laid out like the tree (`vhdl/…`, `verilog/…`, `work/…`), named
`HDLBoard-project-YYYY-MM-DD.zip`. Ctrl+S / Cmd+S downloads the active tab
instead of the browser's "Save page as…". It is all client-side
(`download.ts`: a Blob plus an `<a download>` click; an Electron host shows
its native Save As dialog for the same click). The ZIP comes from `zip.ts`,
a ~140-line stored-only writer (CRC-32, UTF-8 names), not jszip, to keep
"no runtime deps beyond React". Duplicate names in one folder get ` (2)`,
` (3)` … so no file is lost on extraction. Tests: `zip.test.ts`.

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
  onFilesDropped: (files: FileList) => void;
}
```

The tab strip plus one editing surface for the active tab. See
["How the editor overlay works"](#how-the-editor-overlay-works) for the
textarea/`<pre>` mechanism. With no tabs open it renders a plain "No file
open" placeholder rather than an empty editor — which is itself a valid
drop target (below), a quick way back to a non-empty project.

**Drag-and-drop.** Same mechanism and `onFilesDropped` contract as
`<FileExplorer>` (see its own entry above for the ref-counted `dragDepth`
reasoning) — dropped files are *imported into the project*, not inserted
as text. That second part needs active prevention: a plain `<textarea>`'s
default behavior for a dropped file is to insert its content (or, in some
browsers, its path) as text at the drop position, and `onDragOver`'s
`e.preventDefault()` is what suppresses that, same call that also makes
`onDrop` fire at all — dropping onto the textarea imports the file and
leaves the text being edited untouched. The whole `.wb-editor` root — tab
strip, the open file, and the empty state — is one drop target, so where
exactly the pointer lands doesn't matter.

### `<SimulationCard>`

```tsx
type SimStatus = 'stopped' | 'compiling' | 'running';

interface SimulationCardProps {
  status: SimStatus;
  elapsedSeconds: number;
  topFile: string;          // whichever design file has the blue dot right now
  onStart: () => void;
  onStop: () => void;
}
```

The card at the top of the sidebar: a circular play glyph and "Simulation"
heading, a status pill (dot + label) on the right, one full-width button
that is *either* Start (blue) or Stop (red) — never both — and a footer
line reading `Elapsed: HH:MM:SS | Top: <name>`, where `<name>` is the
`topFile` prop.

Purely presentational: the button is disabled while `compiling`, shows
Start when `stopped` or `compiling`, and Stop once `running`; the status
dot's colour and pulse follow `status` the same way. The caller decides
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
(green/red); the line's timestamp is always dimmed. `onClear` asks the
caller to empty the log — the caller owns the array, this component never
mutates it.

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

`STARTER_FILES: VhdlFile[]` — the starter project shown in the tree:
`DE1_SoC.vhdl`, `blinkTest.vhdl`, `keyCouter2Led.vhdl` under `vhdl/`, and
their Verilog twins `DE1_SoC.v`, `blinkTest.v`, `keyCouter2Led.v` under
`verilog/`. The twins are copies of `tests/fixtures/{vhdl,verilog}/`, and
`files.fixtures.test.ts` fails if either side drifts. `blinkTest.vhdl` and
`keyCouter2Led.vhdl` are both standalone examples (their own
`blinkTest`/`counter8` entities, not wired into `DE1_SoC.vhdl`) — mark
either top via its Files-panel dot to run it on its own. `blinkTest.vhdl`
demonstrates `CLOCK_500Hz` (§ 3.2/§ 5.7); `keyCouter2Led.vhdl` is a
`CLOCK_50`/`KEY_N`-driven up-counter (`KEY_N(0)` counts, `KEY_N(1)` resets)
displayed on `LEDR`.

`DEFAULT_OPEN_TABS` is the one tab open on first load (`DE1_SoC.vhdl`).
`TOP_LEVEL_ENTITY` (`"DE1_SoC.vhdl"`) is only the *initial* top file —
`Workbench`'s `topFileId` starts pointed at whichever starter file has this
name, then moves independently once a user clicks another design file's
dot (`<FileExplorer>`, above). `DE1_SoC.vhdl` declares the real DE1-SoC
top-level ports (`CLOCK_50`, `SW`, `KEY_N`, `LEDR`, `HEX0_N..HEX5_N` —
`ghdl_implementation_plan.md` § 3.2), not stand-ins for them —
`KEY_N`/`HEX0_N..HEX5_N` are this course's own naming convention rather
than the board's literal pin names (`KEY`/`HEX0..HEX5`), the one exception
to that otherwise-literal contract; see § 3.2's note. Every starter file
compiles and runs under GHDL (`--std=08`) or Icarus Verilog.

### `fileKinds.ts` and `consoleLines.ts`

Pure modules, so `Workbench` and `FileExplorer` never look at a file name
themselves, and covered by vitest (`npm test`):

- `folderForUpload(name)` — `.v`/`.vh` go to `verilog/`, `.vhd`/`.vhdl` to
  `vhdl/`, a VHDL `tb_*` to `work/`, anything else is refused. A Verilog
  testbench stays in `verilog/` because it is compiled with its design.
- `sourceFolderFor(top)` — which folder a run sends.
- `folderAfterRename(current, newName)` — a rename that changes the language
  moves the file to the new language's folder.
- `topAfterDelete(files, id)` — the deleted top's successor comes from the
  same folder, so a Verilog run stays a Verilog run.
- `hasTopDot(folder)`, `UPLOAD_ACCEPT`, `ACCEPTED_FILES_TEXT`.
- `appendCapped(lines, line)` (`consoleLines.ts`) — the console keeps the
  newest 2000 lines.

The extension rules mirror `server/src/engines/language.ts`; the two packages
share no code, so a change to one must be made in the other.

### `Dialog.tsx` and `project.ts`

`Dialog.tsx` is the modal shell all three dialogs share (`size="wide"` gives
the Help dialog its 760 px width instead of 560 px): a blue header band
(icon badge, title, subtitle, coloured from the header's `--wb-header-bg`),
a scrolling body, and a Close button. Escape or a click on the backdrop
closes it; focus starts on Close, Tab wraps inside the dialog, and focus
returns to the element that opened it. It carries `role="dialog"` /
`aria-modal` and is labelled by its title (and described by `describedBy`,
when given). Its styles live in `Dialog.css`, along with the shared callout
and link-button styles; each dialog adds its own small stylesheet.

`project.ts` holds the constants the dialogs and a host need to agree on:
`APP_NAME` (`HDLBoard`), `APP_TAGLINE` (`Write VHDL or Verilog and watch it
run`), `REPO_URL` (`https://github.com/rlangoy/HDLBoard`), `ISSUES_URL`,
`GHDL_URL`, and `ABOUT_EVENT` (`'hdl-board:show-about'` — a host that
dispatches it, such as `winInstaller/electron/main.js`, must use the same
string). Change the repository address in this one place.

### `helpResources.ts`

The Help dialog's links, as typed data: `CHEAT_SHEET` (exactly one),
`GUIDES` (at most five, **ordered best first** — the dialog numbers them in
array order) and `REFERENCES` (the board manual and GHDL). Each entry has a
title, URL, source, kind and a one-sentence description written for this
dialog. All URLs were opened and checked when added; to change the list, edit
the arrays and keep the cheat sheet single and the guides to five. Use
`https:` links only — an Electron host opens those in the user's browser and
ignores other schemes.

### `icons.tsx`

`EditIcon`, `DeleteIcon`, `DownloadIcon`, `FilesIcon` and `GearIcon`. The one
deliberate exception to this folder's otherwise all-CSS icons (the upload
arrow, `+`, chevron, folder and file glyphs are all drawn from
`FileExplorer.css` pseudo-elements, same technique as the board parts):
these are real Material Symbols Outlined glyphs (wght 400 / GRAD 0 /
opsz 24 / FILL 0), inlined as plain SVG path data rather than approximated
in CSS shapes, because a hand-drawn trash can at this size reads worse than
the real icon. They are committed as source — not loaded from a font or
CDN at runtime, which would break the "no runtime deps beyond React" /
fully-local guarantee. `fill="currentColor"` on the `<svg>` is what lets
each icon inherit its button's colour, including the red hover state on
delete (`.wb-files__row-action--danger`), the same way every CSS-drawn icon
in this folder already does.

### `desktop.ts`

```ts
interface HdlBoardBridge {
  readonly enabled: boolean;                        // storage on for this launch
  setEnabled(enabled: boolean): Promise<boolean>;   // applies after restart
  saveWorkspace?(json: string): Promise<boolean>;   // present only while enabled
  loadWorkspace?(): Promise<string | null>;
}
// window.hdlboard?: HdlBoardBridge
```

The optional host bridge for project storage. `<Workbench>` feature-detects
`window.hdlboard`; when `loadWorkspace` is present it loads the stored
workspace on mount (holding auto-save back until that answers, so the
starter files never overwrite it), then saves, debounced, on every change
and on `pagehide`. What is stored is `serializeWorkspace` output — `files`,
`openTabs`, `activeTabId`, `topFileId` and a version number;
`parseWorkspace` rejects anything else. Where it is stored is up to the
host (the desktop build's implementation is in `winInstaller/electron/`).
Tests: `desktop.test.ts`.

### `ghdlClient.ts`

```ts
export class GhdlClient {
  constructor(url: string, handlers: GhdlClientHandlers);
  run(files: VhdlFile[], topFileName?: string): void;
  stim(sw: BitVector, key: BitVector): void;
  reset(): void;
  stop(): void;
  close(): void;
}

export function ghdlBackendUrl(port?: number): string; // ws[s]://<page host>[:<port>]/ghdlsim, no port = page origin
```

The only file in this component that speaks WebSocket to the backend — full
wire protocol and backend design are in
[`ghdl_implementation_plan.md`](../../../docs/ghdl_implementation_plan.md) § 6.
`Workbench` calls this; nothing else touches `WebSocket` directly.

One `head-line`/`body` split (`text.indexOf('\n')`) is the entire parser —
there is no protocol library, matching the plan's design goal of a command
grammar simple enough to need none. Mirrors `server/src/protocol.ts`'s
grammar independently rather than importing it: this code runs in the
browser and cannot import a Node-side file.

## How the simulation runs

`Workbench` holds one `GhdlClient` (`ghdlClient.ts`), created lazily on
first Start rather than on mount — mounting the component never opens a
socket nobody asked for. Full wire protocol and backend design:
[`ghdl_implementation_plan.md`](../../../docs/ghdl_implementation_plan.md) § 6.

`handleStart`:

1. Resets `elapsedSeconds`, sets `status` to `'compiling'`, blanks the
   board (`blankBoard()` — LEDs off, HEX blank; see
   `Design_Description.md` § 5 convention 11), and calls
   `client.run(files, topFileName)`, which sends the files of the top file's
   folder (`sourceFolderFor` in `fileKinds.ts`: `verilog/` for a Verilog top,
   `vhdl/` otherwise) as one `RUN` frame; the backend picks GHDL or Icarus
   from the top file's extension.
2. The backend's `LOG`/`ERROR` frames drive `appendLog` directly — the
   simulator's own output (or, on failure, its own error text with file:line)
   reaches the console verbatim.
3. On `READY`, `status` becomes `'running'`, the elapsed-time interval
   starts, and the client immediately sends one `STIM` of the *current*
   `SW`/`KEY` state — read from `swRef`/`keyRef`, not the `sw`/`key` state
   variables directly, because the client's handlers are captured once when
   it's constructed and would otherwise see a permanently stale closure —
   without it, switches flipped *before* Start would have no effect until
   touched again.
4. Every `STATE` frame updates `ledState`/`hexState` — the *only* place
   either is written once a session exists. `SW`/`KEY` changes
   (`handleSwChange`/`handleKeyChange`) send a fresh `STIM` on every
   change, passing the *next* value, never the `sw`/`key` state variable
   (React state isn't updated synchronously, so the stale value would
   leave the board permanently one flip behind).

`handleStop` sends `STOP` and nothing else — `status`/log/board-blanking
all happen when the backend's own `DONE` frame arrives (`onDone`), not
optimistically on click, so the backend stays the single source of truth
for whether a simulation is running. `onError` and `onClosed` blank the
board for the same reason: nothing is currently driving it.
`elapsedSeconds` is *not* reset on Stop — it holds the last run's duration
until the next Start zeroes it, the way a stopwatch would.

**Two ways a session can end on its own, not just via Stop.** `onDone`'s
`reason` distinguishes them: `'stopped'` (the user clicked it, either mode)
from `'completed'` — only reachable for a portless entity marked top
(`ghdl_implementation_plan.md` § 5.6's "batch mode"): no board ports at all
means no wrapper, no polling loop keeping the session alive, so it finishes
by itself once quiescent. A normal board design never produces
`'completed'`; its wrapper loops forever, which is correct for something
meant to keep reacting to switches until told to stop. `'completed'` gets
its own green console line ("Simulation complete.") rather than sharing
"Simulation stopped." with a user-initiated end.

Every `report`/`assert` the design's own process calls arrives as an
ordinary `LOG` line too, in both modes — real simulator output (GHDL's or
Icarus's), not summarized or filtered except by the server's flood limit
(200 lines a second, with a summary line for the rest).

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

No third-party editor dependency, consistent with the "no runtime
dependencies beyond React" rule.

## Styling

Plain CSS per component, imported by each component's own `.tsx` — no
CSS-in-JS, no Tailwind, nothing for the host to import separately.
`Workbench.css` defines one set of tokens, scoped to the `.wb` root class,
for the chrome that has no hardware reference to measure (colours, the
header/console/sidebar heights, spacing). This is a parallel structure to
`board/tokens.css`'s `.pb-ui` scope, not a reuse of it — the two token sets
serve different things (measured hardware geometry vs. ordinary UI values)
and are kept separate on purpose.

### Resizing

Every pane boundary is a divider: a 5px light gray `.wb-resizer` bar with
darker edges. The grab area reaches 4px past each side of the bar (its
`::before`), the cursor shows ↔ (`ew-resize`) on the vertical ones and ↕
(`ns-resize`) on the horizontal one, and the bar turns accent blue on hover
and for the whole of a drag (`.is-dragging`). During a drag, `.wb-is-resizing-x`
/ `-y` on `<body>` holds that cursor and blocks text selection everywhere,
and pointer capture keeps the drag on the handle, so the panes follow the
pointer continuously wherever it goes.

**The console** is resized from the horizontal divider on its top edge
(`handleConsoleResizerPointerDown`). Its height goes into `--wb-console-h`
inline on `.wb`, clamped by `applyConsoleHeight` between `CONSOLE_MIN_H` and
whatever leaves the panes above `BODY_MIN_H`; a `ResizeObserver` on `.wb`
re-applies the clamp when the window height changes.

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

Those three requested sizes — both desired widths and the console height —
are also written to `localStorage` at the end of every drag
([`paneLayout.ts`](./paneLayout.ts)) and read back as the starting values on
mount, so the app reopens with its dividers where they were left. The
desktop app always serves the page from the same origin, so this survives a
restart there; it also restores its window's size, position and maximized
state (`window-state.json` in `userData`, `winInstaller/electron/main.js`),
without which the restored pixel widths would be re-clamped to a different
window.

This is what keeps either panel from ever being pushed outside the viewport
by the other — they shrink instead, in JS, rather than relying on flexbox
to shrink a `flex: none` panel (which it won't).

Three things here are load-bearing:

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
pixels, so the width it sets has to be the width on screen. With content-box
their padding (14px and 16px a side) would sit outside that number and,
with the two 5px handles, 70px of the row would go unbudgeted — enough to
squeeze the editor to 130px against a declared `EDITOR_MIN_W` of 200. The
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
pane instead. Standalone `Board` users keep the stacking fallback.

## Known limitations

- **A backend is required.** Simulation runs server-side (`server/`), not in
  the browser — see [Using the component](#using-the-component) and
  "Install and run" in [`BUILDING.md`](../../../docs/BUILDING.md).
- **No persistence without a host bridge.** In a plain browser, files, tabs
  and console output live in React state and are lost on reload; only a host
  that provides `window.hdlboard` ([`desktop.ts`](#desktopts)) keeps the
  workspace. The backend's per-session temp directory is deleted when the
  socket closes (`ghdl_implementation_plan.md` § 7.2).
- **No configuration from the host.** `<Workbench>` takes no props: the
  starter project, the backend path (`/ghdlsim`) and the layout defaults are
  constants in its source, the port is a build-time variable, and it
  assumes it fills the viewport.
- **A clock-rate limit for board designs, not a bug.** A hardware-accurate
  50 MHz clock divider on a real `SW`/`LEDR`-style design needs millions of
  simulated cycles per visible change — impractical to run interactively
  regardless of tuning. See `ghdl_implementation_plan.md` § 5.5. This does
  *not* apply to a portless testbench (batch mode, § 5.6) — those run at
  native simulator speed, no board-clock wrapper in the way. A board design
  can sidestep it too: declare the optional `CLOCK_500Hz` port (§ 5.7/§ 3.2)
  and the testbench wires it to an already-divided, hardwired 500 Hz clock —
  genuinely sequential logic (a counter, a debouncer, a blinking LED)
  without hand-writing and then interactively simulating a 50 MHz divider.
  Not a real DE1-SoC pin, so a design using it needs its own divider
  swapped back in before it will synthesize on real hardware. Paced to
  real time (§ 5.9), so a design's `CLOCK_500Hz`-based timing predicts what
  it would look like on the board.
