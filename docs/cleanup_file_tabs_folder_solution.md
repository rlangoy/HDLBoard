# File Tabs Cleanup: the Files Panel Is the File List — Implementation Specification

> Licensed under the [GNU General Public License v2.0](../LICENSE).

| | |
|---|---|
| **Document** | `docs/cleanup_file_tabs_folder_solution.md` |
| **Version** | 1.0 |
| **Status** | Ready for implementation |
| **Changes** | `docs/impl_split_screen.md`: replaces D8 (one tab strip), D14 b (closing the partner's tab), § 4.1 (tab strip in the layout), § 4.5 (tab strip icons) and the "Close the partner's tab" rows of § 4.3. Everything else there stands. |
| **Target** | HDLBoard (`src/components/workbench/`), React 18.3 + TypeScript 5.6 + Vite 5, plain CSS |
| **Audience** | Beginners: PB1180 students writing their first VHDL or Verilog. Not an expert IDE. |

---

## Contents

1. [Summary](#1-summary)
2. [What HDLBoard has today](#2-what-hdlboard-has-today)
3. [Inputs and research](#3-inputs-and-research)
4. [Decisions](#4-decisions)
5. [User experience: look and feel](#5-user-experience-look-and-feel)
6. [Architecture and code](#6-architecture-and-code)
7. [Test plan](#7-test-plan)
8. [Implementation steps](#8-implementation-steps)
9. [Acceptance criteria](#9-acceptance-criteria)
10. [Out of scope](#10-out-of-scope)
11. [Open questions](#11-open-questions)
12. [Sources](#12-sources)

---

## 1. Summary

**The editor's tab strip goes away. The Files panel becomes the one list of files,
and the editor shows the file (or testbench/design pair) picked there.** A slim
header above the code names that file. Clicking the name opens a small, searchable
*Go to file* list, which is also how you switch files when the Explorer is hidden
(`Ctrl+P`).

This suits HDLBoard because **it has no closed files.** Every file in a project is
always loaded: the browser keeps it in memory, and the desktop app saves the
workspace 600 ms after each edit. Tabs model *open* versus *closed*, plus *saved*
versus *unsaved*, and HDLBoard has neither, so the strip is only a second,
partial, unordered copy of the Files panel. It grows by one tab for every file
opened and never shrinks unless the student tidies it by hand. Removing it means:

- every file name shows once in the Files panel and once above the code — never three times;
- no horizontal scrollbar, no hidden tabs, nothing to tidy;
- 36 px more code height in the split view, where the tab strip and the pane headers were two rows (the single view keeps its height: its header takes the strip's place);
- no "close" button that a beginner can mistake for "delete".

![Prototype: the header with the Go to file list open, and the Files panel with role icons and a problem dot](images/file_tabs_prototype_switcher.jpg)

*Prototype in the running app (DOM injected for this spec, not the final code):
single design file, Go to file open, previous file highlighted, `keyCounter7Seg.vhdl`
with an error.*

### 1.1 Core rules

These rules are normative. Where a later section seems to say otherwise, this list
wins.

| # | Rule |
|---|---|
| **F1** | **One place lists the files: the Files panel.** No tab strip, no "Open Files" list, no recent-files panel. |
| **F2** | **The editor always shows a file** while the project has one. There is no "no file open" state; only an empty project shows an empty state (§ 5.7). |
| **F3** | **Showing a file is the split's pair-change event**, unchanged: a click in Files, a pick in *Go to file*, a console link, a new file, an example or a run all call `showFile` with the event `'open'` or `'run'` (impl_split_screen.md § 4.3). |
| **F4** | **Every pane has a header**, the single design pane too. It holds Play, the file name (which opens *Go to file*), and, in the rightmost pane, the view switch. It sits on the line where the tab strip was, at the same 39 px height, so the editor's top edge still lines up with the Explorer and Board I/O title strips. |
| **F5** | **List order never changes on its own.** Files and *Go to file* list files in the same order (folder, then project order). Recency only sets which row is highlighted first; it never reorders rows. |
| **F6** | **What a tab used to show moves to the Files panel**: the role icon, the error/warning dot, and which files are shown. |
| **F7** | **Nothing a student made is lost or hidden.** No feature closes, evicts or hides a file. Delete in the Files panel is the only way a file leaves the list, and it still asks first. |

---

## 2. What HDLBoard has today

Read the named files before starting; they decide most of the design.

| Area | Today | Consequence |
|---|---|---|
| Tab strip | `EditorTabStrip.tsx`, rendered by `CodeEditor.tsx`. One tab per id in `Workbench`'s `openTabs`. Each tab carries an optional Play/Stop (`runIcon.ts`), a role icon, the name, an error/warning dot and a `×`. A `+` at the end opens New File. The strip's right end (`stripEnd`) holds the suggestion chip and the view switch. | Every one of these jobs needs a new home (§ 5). `EditorTabStrip.tsx` and `runIcon.ts` are deleted. |
| Tabs pile up | `handleOpenFile`, `showNewFile`, `revealLocation`, example opening and `useTestbenchSplit`'s `withShownTabs` (a partner joins the strip) all **add** tabs. Only the `×` removes one. | Opening the 12 examples gives 12 tabs. Measured at 1568 px wide: the strip overflows, a horizontal scrollbar appears under it, and the first tab is clipped to "7Seg.vhdl". |
| Names shown three times | The Files row, the tab and, in the split, the pane header all show the same name. | Three lists of the same thing is the clutter. |
| Split view rows | Tab strip (39 px) + pane headers (36 px) = two rows above the code. | One row is enough once the strip is gone (§ 5.3). |
| Files panel | `FileExplorer.tsx`: `vhdl/`, `verilog/`, `work/` folders; the top-file dot; a generic `FileIcon`; hover actions Download / Rename / Delete. The actions are `opacity: 0` at rest **but keep their 76 px**, so names are cut ("keyCouter2Led....") even when nothing is hovered. | The Files panel becomes the main list, so names must be readable (§ 5.5). |
| Saving | Browser: files live in `Workbench` state only. Desktop: `saveWorkspace` 600 ms after each change. `Ctrl+S` downloads the shown file. | No "unsaved" dot and no "close": neither has a meaning here. |
| Workspace | `desktop.ts` `Workspace { files, openTabs, activeTabId, topFileId, topUnit?, testbench? }`; `parseWorkspace` requires `activeTabId ∈ openTabs`. | Keep the JSON readable by older app versions (§ 6.7). |
| Shortcuts | `Ctrl+B` Explorer, `Ctrl+Alt+B` board, `Ctrl+S` download, `Alt+PageUp/PageDown` TB regions. The desktop menu uses Electron's `fileMenu`, `editMenu` and `viewMenu` roles, none of which binds `Ctrl+P`. | `Ctrl+P` is free in both builds (§ 5.4). |
| Strings | Split strings in `testbenchText.ts` (impl_split_screen.md D16). | This feature's strings go in one module too (§ 5.12). |

---

## 3. Inputs and research

### 3.1 The brainstorm

| Idea | Verdict | Why |
|---|---|---|
| Compact file switcher: only the active file visible; a searchable list when needed | **Adopted** | This is the header name plus *Go to file* (§ 5.2, § 5.4). |
| Workspace dropdown + vertical tab list | **Not adopted** | HDLBoard has one project per window and no workspaces. The folders (`vhdl/`, `verilog/`) already group files by language in the Files panel. |
| Compact workspace switcher (dropdown or segmented control) at the top | **Not adopted** | The only grouping to switch between is the language. A switch that hides the other language's files makes files disappear, and "where did my file go?" is the worst question a beginner tool can raise. Folders can already be collapsed. |
| Clean vertical list in a sidebar: full names, file-type icons, dirty indicators, pin, close | **Adopted in part.** Full names, icons and status: **yes**, in the Files panel (§ 5.5). Dirty indicator, pin, close: **no** | Nothing is ever unsaved (§ 2), so a dirty dot would always be off. Nothing is ever evicted, so pinning protects nothing. Nothing is open or closed, so there is nothing to close. |
| Hide the top tab bar completely | **Adopted** | F1. Its row becomes the pane header (F4). |
| Sidebar + breadcrumbs + Open Items panel; Recent and Pinned files; command palette; full-width editor | **Adopted:** the sidebar (Files), a palette for files only (*Go to file*) and the full-width editor. **Not adopted:** a breadcrumb trail, an Open Items panel, Recent and Pinned sections | A breadcrumb's job, "where am I", is done by the header name plus the highlighted Files row. With two levels (folder, file) a trail adds a widget and tells nothing new. An Open Items panel is a third list of the same files. Recent and Pinned are built for dozens of files; a student project usually has a handful. |
| Option A: Open Files drawer | **Adopted in spirit: the Files panel is the drawer** | In HDLBoard "open files" and "project files" are the same set, so a separate drawer would be a second copy of the Files panel. |

### 3.2 The reference image

`docs/images/UI_Example_Moderne filutforsker for HDLBoard.png` shows a
Project Files tree on the left, an editor with one file header (`top.vhdl ● ×`
plus Play and Stop), and an **Open Files** panel with a search box on the right.

| Element in the image | Here |
|---|---|
| One file header above the code, run controls on it | **Yes**: the pane header (§ 5.2). |
| "Open Files ▾" with *Search files…* | **Yes**: *Go to file*, opened from the header name (§ 5.4). |
| File icons that tell file kinds apart, the active file highlighted | **Yes**: role icons and row states in Files (§ 5.5). |
| A second, permanent Open Files panel beside the tree | **No**: it lists the same files twice (F1), and the column it takes is the Board I/O pane, which HDLBoard cannot give up. |
| `●` unsaved dot and `×` on every row | **No** (§ 3.1). |
| Colour per file (blue, purple, green, orange) | **No**: colour is kept for meaning, and HDLBoard's only file meanings are *design* and *testbench* (§ 5.5). |

### 3.3 How other tools handle many open files

| Tool | What it does | What we take |
|---|---|---|
| **VS Code** | Tabs by default. `workbench.editor.showTabs` can show a single tab or none; preview editors (italic tab) reuse one tab for single-click opens; Quick Open (`Ctrl+P`) jumps to any file by name; `Ctrl+Tab` cycles recent files; the Open Editors view lists tabs that do not fit. [VS Code UI docs] | `Ctrl+P` *Go to file*, opening on the previous file. The "no tabs" mode exists because many tabs is a known pain, even for experts. |
| **JetBrains IDEs** | A tab limit (10 by default) closes tabs when it is reached. A limit of 1 gives a single file without tabs. Pinned tabs survive the limit. [JetBrains: Editor basics] | Evidence that tabs need housekeeping rules (eviction, pins), and HDLBoard would have to explain those to beginners. We avoid the problem rather than manage it. |
| **EDA Playground** (the browser HDL tool students meet) | Two fixed panes, testbench left and design right, with a `+` per pane to add files. [EDA Playground docs] | It confirms HDLBoard's TB-left/RTL-right split. Its per-pane tabs bring back the clutter once a project grows, which is what we are removing. |
| **Arduino IDE 2** (a beginner IDE) | One tab per sketch file; all files of the sketch are always open. [Arduino forum] | Same model as HDLBoard: every file is always open, so the tabs only *list the project*, which our Files panel already does. |
| **NN/g, "Tabs, Used Right"** | "The fewer tabs, the better." An overflowing tab list becomes a carousel that hides tabs; use one row only, to keep spatial memory. [NN/g] | F5 (stable positions) and F1 (one list). |

### 3.4 Design principles for this feature

| # | Principle | Shows up as |
|---|---|---|
| P1 | **One home per job.** Files: which files exist and which is shown. Header: what you are editing and running. | F1, F4 |
| P2 | **Recognition over recall.** Everything is visible; shortcuts are only an extra. | The name button looks clickable (chevron); `Ctrl+P` is only shown as a hint. |
| P3 | **Stable positions.** Rows do not move around. | F5 |
| P4 | **Calm by default; colour means something.** Grey for the usual case, colour for the exception (a testbench, an error). | § 5.5 role-icon rule |
| P5 | **Nothing destructive looks harmless.** | No `×` next to file names. Delete stays a separate red hover action with a confirm. |
| P6 | **The code gets the space.** | One header row in every view. |

---

## 4. Decisions

| # | Decision | Why | Rejected alternatives |
|---|---|---|---|
| D1 | **Remove the tab strip entirely**: no setting to bring it back. | F1. A setting doubles the test surface and keeps the clutter as the default for whoever finds it. | "Show tabs" setting; a tab limit (JetBrains); preview tabs (VS Code). These manage clutter instead of removing it, and each needs explaining. |
| D2 | **The Files panel is the file list** and gains role icons, problem dots and a shown-partner highlight. | It already lists every file, in a stable order, grouped by language. | A separate Open Files panel or drawer (a copy); the reference image's right-hand panel (it takes the board's column). |
| D3 | **Every pane gets a header**: the single design pane gets a *plain* variant (no tint, no role badge). | One component, one place for Play and the name, the same in every view. | Name in a column-level bar above the panes. That is a second row in the split, or a duplicate of the pane headers. |
| D4 | **The header row replaces the tab-strip row**, same 39 px, so the Explorer, editor and Board I/O top strips still form one line. | The existing alignment rule in `Workbench.css` (`--wb-pane-header-h`). Checked in the prototype: header bottom and side-pane header bottom both at y = 94.99 px. | A thinner 32 px header. It breaks the line, and the saving is cosmetic. |
| D5 | **The file name is a button that opens *Go to file*.** A chevron is always visible, not only on hover. | Beginners click what looks clickable; a hover-only affordance is invisible on touchpads and to first-time users. | A separate "files" icon button (another icon to learn); a hamburger menu. |
| D6 | ***Go to file* lists every file in Files order, grouped by folder; typing filters; the first highlighted row is the previous file.** | Stable order (F5, P3), and the most common switch — back to the file you came from — is one key: `Ctrl+P`, `Enter`. VS Code's Quick Open is built on the same idea: recent files first. | A "Recent" section on top (duplicate rows, positions that move); MRU ordering (no spatial memory). |
| D7 | **`Ctrl+P` opens *Go to file*** in the focused pane's header, in both builds (`⌘P` too, as `Ctrl+B` accepts `⌘B`). | The convention from VS Code and vscode.dev (a browser app that takes `Ctrl+P` the same way). Free in the desktop menu (§ 2). Printing the page was never useful here; `Ctrl+S` already downloads the code. | `Ctrl+Tab`: browsers reserve it for their own tabs. `Ctrl+E`: no convention outside JetBrains. |
| D8 | **The view switch sits at the right end of the rightmost pane header**, with icons only while two panes show. | That is where it is today (the strip's right end). In the split, the TB and RTL badges sit right next to the same icons and label them. Prototype: at a 272 px RTL pane the name still fits. | A column-level toolbar row (an extra row); a menu-only switch (one more click for a common action). |
| D9 | **Role colour only where a testbench is involved.** In lists and the plain header the design chip is quiet grey (`#7c8aa0`, ≥ 3:1 on every row background); the testbench flask keeps its violet everywhere; teal shows only in split pane headers and badges. | Ten teal chips in a column are noise (tried in the prototype). With grey designs, the testbench reads at a glance (P4). | Teal everywhere (busy); no icon in lists (loses the testbench cue that impl_split_screen.md § 10 wanted in the Explorer). |
| D10 | **Files row actions overlay the end of the row on hover** instead of reserving 76 px. | Full names at rest; the Files panel is now the main list. | A narrower font; wrapping names (rows of uneven height jump). |
| D11 | **While a simulation runs, a pane that cannot stop it shows a disabled Play** with the reason as tooltip, rather than no Play. | The name does not jump 24 px sideways on every run, and the tooltip says why ("Stop the simulation first"), as the top-file dot does. | Hiding it (today's pane rule): layout jumps and nothing explains it. |
| D12 | **Deleting the shown file shows the previously shown file** that still exists, or else the first file in Files order. | Returning to where you were is predictable; F2. | "No file open" (contradicts F2). |
| D13 | **Closing the split is done with the view switch only.** Impl_split_screen.md D14 b (closing the partner's tab collapses the split) is gone with the tabs. | The view switch already pins TB or RTL for the pair. | — |
| D14 | **`openTabs` is removed from state**; the workspace JSON still **writes** `openTabs` (the shown file ids) and `activeTabId` for older app versions, and **ignores** `openTabs` on read. | An older desktop version can still open a newer workspace (it needs `activeTabId ∈ openTabs`). | Bumping `WORKSPACE_VERSION` (an older app would discard the whole project). |
| D15 | All new strings in **`fileSwitcherText.ts`**, English. | As testbenchText.ts (impl_split_screen.md D16). | — |

---

## 5. User experience: look and feel

### 5.1 Layout, before and after

Today, after opening the 12 examples:

```text
+----------+-+-----------------------------------------------------+-+----------+
| EXPLORER | |7Seg.vhdl x|[C]keyCounter7Seg.v x|[C]and_gate.vhdl x|..[TB|Both|RTL]| BOARD I/O|
|          | |<=================== scrollbar =====================>| |          |
|          | |[>][F TB] and_gate_tb.v      |[>][C RTL] and_gate.v  | |          |
|          | |                             |                       | |          |
```

After:

```text
+----------+-+-----------------------------------------------------+-+----------+
| EXPLORER | |[>][F TB] and_gate_tb.v v    |[>][C RTL] and_gate.v v [F][|][C]| BOARD I/O|
|          | |                             |                       | |          |
|          | |  testbench code             |  design code          | |          |
```

```text
Single design file (the beginner's usual case):
+-----------------------------------------------------------------------------+
| [>]  (c) DE1_SoC.vhdl  v                                 [F TB|[|] Both|(C) RTL] |
+-----------------------------------------------------------------------------+
| 1  library ieee;                                                            |
  [>] Play   (c) quiet chip   v chevron   [F] flask   [C] chip   [|] split icon
```

![Prototype: split view, one header row, icon-only view switch](images/file_tabs_prototype_split.jpg)

*Prototype of the split view: the tab strip is gone, each pane header carries its file
name as a switcher, and the view switch shows icons only.*

### 5.2 Pane header: plain variant (one design file, no testbench)

Shown when the view is `rtl` and the pair has no testbench, the case that today
renders the editor without a pane header (`plainDesign` in `splitPaneModels.tsx`).

Left to right:

| Part | Spec |
|---|---|
| Container | `height: var(--wb-pane-header-h)` (39 px, `box-sizing: border-box`, the 1 px bottom border included); `padding: 0 8px 0 10px`; `gap: 6px`; `background: #fff`; `border-bottom: 1px solid var(--wb-border)`. No top accent, no tint. White, not `--wb-sidebar-bg`: the header belongs to the code surface below it, as the active tab did. |
| Play | The existing `SimToggle` (24 px hit area, 16 px icon), from `paneRun` (§ 6.6). |
| Name button | `FileSwitcherButton` (§ 6.4): height 28 px; `padding: 0 6px`; `border-radius: 6px`; `border: 1px solid transparent`. Contents, `gap: 6px`: `RoleIcon` (14 px, quiet ink), the name (13 px, weight 600, `--wb-text`, ellipsis), the problem dot (7 px, as on today's tabs), a chevron (12 px, 1.6 stroke, `--wb-text-muted`). Hover: `background: var(--wb-hover)`. Open: `background: var(--wb-accent-soft)` and `border-color: var(--wb-switcher-open-edge)`. Focus-visible: `outline: 2px solid var(--wb-accent); outline-offset: 1px`. |
| Spacer | `flex: 1`. |
| Suggestion chip | `TestbenchSuggestion`, unchanged, when shown (impl_split_screen.md § 4.7). |
| View switch | `ViewSwitch`, unchanged, **with** text labels in this variant. |

The prototype screenshot (§ 1) shows exactly this.

### 5.3 Pane headers in the split

The headers of impl_split_screen.md § 4.4 stay as they are — role tint, 3 px accent,
Play, role badge (a menu), region navigator — with four changes:

1. **Height** becomes `var(--wb-pane-header-h)` (3 px accent + 35 px + 1 px border), up
   from 36 px, so it takes the tab strip's line (D4).
2. **The file name becomes the `FileSwitcherButton`** (§ 5.2, without the role icon: the
   badge beside it already shows the role).
3. **The rightmost shown pane's header ends with the view switch** (and the chip, which
   is only shown while the split is closed). `margin-left: auto` pushes it to the right.
   While two panes show, the switch shows **icons only**: the labels stay in the DOM as
   `.wb-sr-only` text, and `title` keeps the full tooltip.
4. **Compact rules**, by container query on each pane (`container-type: inline-size` on
   `.wb-split__pane`):

| Pane width | Change |
|---|---|
| < 360 px | Region navigator hides its label ("clock generator"); `‹ 1/2 ›` stays. |
| < 280 px | Role badge shows its icon only (label as `.wb-sr-only`); the badge stays a menu button. |
| always | The name ellipsizes; its full text is in `title` and in *Go to file*. |

At the narrowest split (200 px per pane, `SPLIT_PANE_MIN_W`) a name gets about 40
px. That is accepted: the column is that narrow only after a deliberate drag, and
the full name is one click away. At a typical 1280 px laptop width the RTL pane is
about 272 px. The prototype shows "and_gate.v" in full there, beside the icon-only
switch.

### 5.4 *Go to file*

```text
  [>] (c) DE1_SoC.vhdl v                <- name button, "open" state
     +--------------------------------------+
     | (Q) Go to file...             Ctrl+P |   search row, 40 px
     +--------------------------------------+
     | [folder] VHDL/                       |   group label, as in Files
     | v (c) DE1_SoC.vhdl                   |   v = shown now
     |   (c) blinkTest.vhdl                 |
     |   (c) keyCounter7Seg.vhdl  *         |   * = problem dot
     |   [F] and_gate_tb.vhd                |   flask, violet
     | [folder] VERILOG/                    |
     |   (c) DE1_SoC.v                      |
     |  [F] and_gate_tb.v       <highlight> |   previous file: highlighted on open
     +--------------------------------------+
     |  +  New file...                      |   footer
     +--------------------------------------+
```

**Anatomy and measurements**

| Part | Spec |
|---|---|
| Panel | `position: absolute` inside `.wb-editor`; top = the name button's bottom + 4 px; left = the name button's left. Width `var(--wb-switcher-w)` (320 px), clamped so the right edge stays 8 px inside the editor column; below 336 px of column, column − 16 px (min 240 px). `background: #fff`; `border: 1px solid var(--wb-border)`; `border-radius: 10px`; `box-shadow: var(--wb-switcher-shadow)`; `z-index` above the split divider, below dialogs. |
| Search row | 40 px; `padding: 0 10px 0 12px`; `SearchIcon` 14 px muted; `<input>` 13 px, no border, placeholder *Go to file…*; at the right, a key hint pill: 11 px, `--wb-text-muted`, 1 px `--wb-border` border, radius 4 px, `--wb-sidebar-bg` fill, text `Ctrl+P`, the same text on every platform, as `PANE_SHORTCUT` shows `Ctrl+B`. 1 px bottom border. |
| List | `ScrollArea` (the overlay scrollbar used in Files); `max-height: min(420px, 60vh)`; `padding: 4px 0`; `role="listbox"`. |
| Group label | 26 px; `padding: 0 12px`; folder icon + folder name in the **same style as the Files panel's folder label** (uppercase, 11 px, 600, muted), so both lists look like one family. Not focusable, `role="presentation"`; the rows carry the folder in their accessible name. |
| Row | 30 px; `margin: 0 4px; padding: 0 8px; border-radius: 6px; gap: 8px`. Check column 12 px (`✓` in `--wb-accent-dark` on each shown file), `RoleIcon` 14 px, the name 13 px (shown file: weight 600) with each matched part in `<mark>` drawn as weight 700 on no background, then the problem dot. Hover: `--wb-hover`. Highlighted (active descendant): `background: var(--wb-accent-soft); color: var(--wb-accent-dark)`. |
| Footer | 1 px top border, 4 px padding; one row, `+` *New file…*, muted text. It replaces the tab strip's `+`. |
| No match | One muted line, 13 px, centred, 16 px padding: *No file matches "abc"*. The footer stays. |

**Behaviour**

| Action | Result |
|---|---|
| Click the name button, or `Enter` / `Space` / `↓` on it | Opens; focus goes to the search input; the previous file is highlighted (D6). With no previous file, the shown file is. |
| `Ctrl+P` (or `⌘P`) anywhere in the workbench (not while a dialog is open) | Opens in the **focused** pane's header; `preventDefault` stops the browser's print dialog. Pressed again while open: closes it. |
| Type | Filters on every whitespace-separated word, case-insensitive, matched against `folder/name` (the same rule as `filterExamples`, so `verilog and` finds `verilog/and_gate.v`). Rows keep their order (F5); the first match is highlighted. |
| `↑` / `↓` | Move the highlight; stop at the ends (no wrap). `PageUp` / `PageDown` move 8 rows. |
| `Enter` or a click on a row | `showFile(id, 'open')` (F3), the panel closes, and focus goes to the code of the pane that shows the file. Picking a file already shown only closes the panel and focuses that pane. |
| `Enter` or a click on *New file…* | Closes the panel and opens `NewFileDialog`, exactly as Files' *New File*. |
| `Esc` | Closes; focus returns to where it was before opening (the code, if opened by `Ctrl+P`). |
| `Tab`, or a click outside | Closes; focus is not moved (`usePopover`'s outside-click rule). |

**Motion**: on open, opacity 0 → 1 and `translateY(-4px)` → 0 over 120 ms ease-out;
no animation on close. Under `prefers-reduced-motion: reduce`, no animation.

### 5.5 The Files panel

| Change | Spec |
|---|---|
| Role icon | `RoleIcon` in place of `FileIcon`, 14 px. Design chip in `--wb-role-quiet-ink` (D9); testbench / mixed flask in `--wb-role-tb-ink`; a file with no units yet keeps the plain `FileIcon`. On the active row the chip takes `--wb-accent-dark`, matching the row text. |
| Problem dot | After the name, the dot today's tab had (7 px, `--wb-diag-error` / `--wb-diag-warning`), with the same `.wb-sr-only` text (", 2 errors"). |
| Row states | `is-active` (unchanged): the file in the focused pane. **New `is-shown`**: the file in the other split pane, `background: color-mix(in srgb, var(--wb-accent-soft) 45%, transparent)`, normal weight. The mix matches the unfocused pane header rule in `SplitEditor.css`, so "shown but not focused" looks the same in both places. |
| Full names | `.wb-files__row-actions` becomes `position: absolute; right: 0; inset-block: 0` and shows only on `:hover` / `:focus-within`, over a `linear-gradient(to right, transparent, var(--row-bg) 16px)` fade in the row's own background (`--row-bg`: `#fff`, `--wb-hover` or `--wb-accent-soft`). At rest the name has the whole row. The row's `title` is the full name. |
| Keeping the shown file in sight | When the shown file changes and its row is in an expanded folder, the row is scrolled into view (`block: 'nearest'`). A collapsed folder stays collapsed: the student closed it. |

Everything else in Files is unchanged: the top dot, double-click to rename, Upload,
New File, Download All, Examples, drop to upload.

### 5.6 What happens when

| Event | Today | After |
|---|---|---|
| Click a file in Files | Tab added if missing; file shown | File shown (F3); nothing is added anywhere |
| Pick in *Go to file* | — | File shown (F3) |
| New File / Create testbench | New tab, shown | File shown (in the TB pane for a testbench, impl_split_screen.md § 4.6) |
| Upload / drop | A tab per file | The last added file is shown |
| Open an example | Tabs per copied file | Its first file is shown and becomes top (unchanged) |
| Console link, first compile error | Tab added; line revealed | File shown; line revealed |
| Start / Play | Pair arranged; partner tab added | Pair arranged |
| Delete the shown file | Next tab, else "No file open" | D12 |
| Delete the other split pane's file | Tab closed; next pair-change | Pair re-resolved at once (`useFollowActiveFile`'s stale-pair path, unchanged) |
| Rename the shown file | Tab text changes | Header and *Go to file* text change |
| `×` on a tab | Hides the file from the strip | — (no such control) |
| Last file deleted | "No file open" | Empty project state (§ 5.7) |

### 5.7 Empty project

Shown only when the project has no files (F2). It replaces `NoFileOpen`.

```text
                 (c)  No files yet

        Start from an example, or make your own.

   [ Examples ]     [ New file ]     [ Upload ]
```

The title is 14 px/600, the line 13 px muted, and the buttons use Files' button
styles: the same three actions, so the empty state teaches where they live. No pane
header shows. A file drop still works (it already works on the whole editor).

### 5.8 Accessibility

- **Name button**: `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls` = the
  listbox id while open; accessible name *"DE1_SoC.vhdl, go to file"*; `title`
  *"Go to file (Ctrl+P)"*.
- **Panel**: the WAI-ARIA combobox pattern with a listbox popup. The input has
  `role="combobox"`, `aria-expanded="true"`, `aria-controls`,
  `aria-activedescendant` = the highlighted row, and `aria-label` *"Go to file"*.
  Rows have `role="option"` and `aria-selected` on the highlighted one; the accessible
  name is *"and_gate_tb.v, verilog folder, testbench, 2 errors, shown"* (whichever
  parts apply). A polite live region says *"4 files"* after a filter changes the count.
- **Files rows** keep `role="treeitem"`; `aria-current="true"` marks each shown file.
- **Focus**: the panel never traps focus (`Tab` closes it); `Esc` returns focus (§ 5.4).
- **Disabled Play** (D11) uses `aria-disabled` rather than `disabled`, so it can still
  take focus and say why.
- **Contrast**: the quiet chip is ≥ 3:1 on white, hover and active rows (3.50, 3.11,
  3.02; WCAG 1.4.11 non-text); the row text keeps its current ≥ 4.5:1.
- **Colour is never the only cue**: the shown file has `✓` plus weight; a testbench has
  the flask shape; a problem has the dot plus screen-reader text.

### 5.9 Visual tokens

Added to `Workbench.css` next to the role tokens:

```css
/* Design-file chip in lists and the plain header (docs/cleanup_file_tabs_folder_solution.md D9):
   quiet, so a testbench's violet flask stands out. >= 3:1 on #fff, --wb-hover, --wb-accent-soft. */
--wb-role-quiet-ink: #7c8aa0;
/* Go to file (§ 5.4). */
--wb-switcher-w: 320px;
--wb-switcher-shadow: 0 12px 32px rgba(15, 23, 42, 0.16), 0 2px 6px rgba(15, 23, 42, 0.08);
--wb-switcher-open-edge: #c7d7f7;
```

No new icons: `SearchIcon`, `ChipIcon`, `FlaskIcon` and `FileIcon` exist. The
chevron is a new `ChevronDownIcon` in `icons.tsx` (16×16 viewBox,
`stroke="currentColor"`, `strokeWidth="1.6"`, round caps: path `M4 6l4 4 4-4`), in
the existing icons' stroke style.

### 5.10 Text

All in `fileSwitcherText.ts` (D15):

| Key | Text |
|---|---|
| `goToFile` | Go to file |
| `goToFilePlaceholder` | Go to file… |
| `goToFileTitle(shortcut)` | Go to file (Ctrl+P) |
| `nameButtonLabel(name)` | `${name}, go to file` |
| `noMatch(query)` | No file matches "${query}" |
| `fileCount(n)` | 1 file / `${n}` files |
| `newFile` | New file… |
| `shownNow` | shown |
| `stopFirst` | Stop the simulation first |
| `emptyTitle` | No files yet |
| `emptyHint` | Start from an example, or make your own. |

---

## 6. Architecture and code

### 6.1 Module map

New, **pure** (no React):

| File | Responsibility |
|---|---|
| `workbench/fileSwitcher.ts` | `switcherRows`, `matchRanges`, `initialHighlight`, `moveHighlight` (§ 6.3) |
| `workbench/fileSwitcherText.ts` | Strings (§ 5.10) |
| `workbench/paneRunControl.ts` | `paneRunFor` (§ 6.6), replacing `runIcon.ts` |

New, **React**:

| File | Responsibility |
|---|---|
| `FileSwitcher.tsx` | `FileSwitcherButton` + the panel (combobox/listbox) |
| `FileSwitcher.css` | § 5.2 button, § 5.4 panel |
| `EmptyProject.tsx` | § 5.7 |

Changed: `EditorPaneHeader.tsx` (`variant`, name button, `end` slot), `SplitEditor.tsx`
(passes `end` to the rightmost pane; container queries in `SplitEditor.css`),
`splitPaneModels.tsx` (no `plainDesign` bypass, no `tabIcon` / `visibleTabId` /
`stripEnd`), `useTestbenchSplit.tsx` (no `setOpenTabs`, `withShownTabs`, `onTabClosing`;
exposes `shownFileIds` and `previousFileId`), `CodeEditor.tsx` (drop zone + `SplitEditor`
or `EmptyProject`), `FileExplorer.tsx` / `.css` (§ 5.5), `Workbench.tsx` (§ 6.2),
`SimToggle.tsx` (`disabledReason` → `title`), `desktop.ts` (§ 6.7), `fileKinds.ts`
(`FOLDER_ORDER`, `filesInFolderOrder`, moved from `FileExplorer`), `files.ts` and the
`index.ts` barrel (`DEFAULT_OPEN_TABS` → `DEFAULT_SHOWN_FILE`), the workbench `README.md`, `icons.tsx`
(`ChevronDownIcon`), `Workbench.css` (tokens), `CodeEditor.css` (tab rules removed).

Deleted: `EditorTabStrip.tsx`, `runIcon.ts`, `runIcon.test.ts` (its cases move to
`paneRunControl.test.ts`), the `.wb-editor__tab*` and `.wb-editor__tabbar*` CSS.

### 6.2 Workbench state

```ts
// Before
const [openTabs, setOpenTabs] = useState<string[]>(DEFAULT_OPEN_TABS);
const [activeTabId, setActiveTabId] = useState<string | null>(DEFAULT_OPEN_TABS[0] ?? null);

// After
/** The file in the focused pane: the Files highlight, Ctrl+S, the pair anchor. */
const [activeFileId, setActiveFileId] = useState<string | null>(DEFAULT_SHOWN_FILE);
```

- `openTabs`, `handleCloseTab`, `onCloseTab`, `onAddTab`, `tabs`, `tabRun` and
  `runIconFor` go. `DEFAULT_OPEN_TABS` in `files.ts` becomes `DEFAULT_SHOWN_FILE`.
- `activeTabId` is renamed `activeFileId` throughout (a pure rename, its own commit).
- `handleDeleteFile` picks the next shown file (D12):
  `tb.previousFileId(id) ?? filesInFolderOrder(remaining)[0]?.id ?? null`.
- `revealLocation`, `handleOpenFile`, `showNewFile`: only `setActiveFileId` / `tb.showFile`;
  no tab list to update.
- The **MRU** stays where it is (`recentFileIds` in `useTestbenchSplit`, session only).
  `previousFileId(excluding?)` returns its first entry that exists, is not shown now and
  is not `excluding`.
- `Ctrl+P`: a window `keydown` listener next to `Ctrl+S`'s, using the same ref pattern.
  It sets `goToFileRequest = { pane: focusedPane, id: next }`, a request with an id, as
  `RevealRequest` is: the pane header whose pane matches opens its panel when the id
  changes. While `dialog !== null`, it does nothing (the browser default is still
  prevented).

### 6.3 `fileSwitcher.ts`

```ts
export interface SwitcherRow {
  readonly fileId: string;
  readonly name: string;
  readonly folder: Folder;
  /** Character ranges of `name` that match the query, for <mark>. */
  readonly matches: readonly (readonly [start: number, end: number])[];
}

export interface SwitcherGroup {
  readonly folder: Folder;
  readonly rows: readonly SwitcherRow[];
}

/** Files in Files order (FOLDER_ORDER, then project order), filtered by every word of `query` against `folder/name`. */
export function switcherGroups(files: readonly VhdlFile[], query: string): readonly SwitcherGroup[];

/** Where each word first occurs in `name`, merged and sorted; words found only in the folder mark nothing. */
export function matchRanges(name: string, query: string): SwitcherRow['matches'];

/**
 * The row highlighted when the list opens or the query changes: with an empty query, the
 * previous file if listed, else the shown file, else the first row; with a query, the first row.
 */
export function initialHighlight(
  rows: readonly SwitcherRow[], query: string, previousId: string | null, shownId: string | null,
): string | null;

/** Arrow / Page keys: the next highlighted id, clamped to the list (no wrap). */
export function moveHighlight(rows: readonly SwitcherRow[], currentId: string | null, key: string): string | null;
```

`switcherGroups` and `FileExplorer` both read `filesInFolderOrder` from `fileKinds.ts`,
so the two lists can never disagree on order (F5).

### 6.4 `FileSwitcher.tsx`

```ts
export interface FileSwitcherButtonProps {
  readonly fileName: string;
  /** Plain header only: the role icon before the name. */
  readonly role?: FileRole | undefined;
  readonly problems: readonly LineDiagnostic[];
  readonly files: readonly VhdlFile[];
  readonly shownIds: readonly string[];
  readonly previousId: string | null;
  readonly roleOf: (fileId: string) => FileRole | undefined;
  readonly problemsOf: (fileId: string) => readonly LineDiagnostic[];
  readonly onPick: (fileId: string) => void;
  readonly onNewFile: () => void;
  /** Ctrl+P: opens the panel when its id changes. */
  readonly openRequest: { readonly id: number } | null;
}
```

- State: `open`, `query`, `highlightId` (React). The anchor and outside-click/`Esc`
  handling come from `usePopover` (`RoleIcon.tsx`); the restore-focus target is stored
  on open.
- The panel renders inside `.wb-editor` (the positioned ancestor), not in a portal, so
  it scrolls and clips with the editor like the role badge menu does.
- Rows are `<div role="option" id=…>` with `onPointerDown` + `preventDefault` (the
  input keeps focus), then `onClick` picks.
- No function over 40 lines (Clean Code, as in the rest of the folder): the panel, the
  row and the key handler are separate.

### 6.5 Pane header and split

```ts
export interface EditorPaneHeaderProps {
  // existing …
  /** 'plain': one design file, no testbench — no tint, no badge (§ 5.2). */
  variant: 'role' | 'plain';
  switcher: Omit<FileSwitcherButtonProps, 'fileName'>;
  /** Right end: chip and view switch, in the rightmost shown pane only (D8). */
  end?: ReactNode;
}
```

- `editorPropsFor` always returns `split`; the `plainDesign` case becomes
  `variant: 'plain'` on the RTL pane.
- `SplitEditor` hands `end` to the pane it renders last (`rtl` unless the shown view is `tb`).
- `ViewSwitch` gets `compact: boolean` (`true` while two panes show): labels become
  `.wb-sr-only`.

### 6.6 Run controls

`runIconFor` (one tab with Play or Stop) is replaced by one pure rule per pane,
moved out of `Workbench.paneRun`:

```ts
/** A pane's Play / Stop (impl_split_screen.md B5; D11 here). */
export function paneRunFor(input: {
  readonly status: SimStatus;
  readonly runFileId: string | null;
  readonly runUnitName: string | null;
  readonly target: PaneTarget;
  readonly folder: Folder;
  readonly pane: PaneRole;
}): { readonly kind: 'play' | 'stop'; readonly disabled: boolean; readonly disabledReason?: string } | null;
// stopped: play when hasTopDot(folder) || pane === 'tb', else null.
// running this pane's unit: stop (disabled while compiling).
// running something else: play, disabled, disabledReason = TEXT.stopFirst — only where play would be offered when stopped.
```

A one-unit design file's Play in the plain header runs exactly what the tab's Play
ran: `checkAndRun(fileId, null, unit, 'rtl')`, so `RUN` is byte-identical
(impl_split_screen.md AC-6, B7).

### 6.7 Persistence

| Field | Write | Read |
|---|---|---|
| `activeTabId` | `activeFileId` (the name stays, for older versions) | Kept if the file exists, else the first file in Files order |
| `openTabs` | The shown file ids, `activeFileId` first | **Ignored** |
| everything else | unchanged | unchanged |

`WORKSPACE_VERSION` stays 1 (D14). `parseWorkspace` drops the `activeTabId ∈
openTabs` requirement. The browser build stores nothing, as before.

### 6.8 Changes to `docs/impl_split_screen.md`

Mark these, each with one line pointing here: B5 (other panes now show a disabled Play during a run, D11 here), D8 (one tab strip → no tab strip),
D14 b (gone, D13 here), § 4.1 diagram and bullets (tab strip, `is-visible` tab →
Files `is-shown`), § 4.3 "Close the partner's tab" and "Close the anchor's tab"
rows, § 4.5 (tab strip icons → Files and *Go to file* icons), AC-15. Update
`tests/e2e/split-screen.md` steps 1, 4 and 7, which mention tabs.

---

## 7. Test plan

### 7.1 Unit tests

| File | Covers |
|---|---|
| `fileSwitcher.test.ts` | Order equals Files order across `vhdl/`, `verilog/`, `work/`; filtering on name and folder, several words, case; `matchRanges` merging and folder-only matches; `initialHighlight` (previous present, previous filtered out, no previous, query typed); `moveHighlight` clamping and Page keys. |
| `paneRunControl.test.ts` | Every `runIcon.test.ts` case, restated per pane; D11 (disabled Play with reason); `work/` file in the RTL pane gets none; the TB pane always gets Play when stopped. |
| `fileKinds.test.ts` | `filesInFolderOrder`. |
| `desktop.test.ts` | `openTabs` written as the shown ids; `openTabs` ignored on read; an `activeTabId` not in `openTabs` accepted; an unknown `activeTabId` falls back to the first file in Files order. |
| `splitModel` / `editorView` tests | Unchanged; they must stay green. |

### 7.2 End-to-end script

`tests/e2e/file-switching.md`, in the format of `tests/e2e/split-screen.md`:

1. Fresh start: one header row over `DE1_SoC.vhdl`, no tab strip; the header's bottom
   edge lines up with the Explorer and Board I/O title strips.
2. Open all 12 examples: no horizontal scrollbar anywhere; the Files panel shows every
   name in full at the default sidebar width; testbenches show a violet flask and
   designs a grey chip.
3. Click `and_gate_tb.v`: the split opens in **one** header row; Files highlights
   `and_gate_tb.v` (active) and `and_gate.v` (shown).
4. `Ctrl+P`: the list opens in the focused pane, `DE1_SoC.vhdl` (the previous file) is
   highlighted; `Enter` shows it. `Ctrl+P`, `Enter` again goes back.
5. `Ctrl+P`, type `verilog and`: only the Verilog AND files remain, matches in bold;
   `↓`, `Enter` shows the testbench; `Esc` on a second open puts the caret back in the code.
6. Introduce an error and Start: the dot appears in Files and in *Go to file*; the
   console link opens the file at the line.
7. While running, switch to another design: its Play is greyed out with "Stop the
   simulation first"; the name does not move.
8. Hide the Explorer (`Ctrl+B`): switch files with the header name alone.
9. Delete the shown file: the previously shown file comes back. Delete all files:
   *No files yet* with Examples / New file / Upload, and each works.
10. Narrow the split to its minimum: icon-only switch, icon-only badge, ellipsized name;
    nothing overflows the header.
11. Keyboard and screen reader pass over the name button, the list and the Files rows (§ 5.8).
12. Desktop: restart keeps the shown file; an older installed version opens the saved
    workspace on the same file.

---

## 8. Implementation steps

Each step ends with `npm run typecheck` and `npm test` clean, and the app working.

| Step | Work | Done when |
|---|---|---|
| **T1** | Pure modules: `fileSwitcher.ts`, `paneRunControl.ts` (+ tests), `filesInFolderOrder` in `fileKinds.ts`; `fileSwitcherText.ts`. | § 7.1 green except `desktop.test.ts`. |
| **T2** | Files panel (§ 5.5): role icons, problem dots, `is-shown`, overlay actions, full-name `title`, scroll-into-view. No tab change yet. | Names in full at rest; the strip still works. |
| **T3** | Rename `activeTabId` → `activeFileId` (no behaviour change, its own commit). | Diff is the rename only. |
| **T4** | Headers: `EditorPaneHeader` `variant` and `end`; `editorPropsFor` without the plain bypass; `SplitEditor` `end`; `ViewSwitch` `compact`; `paneRunFor` wired; container queries; the 39 px height. Remove `EditorTabStrip` and the strip CSS. The name is plain text for now. | Every view has one header row; Play/Stop behave per § 6.6; AC-6 of the split spec still holds. |
| **T5** | `FileSwitcher` (button + panel), `Ctrl+P`, `ChevronDownIcon`, tokens, motion. | e2e steps 4, 5, 8, 11. |
| **T6** | Workbench cleanup: remove `openTabs` and its handlers, `withShownTabs`, `onTabClosing`; D12 delete rule; `EmptyProject`; `desktop.ts` (§ 6.7) + tests. | § 7.1 green; e2e step 9, 12. |
| **T7** | Docs: impl_split_screen.md (§ 6.8), `tests/e2e/split-screen.md`, the new e2e script, README (*A small IDE*: "tabbed editor" → "file switcher"), `Design_Description.md` § 9 (*Tabbed code editor*), `changelog.txt`, a fresh `docs/images/workbench.png`. | The whole e2e script passes. |

---

## 9. Acceptance criteria

- **AC-1** No tab strip renders in any view. No control in the app closes a file
  without deleting it.
- **AC-2** With 12 or more files, no horizontal scrollbar appears in the editor
  column, and the Files panel shows every name in full at the default width.
- **AC-3** Single design view: one 39 px header with Play, role icon, name, chevron and
  view switch. Split view: one header row (no second row above it). In both, the header
  bottom aligns with the side pane title strips (±0.5 px).
- **AC-4** *Go to file* lists every file in Files order, grouped by folder; filtering
  follows § 5.4; rows never reorder; the previous file is highlighted on open.
- **AC-5** `Ctrl+P` (or `⌘P`) opens it in the focused pane in the browser and the desktop
  build and never opens the print dialog; it does nothing while a dialog is open.
- **AC-6** Every way of showing a file (§ 5.6) goes through `showFile`; split
  behaviour (impl_split_screen.md B1–B7) is unchanged apart from D13.
- **AC-7** The Files panel shows the role icon (D9), the problem dot and the `is-active`
  / `is-shown` states; actions appear on hover/focus without shifting the name.
- **AC-8** A one-unit design's Play sends a `RUN` byte-identical to before (spy test, as
  the split spec's AC-6).
- **AC-9** While a run goes, every other pane that would offer Play shows it disabled with
  *Stop the simulation first*; nothing in the header shifts when a run starts or stops.
- **AC-10** Deleting the shown file shows the previously shown file; deleting the last file
  shows *No files yet* with three working buttons.
- **AC-11** The workspace written by this version opens in the previous version on the
  same file; a workspace from the previous version opens here on its active file.
- **AC-12** § 5.8 holds: combobox/listbox roles, active descendant, live count, focus
  return, contrast values.
- **AC-13** `npm run typecheck` clean; no new runtime dependency; plain CSS; the pure
  modules import nothing from React; no function over 40 lines; docs updated (T7).

---

## 10. Out of scope

- Reordering files by drag in the Files panel (the order is project order).
- Folders a student creates; the folders stay `vhdl/`, `verilog/`, `work/`.
- Symbol search (`@entity`) in *Go to file*.
- A back/forward history (`Alt+←`): `Ctrl+P`, `Enter` covers going back one step.
- The Explorer's own `Ctrl+B` toggle and the Simulation card are unchanged.

---

## 11. Open questions

| # | Question | Default until decided |
|---|---|---|
| Q1 | Should the view switch hide on a plain design file? Beginners rarely need it there, but it is how *Create testbench* (the TB empty state) is found. | Keep it (unchanged from today). |
| Q2 | The Files panel grows long once all examples are opened. Collapse the folder of the language that is not the top file's? | No: F7 and P3 (nothing hides by itself). |
| Q3 | Show shortcut hints as `⌘P` / `⌘B` on macOS? Today every hint says `Ctrl+…`. | `Ctrl+P` everywhere, matching `PANE_SHORTCUT`; change all hints together if ever. |

---

## 12. Sources

- [VS Code: User interface](https://code.visualstudio.com/docs/getstarted/userinterface) — `workbench.editor.showTabs`, preview editors, Open Editors, Quick Open (`Ctrl+P`), `Ctrl+Tab`, breadcrumbs.
- [JetBrains IntelliJ IDEA: Editor basics](https://www.jetbrains.com/help/idea/using-code-editor.html) — editor tab limit and closing policy, pinned tabs, the Switcher.
- [EDA Playground documentation: FAQ](https://eda-playground.readthedocs.io/en/latest/faq.html) and [Quick Start](https://github.com/edaplayground/eda-playground/wiki/Quick-Start) — testbench left, design right, `+` per pane.
- [Arduino Forum: Using tabs in IDE 2](https://forum.arduino.cc/t/using-tabs-in-ide2/1152560) — one tab per sketch file, every file always open.
- [NN/g: Tabs, Used Right](https://www.nngroup.com/articles/tabs-used-right/) — overflow hides tabs; one row; "The fewer tabs, the better."
- [WAI-ARIA APG: Combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) — the *Go to file* input and listbox.
- `docs/images/UI_Example_Moderne filutforsker for HDLBoard.png` — the reference image (§ 3.2).
- Prototype screenshots `docs/images/file_tabs_prototype_switcher.jpg` and `file_tabs_prototype_split.jpg`, taken on 2026-10-05 in the running app with the DOM changed by hand.
