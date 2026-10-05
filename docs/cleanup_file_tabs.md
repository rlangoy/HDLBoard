# File Tabs Cleanup — Implementation Specification

> Licensed under the [GNU General Public License v2.0](../LICENSE).

| | |
|---|---|
| **Document** | `docs/cleanup_file_tabs.md` (was `cleanup_file_tabs_folder_solution.md`) |
| **Version** | 1.1 |
| **Status** | Ready for implementation on branch `cleanup_filetabs`; merging to `main` waits for the usability check (§ 7.3) |
| **Changes in 1.1** | After review (§ 3.5): F1 separates the persistent file list from a temporary picker; F8 keeps the shown file and the top file apart; the name is the header's main element, with Play set apart from it; one "shown" row state instead of two; problem marks that differ by shape; precise rules for "previous file", deletion, `Ctrl+P` and narrow panes; a state table and an error-handling section; a new workspace field `activeFileId` instead of rewriting `openTabs`; smaller steps; a usability check before merge; normative parts marked apart from engineering notes. |
| **Changes elsewhere** | `docs/impl_split_screen.md`: replaces D8 (one tab strip), D14 b (closing the partner's tab), § 4.1 (tab strip in the layout), § 4.5 (tab strip icons) and the tab-closing rows of § 4.3 (§ 6.8). |
| **Target** | HDLBoard (`src/components/workbench/`), React 18.3 + TypeScript 5.6 + Vite 5, plain CSS |
| **Audience** | Beginners: PB1180 students writing their first VHDL or Verilog. Not an expert IDE. |

### How to read this spec

| Kind | Where | Binding? |
|---|---|---|
| **Rules and behaviour** | § 1.1, the behaviour tables in § 5, the state table § 5.7, error handling § 5.8, the workspace contract § 6.7, acceptance § 9 | Normative. A change needs a new version of this spec. |
| **Design targets** | Sizes, colours, shadows, motion in § 5 | Tune freely during implementation, as long as the invariants in § 9 still hold: one aligned 39 px header row, the stated contrast, no overflow, no layout shift. |
| **Engineering notes** | § 6 (module, component, prop and CSS names), § 8 (steps) | Guidance. Names may change; what they do may not. |

---

## Contents

1. [Summary](#1-summary)
2. [What HDLBoard has today](#2-what-hdlboard-has-today)
3. [Inputs and research](#3-inputs-and-research)
4. [Decisions](#4-decisions)
5. [User experience](#5-user-experience)
6. [Engineering notes](#6-engineering-notes)
7. [Test plan](#7-test-plan)
8. [Implementation steps](#8-implementation-steps)
9. [Acceptance criteria](#9-acceptance-criteria)
10. [Out of scope](#10-out-of-scope)
11. [Open questions](#11-open-questions)
12. [Sources](#12-sources)

---

## 1. Summary

**The editor's tab strip goes away. The Files panel is the file list, and the
editor shows the file (or testbench/design pair) picked there.** A slim header
above the code names that file. Clicking the name opens a small, searchable
*Go to file* picker, which is also how you switch files when the Explorer is hidden
(`Ctrl+P`).

This suits HDLBoard because **it has no closed files.** Every file in a project is
always loaded: the browser keeps it in memory, and the desktop app saves the
workspace 600 ms after each edit. Tabs model *open* versus *closed*, plus *saved*
versus *unsaved*, and HDLBoard has neither, so the strip is a second, partial,
unordered copy of the Files panel. It grows by one tab for every file opened and
never shrinks unless the student tidies it by hand. Removing it means:

- a file's name shows in the Files panel and in the header of each pane showing it — never in a third place;
- no horizontal scrollbar, no hidden tabs, nothing to tidy;
- 36 px more code height in the split view, where the tab strip and the pane headers were two rows (the single view keeps its height: its header takes the strip's place);
- no "close" button that a beginner can mistake for "delete".

![Prototype: the header with Go to file open, and the Files panel with role icons and a problem dot](images/file_tabs_prototype_switcher.jpg)

*Prototype in the running app, made by changing the page's DOM by hand for this spec.
It is not the final code, and every visual target is re-checked in the real build
(§ 7.2). It shows a single design file, Go to file open on the previous file, and an
error in `keyCounter7Seg.vhdl`. Since 1.1, the name is set apart from Play (§ 5.2),
and warnings are rings rather than dots (§ 5.5).*

### 1.1 Core rules

| # | Rule |
|---|---|
| **F1** | **The Files panel is the only persistent file list.** There is no tab strip, no "Open Files" list and no recent-files panel. A temporary picker that opens on demand and closes after use, such as *Go to file*, is allowed. |
| **F2** | **The editor always shows a file** while the project has one. Only an empty project shows an empty state (§ 5.6). |
| **F3** | **Showing a file is the split's pair-change event**, unchanged. A click in Files, a pick in *Go to file*, a console link, a new file, an example and a run all go through `showFile` (impl_split_screen.md § 4.3). |
| **F4** | **Every pane has a header**, the single design pane too, on the line where the tab strip was (39 px, aligned with the Explorer and Board I/O title strips). **The file name is its main element**; Play is set apart from it (§ 5.2). The rightmost pane's header also holds the view switch. |
| **F5** | **List order never changes on its own.** Files and *Go to file* list files in the same order (folder, then project order). Recency only decides which row is highlighted first. |
| **F6** | **What a tab used to show moves to the Files panel**: the role icon, the problem mark, and which files are shown. |
| **F7** | **Nothing a student made is lost or hidden.** No feature closes, evicts or hides a file. Delete in the Files panel is the only way a file leaves the list, and it still asks first. |
| **F8** | **Showing a file never changes the top file** (the blue dot, *Top:* on the Simulation card). Only these change it, each an explicit act: a click on a file's dot; Start or Play (a run makes its file top, as today); opening an example (as today since 1.3.0); deleting the top file (impl_split_screen.md, unchanged). |

---

## 2. What HDLBoard has today

| Area | Today | Consequence |
|---|---|---|
| Tab strip | `EditorTabStrip.tsx` in `CodeEditor.tsx`: one tab per id in `Workbench`'s `openTabs`, each with an optional Play/Stop (`runIcon.ts`), a role icon, the name, an error/warning dot and a `×`; a `+` for New File; the suggestion chip and view switch at its right end. | Each of these jobs needs a new home (§ 5). |
| Tabs pile up | Opening from Files, a new file, a console link, an example, and a split partner all **add** tabs; only `×` removes one. | 12 examples give 12 tabs. At 1568 px wide the strip overflows, a scrollbar appears under it, and the first tab is clipped to "7Seg.vhdl". |
| Names shown three times | The Files row, the tab and, in the split, the pane header. | This duplication is the clutter. |
| Split view rows | Tab strip (39 px) + pane headers (36 px). | One row is enough without the strip. |
| Files panel | `vhdl/`, `verilog/`, `work/`; the top dot; a generic file icon; hover actions that are invisible at rest **but keep their 76 px**, so names are cut ("keyCouter2Led....") even when nothing is hovered. | The Files panel becomes the main list, so names must be readable. |
| Names | `fileNameRules.ts` refuses a name the project already has, **in any folder, ignoring case**. Renames keep the file's id. | Two files can never share a name (§ 6.2 invariant I4). |
| Saving | Browser: memory only. Desktop: saved 600 ms after each change. `Ctrl+S` downloads the shown file. | No "unsaved" mark and no "close": neither means anything here. |
| Problem markers | A run's messages mark lines per file; a file's marks go when the student clicks in or edits it, and all go when the next run starts. Quiet warnings (an unconnected extra port) never count. | The Files marks follow the same lifetime (§ 5.5). |
| Workspace | `Workspace { files, openTabs, activeTabId, topFileId, topUnit?, testbench? }`. An older `parseWorkspace` given no `openTabs` keeps every file and shows none. | The new field can be clean (§ 6.7); a downgrade loses nothing. |
| Shortcuts | `Ctrl+B`, `Ctrl+Alt+B`, `Ctrl+S`, `Alt+PageUp/PageDown`. The desktop menu (Electron `fileMenu`, `editMenu`, `viewMenu` roles) binds no `Ctrl+P`. | `Ctrl+P` is free in both builds. |

---

## 3. Inputs and research

### 3.1 The brainstorm

| Idea | Verdict | Why |
|---|---|---|
| Compact file switcher: only the active file visible, a searchable list when needed | **Adopted** | The header name and *Go to file* (§ 5.2, § 5.4). |
| Workspace dropdown + vertical tab list | **Not adopted** | One project per window; the folders already group files by language. |
| Compact workspace switcher at the top | **Not adopted** | The only grouping is the language. Hiding the other language's files makes files disappear ("where did my file go?"). Folders can already be collapsed. |
| Vertical list with full names, file-type icons, dirty indicator, pin, close | **In part**: full names, icons, status in Files. **No** dirty mark, pin or close | Nothing is ever unsaved, evicted, or open/closed (§ 2). |
| Hide the top tab bar completely | **Adopted** | F1; its row becomes the pane header (F4). |
| Sidebar + breadcrumbs + Open Items + Recent/Pinned + palette + full-width editor | **Adopted:** sidebar, a file-only palette, full width. **Not adopted:** breadcrumbs, Open Items, Recent/Pinned | With two levels (folder, file) a breadcrumb repeats the header name; Open Items is a second list; Recent/Pinned are built for dozens of files, a student project has a handful. |
| Option A: Open Files drawer | **In spirit: the Files panel is the drawer** | "Open files" and "project files" are the same set here. |

### 3.2 The reference image

`docs/images/UI_Example_Moderne filutforsker for HDLBoard.png`: a Project Files tree, one
file header with Play and Stop, and a permanent **Open Files** panel with a search box.

| Element | Here |
|---|---|
| One file header with run controls | **Yes** (§ 5.2). |
| "Open Files ▾" with *Search files…* | **Yes**, as the temporary *Go to file* picker (F1). |
| Icons per file kind, the current file highlighted | **Yes** (§ 5.5). |
| A permanent Open Files panel beside the tree | **No**: a second list (F1), in the Board I/O column. |
| `●` unsaved and `×` on every row | **No** (§ 3.1). |
| A colour per file | **No**: colour means *testbench* or *problem* only (D9). |

### 3.3 How other tools handle many open files

| Tool | What it does | What we take |
|---|---|---|
| **VS Code** | Tabs by default; `workbench.editor.showTabs` can show one tab or none; preview editors reuse one tab; Quick Open (`Ctrl+P`) jumps to a file by name; `Ctrl+Tab` cycles recent files; Open Editors lists tabs that do not fit. [VS Code] | `Ctrl+P` *Go to file*. A no-tabs mode exists because many tabs is a known pain, even for experts. |
| **JetBrains IDEs** | A tab limit (10 by default) closes tabs when reached; a limit of 1 means no tabs; pinned tabs survive. [JetBrains] | Tabs need housekeeping rules that beginners would have to learn. We remove the problem instead. |
| **EDA Playground** | Testbench pane left, design right, `+` per pane for more files. [EDA Playground] | Confirms TB-left/RTL-right. Its per-pane tabs bring the clutter back as a project grows. |
| **Arduino IDE 2** (beginner IDE) | One tab per sketch file; every file always open. [Arduino] | Same model as HDLBoard: the tabs only list the project, which our Files panel does. |
| **NN/g, "Tabs, Used Right"** | "The fewer tabs, the better"; an overflowing strip hides tabs; one row keeps spatial memory. [NN/g] | F1 and F5. |

This research supports the general pattern, not this exact workflow for HDLBoard's
students. That is checked with students before merge (§ 7.3).

### 3.4 Principles

| # | Principle | Shows up as |
|---|---|---|
| P1 | **One home per job.** Files: which files exist and which are shown. Header: what you are looking at, then what you can do with it. | F1, F4 |
| P2 | **Recognition over recall.** Shortcuts are only an extra. | The name looks clickable (chevron); `Ctrl+P` is only a hint. |
| P3 | **Stable positions.** | F5, D12 |
| P4 | **Calm by default; colour means something.** | D9 |
| P5 | **Nothing destructive looks harmless.** | No `×` beside names; Delete is red, on hover, with a confirm. |
| P6 | **The code gets the space.** | One header row in every view. |
| P7 | **Few states, each visible.** A row is *shown* or not; the top file has its dot; a problem has its mark. | D10, F8 |

### 3.5 Review of version 1.0

Three reviews came in after 1.0. Each point and what was decided:

| Point | Verdict | Where |
|---|---|---|
| F1 contradicts *Go to file*, which is also a file list | **Adopted**: persistent list versus temporary picker | F1 |
| Play beside the name makes the header a toolbar; the name should dominate | **Adopted**: the name is the main element; a divider sets Play apart in the plain header; in the split, the role badge already sits between them. A `⋮` menu was **not** added: there is nothing to put in it. | D5, § 5.2 |
| Make *selected* versus *top* file explicit | **Adopted** | F8, D15 |
| The title is long and "folder" is misleading | **Adopted**: renamed `cleanup_file_tabs.md`, shorter title | Header |
| Too large and prescriptive; implementation detail coupled to internals | **In part**: one document (the repo's specs are written this way), but normative parts are now marked apart from design targets and engineering notes | *How to read* |
| Irreversible, no feature flag | **In part**: no runtime flag (it would double the test surface and keep two navigation models alive). The fallback is the branch: `main` keeps tabs until the usability check passes. | D1, § 7.3 |
| The Files panel takes on too much | **Addressed**: it stays presentational; one pure function computes each row's state (`fileRowState`), so the panel only draws it | § 6.3 |
| `Ctrl+P` overrides a browser shortcut | **Kept in both builds**, with exact rules; the name button is the visible way, and the shortcut is never the only way | D7, § 5.4 |
| `Tab` closing the picker versus the combobox pattern | **Specified and tested**: `Tab` closes without picking and moves focus on; checked with NVDA | § 5.4, § 7.2 |
| Accessibility claims unverified | **Adopted**: the contrast numbers are computed from the token values with the WCAG formula; screen reader, keyboard and zoom are checked by hand, with results recorded | § 5.9, § 7.2 |
| `openTabs` / `activeTabId` compatibility is confusing | **Adopted**: a new `activeFileId` field; the legacy field is read, never written | § 6.7 |
| "Previous file" first may surprise | **Kept, defined exactly**: the highlight only moves the keyboard start point. The shown file is still marked `✓`, and mouse users click any row. | § 5.4 |
| Names may shrink to about 40 px in a narrow split | **Adopted**: a name never gets less than 64 px; the view switch folds into one menu button first | § 5.3 |
| Too many states for beginners | **Adopted**: one *shown* state for every shown file (focus shows in the editor only); "previous" is internal | D10 |
| Docs may drift apart | **Adopted**: all doc changes land on the same branch before merge | § 8 S9 |
| Steps too broad | **Adopted**: nine smaller steps | § 8 |
| "No function over 40 lines" is arbitrary | **Kept as the repo's standard** (Design_Description § 1.3; Verilog plan § 7), moved to the engineering checks | § 9.1 |
| Duplicate names, stale ids, invalid persisted ids, deletion in a split | **Adopted**: invariants, a state table, an error section and tests | § 6.2, § 5.7, § 5.8, § 7.1 |
| Prototype-only visuals | **Adopted**: re-checked in the real build | § 7.2 |
| Research does not prove the workflow for beginners | **Adopted**: a usability check with students gates the merge | § 7.3 |
| Hover actions may cover a long name | **Adopted**: on hover the name ellipsizes before the actions; nothing overlaps text | § 5.5 |
| Problem marks: severity, staleness, colour-only | **Adopted**: error dot / warning ring, the highest severity shown, same lifetime as the editor markers | § 5.5 |
| Deletion fallback ambiguous with two panes | **Adopted** | § 5.7 |
| "Once above the code" with the same file in both panes | **Adopted**: once per pane showing it | § 1 |
| Filter rule and no-match behaviour | **Specified** | § 5.4 |
| Zoom and clipping checks | **Adopted** | § 7.2 |

---

## 4. Decisions

| # | Decision | Why | Rejected |
|---|---|---|---|
| D1 | **Remove the tab strip; no setting brings it back.** It is built on branch `cleanup_filetabs`; `main` keeps tabs until § 7.3 passes. | F1. A runtime setting doubles the test surface and keeps two navigation models. The branch is the fallback. | A "show tabs" setting; a tab limit; preview tabs. They manage the clutter and each needs explaining. |
| D2 | **The Files panel is the persistent list**, with role icons, problem marks and the shown state. | It lists every file already, in a stable order, by language. | A separate Open Files panel or drawer. |
| D3 | **Every pane has a header**; the single design pane gets a *plain* variant (no tint, no role badge). | One place for the name and Play in every view. | A column-level bar: a second row in the split. |
| D4 | **The header takes the tab strip's row, 39 px**, aligned with the side panes' title strips. | The existing alignment rule (`--wb-pane-header-h`); measured equal in the prototype (both at y = 94.99 px). | A 32 px header that breaks the line. |
| D5 | **The name is the header's main element and a button that opens *Go to file*.** It comes first after Play; Play is set apart (a divider in the plain header, the badge in the split); a chevron is always visible. | The header first answers "what am I looking at?", then "what can I do?". A hover-only affordance is invisible to first-time users. | Play right against the name (reads as a toolbar); Play at the far right (it moves between views and competes with the view switch). |
| D6 | ***Go to file* lists every file in Files order, grouped by folder; typing filters; the first highlighted row is the previous file** (§ 5.4). | Stable order (F5); "back to the file I came from" is `Ctrl+P`, `Enter`. VS Code's Quick Open is built on recent files the same way. | A Recent section (duplicate rows); recency order (rows move). |
| D7 | **`Ctrl+P` (and `⌘P`) opens *Go to file* in both builds**, under the exact rules of § 5.4. The name button is the visible way. | The VS Code convention, which vscode.dev also uses in the browser. Printing this page is never useful, and `Ctrl+S` already downloads the code. Free in the desktop menu. | Desktop-only (two behaviours to explain); `Ctrl+Tab` (reserved by browsers). |
| D8 | **The view switch sits at the right end of the rightmost pane header**: labelled in the plain header, icons only in the split, one menu button below 250 px. | Where it is today; in the split the role badges label the same icons right beside it. | An extra toolbar row. |
| D9 | **Role colour only where a testbench is involved.** In lists and the plain header the design chip is quiet grey (`#7c8aa0`); the testbench flask is violet everywhere; teal only in split pane headers and badges. | Ten teal chips are noise (tried in the prototype); with grey designs the testbench stands out. | Teal everywhere; no icon in lists. |
| D10 | **One row state for every shown file.** Both files of a split are highlighted the same; which pane has the caret shows in the editor, not in Files. | Fewer states (P7). The editor already marks the focused pane (the unfocused header is paler). | An extra "shown but not focused" shade. |
| D11 | **Files row actions overlay the end of the row on hover/focus; the name ellipsizes before them.** | Full names at rest; no text under the buttons. | Reserving their width at rest (today); a narrower font. |
| D12 | **While a simulation runs, a pane that cannot stop it shows Play disabled**, with *Stop the simulation first* as its tooltip. | Nothing in the header moves when a run starts or stops, and it says why, as the locked top dot does. | Hiding Play (today's pane rule). |
| D13 | **Deletion and fallbacks follow § 5.7.** | Predictable; F2. | "No file open". |
| D14 | **Closing the split is done with the view switch only** (replaces impl_split_screen.md D14 b). | Its tabs are gone; the switch already pins TB or RTL. | — |
| D15 | **Showing and running stay apart** (F8). Play in a header runs that file and so makes it top, and its tooltip says so: *Run DE1_SoC.vhdl (makes it the Top-File)*. | A beginner must be able to tell "what I see" from "what Start runs": the row highlight versus the blue dot. | Showing a file makes it top (one concept, but a stray click would change what Start runs). |
| D16 | **Workspace: a new `activeFileId` field**; legacy `activeTabId` is read when it is missing; `openTabs` is neither written nor read. `WORKSPACE_VERSION` stays 1. | A clear contract. An older version opening a newer workspace keeps every file and shows none: nothing lost. | Writing fake `openTabs` for older versions (a misleading field). |
| D17 | Strings in **`fileSwitcherText.ts`**, English. | As `testbenchText.ts`. | — |

---

## 5. User experience

### 5.1 Layout

Today, with the 12 examples open:

```text
| EXPLORER | |7Seg.vhdl x|[C]keyCounter7Seg.v x|[C]and_gate.vhdl x|..[TB|Both|RTL]| BOARD I/O |
|          | |<=================== scrollbar =====================>|              |           |
|          | |[>][F TB] and_gate_tb.v      |[>][C RTL] and_gate.v  |              |           |
```

After, split view, one row:

```text
| EXPLORER | |[>][F TB] and_gate_tb.v v    |[>][C RTL] and_gate.v v   [F][|][C] | BOARD I/O |
|          | |  testbench code             |  design code                     |           |
```

After, single design file (the beginner's usual case):

```text
+-----------------------------------------------------------------------------------+
| [>] |  (c) DE1_SoC.vhdl  v                            [F TB | [|] Both | (C) RTL] |
+-----------------------------------------------------------------------------------+
| 1  library ieee;                                                                  |
  [>] Play   | divider   (c) quiet chip   v chevron   [F] flask   [C] chip   [|] split
```

![Prototype: split view, one header row, icon-only view switch](images/file_tabs_prototype_split.jpg)

### 5.2 Plain header (one design file, no testbench)

Shown when the view is `rtl` and the pair has no testbench.

| Part | Target |
|---|---|
| Row | 39 px with its 1 px bottom border; padding 0 8 px 0 10 px; white (it belongs to the code below, as the active tab did); no tint. |
| Play | `SimToggle`, 24 px, at the left edge, as a quiet icon. Tooltip per D15. |
| Divider | 1 × 16 px in `--wb-border`, 8 px each side. It sets the action apart from the name. |
| Name button | The main element: role icon (quiet), the name in 13 px weight 600 in the main text colour, the problem mark, a chevron in the muted colour. 28 px tall, 6 px radius. Hover: `--wb-hover`. Open: `--wb-accent-soft` with a light blue edge. A visible focus ring. |
| Space | Flexible. |
| Chip, view switch | The suggestion chip when shown; the view switch with text labels. |

### 5.3 Split headers and narrow panes

impl_split_screen.md § 4.4's headers stay — role tint, 3 px accent, Play, role badge
(a menu), region navigator — with these changes:

1. **Height 39 px** (3 px accent + 35 px + 1 px border), up from 36 px, to take the strip's line.
2. **The name becomes the switcher button** (§ 5.2, without the role icon: the badge
   beside it shows the role and separates the name from Play).
3. **The rightmost shown pane ends with the view switch** (and the chip, which only
   appears while the split is closed). While two panes show, the switch shows icons
   only; the labels stay as screen-reader text and in the tooltips.
4. **Narrow panes**, measured per pane:

| Pane width | Change |
|---|---|
| < 360 px | The region navigator drops its label ("clock generator"); `‹ 1/2 ›` stays. |
| < 280 px | The role badge shows its icon only; it stays the role menu. |
| < 250 px | The view switch folds into one button (the current view's icon + chevron) that opens *TB / Both / RTL* as a radio menu. The region navigator keeps `‹ ›`; its count moves to the buttons' tooltips and the live region. |
| always | **The name keeps at least 64 px** (about 7 characters and an ellipsis); everything else gives way first. The full name is in its tooltip and in *Go to file*. |

At 200 px, the narrowest a pane can be (`SPLIT_PANE_MIN_W`), the name gets about 70 px
in the RTL pane and 66 px in the TB pane. At a common 1280 px window the panes are
about 272 px each, and the prototype shows "and_gate.v" in full beside the icon-only
switch.

### 5.4 *Go to file*

```text
  [>] | (c) DE1_SoC.vhdl v              <- name button, open
       +--------------------------------------+
       | (Q) Go to file...             Ctrl+P |   search
       +--------------------------------------+
       | [folder] VHDL/                       |   group, styled as in Files
       | v (c) DE1_SoC.vhdl                   |   v = shown
       |   (c) blinkTest.vhdl                 |
       |   (c) keyCounter7Seg.vhdl  *         |   * = error dot
       |   [F] and_gate_tb.vhd                |
       | [folder] VERILOG/                    |
       |   (c) DE1_SoC.v            o         |   o = warning ring
       |   [F] and_gate_tb.v      <highlight> |   previous file
       +--------------------------------------+
       |  +  New file...                      |
       +--------------------------------------+
```

**Look (targets).** A panel under the name button, 320 px wide (it never crosses the
editor column's edge; in a narrow column it is the column less 16 px, at least
240 px), white, 1 px border, 10 px radius, a soft two-layer shadow. A 40 px search row
with the search icon, the placeholder *Go to file…* and a `Ctrl+P` key hint. Rows
30 px: a `✓` column for shown files, the role icon, the name with matched letters in
bold, the problem mark. The highlighted row is in `--wb-accent-soft` with accent text.
Folder labels look exactly like the Files panel's. The list scrolls with the same
overlay scrollbar as Files, at most `min(420px, 60vh)`. A footer row *+ New file…*
replaces the strip's `+`. With nothing matching: *No file matches "abc"*, and the
footer stays.

**Filtering.** Each whitespace-separated word must occur, ignoring case, in
`folder/name` (the rule the Examples search uses): `verilog and` finds
`verilog/and_gate.v` and `verilog/and_gate_tb.v`. Matched letters are bold only where
they fall in the name. Rows keep their order (F5). A group with no matching rows is
left out.

**The previous file**, highlighted when the picker opens with an empty query, is the
newest entry in the session's show history (every `showFile`, newest first) that still
exists and is not shown in either pane. With no such file, the focused pane's file is
highlighted. Once a query is typed, the first matching row is.

**Behaviour.**

| Action | Result |
|---|---|
| Click the name, or `Enter` / `Space` / `↓` on it | Opens; focus in the search box; highlight as above. |
| Type | Filters; the highlight moves to the first match. |
| `↑` / `↓` | Moves the highlight, stopping at the ends. `PageUp` / `PageDown` move 8 rows. |
| `Enter`, or a click on a row | Shows that file (F3), closes, and puts focus in the code of the pane showing it. A file already shown is only focused. |
| `Enter` or a click on *New file…* | Closes and opens the New File dialog. |
| `Esc` | Closes; focus goes back where it was before opening. |
| `Tab` / `Shift+Tab` | Closes without picking; focus moves on as normal. The picker never traps focus. |
| Click outside | Closes; focus stays where the click put it. |

**`Ctrl+P` rules.**

| Situation | Result |
|---|---|
| `Ctrl+P` or `⌘P`, with no `Alt` or `Shift`, matched on `e.code === 'KeyP'` (so a Nordic layout's `AltGr` combinations are never caught) | Opens the picker in the focused pane's header, from anywhere in the workbench, the code included. The browser's print dialog is always prevented. |
| Pressed again while open | Closes it, as `Esc` does. |
| A modal dialog is open | Nothing happens (print is still prevented). |
| Focus in the Files rename box | Opens; the rename commits on blur, as it does for any click away. |
| Explorer hidden, any view | Same; the picker belongs to the editor. |

### 5.5 The Files panel

| Change | Target |
|---|---|
| Role icon | Design chip in quiet grey; testbench (or design + testbench) flask in violet; a file with no units yet keeps the plain file icon. On a shown row the chip takes the row's accent colour. |
| Problem mark | After the name: an **error is a filled red dot**, a **warning is an amber ring** (shape and colour both differ). Only the highest severity is drawn; the tooltip and screen-reader text give both counts (*2 errors, 1 warning*). Quiet warnings never count, as in the editor. The mark lives as long as the file's editor markers: from a run until the student clicks in or edits that file, or the next run starts. |
| Shown state | Every shown file's row: `--wb-accent-soft` background, accent text, weight 600 (D10). Not to be confused with the top file, which keeps its blue dot (F8). |
| Full names | At rest the name has the whole row. On hover or keyboard focus, Download / Rename / Delete appear at the row's end on the row's own background, and the name ellipsizes before them: nothing overlaps text, and the row does not change height. The row's tooltip is the full name. |
| Following the shown file | When the shown file changes and its folder is expanded, its row scrolls into view. A collapsed folder stays collapsed. |

Everything else is unchanged: the top dot, double-click to rename, Upload, New File,
Download All, Examples, drop to upload.

### 5.6 Empty project

Only when the project has no files (F2):

```text
                 (c)  No files yet
        Start from an example, or make your own.
   [ Examples ]     [ New file ]     [ Upload ]
```

Same buttons as the Files panel, so the empty state teaches where they live. No pane
header. Dropping a file on the editor still adds it.

### 5.7 State transitions

"Previous file" is as defined in § 5.4. "Re-pair" means `showFile` on that file with
the event `'open'`, so the split rules decide the view.

| Event | Shown afterwards | Top file |
|---|---|---|
| Click a file in Files / pick in *Go to file* | That file, re-paired | Unchanged (F8) |
| Console link, first compile error | That file at the line | Unchanged |
| New File | The new file (in the TB pane for *Create testbench*) | Unchanged |
| Upload or drop of several files | The last one added | Unchanged |
| Open an example | Its first file | That file (as since 1.3.0) |
| Start / Play | The run file, re-paired with the event `'run'` | The run file (as today) |
| Rename a shown file | Same file, new name in its header(s) and in *Go to file* | Unchanged (the id is kept) |
| **Delete**, single view, the shown file | The previous file, else the first file in Files order | If it was top, as today (`topAfterDelete`) |
| **Delete**, split, the focused pane's file only | The other pane's file, re-paired | As above |
| **Delete**, split, the other pane's file only | The focused pane's file, re-paired | As above |
| **Delete**, the file shown in both panes | The previous file, else the first in Files order | As above |
| Delete a file that is not shown | Nothing changes | As above |
| Delete the last file | Empty project (§ 5.6) | None |
| A file added to an empty project | That file | Unchanged (none until a dot or a run) |

After every transition the invariants of § 6.2 hold.

### 5.8 Error handling

| Case | Behaviour |
|---|---|
| Stored workspace unreadable or of another version | The starter project, as today. |
| Stored `activeFileId` / `activeTabId` names no existing file | The first file in Files order is shown. |
| Rename refused (name taken or reserved) | The refusal dialog, as today; the header keeps the old name. |
| Delete cancelled in the confirm | Nothing changes. |
| Files added or deleted while *Go to file* is open (an upload finishing) | The list updates in place; the highlight stays on its file if still listed, else moves to the first row. If no files remain, the picker closes. |
| A run starts, stops or fails while *Go to file* is open | The picker stays open; the header's Play/Stop updates beside it; new problem marks appear in the list. |
| The anchored header disappears while open (the view changes) | The picker closes; focus goes to the focused pane's code. |
| A run file deleted during a run | As today (the run goes on; the backend has its own copy). The header shows the next file per § 5.7. |

### 5.9 Accessibility

- **Name button**: `aria-haspopup="listbox"`, `aria-expanded`, `aria-controls` set to the
  listbox while open; accessible name *"DE1_SoC.vhdl, go to file"*; tooltip *Go to file
  (Ctrl+P)*.
- **Search box**: `role="combobox"`, accessible name *Go to file*,
  `aria-autocomplete="list"`, `aria-expanded="true"`, `aria-controls` = the listbox,
  `aria-activedescendant` = the highlighted row.
- **Listbox**: `role="listbox"`; each folder is a `role="group"` labelled by its folder
  label (*"vhdl folder"*); rows are `role="option"`. The highlighted row alone has
  `aria-selected="true"` (the pattern's meaning of *selected*); *shown* is part of the
  row's name instead: *"and_gate_tb.v, testbench, 2 errors, shown"*.
- **Count**: a polite live region says *"4 files"* when a filter changes the count, and
  *"No file matches abc"*.
- **Files rows** keep `role="treeitem"`; `aria-current="true"` marks each shown file.
- **Disabled Play** uses `aria-disabled`, so it stays focusable and its reason is read.
- **Contrast**, computed from the token values with the WCAG formula: quiet chip
  `#7c8aa0` is 3.50:1 on white, 3.11:1 on hover, 3.02:1 on a shown row (WCAG 1.4.11
  needs 3:1); violet flask 7.10:1; error dot 4.83:1; row text unchanged (≥ 4.5:1). Checked
  again in the built CSS (§ 7.2).
- **Never colour alone**: shown rows have weight and `✓`; testbenches have the flask
  shape; errors and warnings differ in shape; every mark has text for screen readers.

### 5.10 Tokens and icons (targets)

```css
/* Design chip in lists and the plain header (cleanup_file_tabs.md D9). >= 3:1 on every row background. */
--wb-role-quiet-ink: #7c8aa0;
--wb-switcher-w: 320px;
--wb-switcher-shadow: 0 12px 32px rgba(15, 23, 42, 0.16), 0 2px 6px rgba(15, 23, 42, 0.08);
--wb-switcher-open-edge: #c7d7f7;
```

One new icon, `ChevronDownIcon` (16×16, `currentColor`, stroke 1.6, round caps,
`M4 6l4 4 4-4`). Motion: the picker fades in and moves down 4 px over 120 ms; no
motion under `prefers-reduced-motion`.

### 5.11 Text

In `fileSwitcherText.ts`: *Go to file*, *Go to file…*, *Go to file (Ctrl+P)*,
*{name}, go to file*, *No file matches "{query}"*, *1 file* / *{n} files*, *New file…*,
*shown*, *Stop the simulation first*, *Run {name} (makes it the Top-File)*,
*No files yet*, *Start from an example, or make your own.*, and the problem counts
*{n} error(s)*, *{n} warning(s)*.

---

## 6. Engineering notes

### 6.1 Modules

| New | Responsibility |
|---|---|
| `fileOrder.ts` (pure) | `filesInFolderOrder`, `previousFile`, `nextShownAfterDelete` (§ 5.7), `fileRowState` |
| `fileSwitcher.ts` (pure) | `switcherGroups`, `matchRanges`, `initialHighlight`, `moveHighlight` |
| `paneRunControl.ts` (pure) | `paneRunFor`, replacing `runIcon.ts` |
| `fileSwitcherText.ts` | Strings |
| `FileSwitcher.tsx` + `.css` | Name button and picker |
| `EmptyProject.tsx` | § 5.6 |

Changed: `EditorPaneHeader` (plain variant, name button, end slot), `SplitEditor` (end
slot, narrow rules), `ViewSwitch` (icons-only and menu forms), `splitPaneModels`
(always a pane model; no tab props), `useTestbenchSplit` (no tab handling; exposes the
shown ids and the show history), `CodeEditor` (drop zone + panes or empty state),
`FileExplorer` (§ 5.5, draws `fileRowState`), `Workbench`, `SimToggle` (disabled reason),
`desktop.ts` (§ 6.7), `files.ts` / `index.ts` (`DEFAULT_OPEN_TABS` → `DEFAULT_SHOWN_FILE`),
`icons.tsx`, `Workbench.css`, `CodeEditor.css`.
Deleted: `EditorTabStrip.tsx`, `runIcon.ts` (its tests move to `paneRunControl.test.ts`),
the tab-strip CSS.

### 6.2 State and invariants

- `openTabs` goes. `activeTabId` is renamed `activeFileId`: the file in the focused pane
  (the Files highlight's anchor, `Ctrl+S`, the pair anchor).
- The **show history** stays where it is (`recentFileIds` in `useTestbenchSplit`, session
  only), with deleted ids removed.
- **One source of truth each**: files and their order: `files` + `filesInFolderOrder`;
  what is shown: the split's `display` (pair + view), from which the shown ids are
  derived; persistence: `activeFileId` only.

Invariants, true after every state change (asserted in tests):

| # | Invariant |
|---|---|
| I1 | If the project has files, `activeFileId` names one of them, and it is shown in the focused pane. |
| I2 | Every shown id names an existing file. |
| I3 | Deleting a file removes its id from the shown pair, the show history, the overrides, the diagnostics and `topFileId`. |
| I4 | File names are unique project-wide, ignoring case (`fileNameRules.ts`), so a name identifies a file; *Go to file* still shows the folder group. |
| I5 | Files and *Go to file* list the same files in the same order. |

### 6.3 Pure functions (shapes)

```ts
/** The row as Files and Go to file draw it — the panels only render this. */
export interface FileRowState {
  readonly shown: boolean;
  readonly isTop: boolean;
  readonly role: FileRole | undefined;
  readonly problems: { readonly errors: number; readonly warnings: number };
}
export function fileRowState(fileId: string, ctx: RowContext): FileRowState;

export function filesInFolderOrder(files: readonly VhdlFile[]): readonly VhdlFile[];
export function previousFile(history: readonly string[], files: readonly VhdlFile[], shownIds: readonly string[]): string | null;
export function nextShownAfterDelete(/* § 5.7 inputs */): { readonly fileId: string | null };

export function switcherGroups(files: readonly VhdlFile[], query: string): readonly SwitcherGroup[];
export function matchRanges(name: string, query: string): readonly (readonly [number, number])[];
export function initialHighlight(rows: readonly SwitcherRow[], query: string, previousId: string | null, focusedId: string | null): string | null;
export function moveHighlight(rows: readonly SwitcherRow[], currentId: string | null, key: string): string | null;

/** A pane's Play / Stop (impl_split_screen.md B5; D12 here). */
export function paneRunFor(input: PaneRunInput): { kind: 'play' | 'stop'; disabled: boolean; reason?: string } | null;
```

`Ctrl+P` is a window `keydown` listener beside `Ctrl+S`'s. It issues an open request
with an id (the pattern `RevealRequest` uses) to the focused pane's header.

A one-unit design file's Play in the plain header runs what the tab's Play ran, so the
`RUN` sent is byte-identical (impl_split_screen.md AC-6, B7).

### 6.4 Pane header and split

- `editorPropsFor` always returns pane models; today's `plainDesign` bypass becomes the
  plain variant.
- `SplitEditor` hands the end slot (chip + view switch) to the pane it draws last.
- The narrow rules of § 5.3 use container queries on each pane.

### 6.5 Run controls

`paneRunFor`: while stopped, Play where `hasTopDot(folder)` or in the TB pane; while
this pane's unit runs, Stop (disabled while compiling); while something else runs,
Play disabled with its reason, only where Play would be offered when stopped.

### 6.6 Picker component

The panel renders inside the editor column (no portal), like the role badge menu.
Rows take `pointerdown` with `preventDefault` so the search box keeps focus, then
pick on `click`. The outside-click and `Esc` handling come from `usePopover`.

### 6.7 Workspace contract

| Field | Write | Read |
|---|---|---|
| `activeFileId` (new) | The focused pane's file | Used if it names a file |
| `activeTabId` (legacy) | Not written | Used only when `activeFileId` is missing and it names a file |
| `openTabs` (legacy) | Not written | Ignored |
| Neither usable | — | The first file in Files order |
| Everything else | Unchanged | Unchanged |

`WORKSPACE_VERSION` stays 1. **Downgrade**: an older version reading this file keeps
every file and override and shows no file until one is clicked. That was checked
against today's `parseWorkspace`, and it loses nothing.

### 6.8 Changes to `docs/impl_split_screen.md`

Mark with one line pointing here: B5 (other panes show a disabled Play, D12), D8 (no
tab strip), D14 b (D14 here), § 4.1 (the tab strip and the `is-visible` tab → the
Files shown state), § 4.3 (the tab-closing rows), § 4.5 (icons in Files and *Go to
file*), AC-15. Update `tests/e2e/split-screen.md` steps 1, 4 and 7.

---

## 7. Test plan

### 7.1 Unit tests

| File | Covers |
|---|---|
| `fileOrder.test.ts` | Files order across `vhdl/`, `verilog/`, `work/`; `previousFile` (deleted, shown in either pane, empty history); every row of § 5.7 through `nextShownAfterDelete`; I1–I3 after each; `fileRowState` (top versus shown independent, highest severity, quiet warnings ignored). |
| `fileSwitcher.test.ts` | Same order as Files; filters by name, by folder, by several words, case; folder-only matches mark nothing; empty groups dropped; no match; highlight rules; arrow and Page keys at the ends; a list with one file. |
| `paneRunControl.test.ts` | The old `runIcon` cases per pane; D12; `work/` in the RTL pane; the TB pane. |
| `desktop.test.ts` | `activeFileId` written, `openTabs` and `activeTabId` not; legacy `activeTabId` read; unknown ids fall back to the first file; an empty `files` array; duplicate ids dropped (as today); a workspace written by 1.3.0 opens on its active file; this version's file parsed by a copy of 1.3.0's `parseWorkspace` keeps all files. |
| Existing split tests | Unchanged and green. |

### 7.2 Manual checks in the real build

Driven in Chrome with the Claude-in-Chrome extension, as the repo does. Saved as
`tests/e2e/file-switching.md`, with each run's result and screenshots noted.

1. Fresh start: one header over `DE1_SoC.vhdl`; its bottom edge lines up with the side pane strips (measured, ±0.5 px).
2. Open the 12 examples: no horizontal scrollbar; every Files name in full at the default width; flasks violet, chips grey.
3. Click `and_gate_tb.v`: the split opens in one header row; both shown rows highlighted alike; the blue dot stays where it was (F8).
4. `Ctrl+P`: the previous file is highlighted; `Enter` shows it; `Ctrl+P`, `Enter` goes back. `Ctrl+P` twice closes. In a dialog: nothing, and no print dialog.
5. `Ctrl+P`, `verilog and`: the two Verilog AND files, letters in bold; `Esc` returns the caret to the code; `Tab` closes and moves on.
6. An error and a warning in two files, then Start: dot and ring in Files and *Go to file*; click into the file: its mark goes.
7. While running, show another design: Play disabled with its tooltip; the name does not move.
8. Explorer hidden (`Ctrl+B`): switch files with the header alone.
9. Every deletion row of § 5.7, including the last file and the empty-state buttons.
10. A 40-character file name: ellipsis in the header, full in Files at rest, ellipsized (not overlapped) on hover.
11. Narrow the split to 200 px per pane: the switch menu, icon-only badge, a name of at least 64 px; nothing overflows.
12. Browser zoom 200 % and a 1280 px window: header, picker and Files neither clip nor overlap.
13. Keyboard only, then NVDA + Chrome on Windows: name button, picker (roles, names, count announcements, `Esc`, `Tab`), Files rows, disabled Play.
14. Desktop: restart keeps the shown file; 1.3.0 installed over it opens the workspace with all files.

### 7.3 Usability check — the merge gate

Before `cleanup_filetabs` merges, 3–5 people new to HDLBoard (PB1180 students if
possible) each do, unaided, on the branch build with the 12 examples open:

1. Open `keyCounter7Seg.vhdl`.
2. Find and show the testbench for `and_gate.vhdl`.
3. Switch between three named files.
4. After a failed run, say which file has the error, and open it.
5. Say which file Start will run, and make another file the one that runs.
6. Delete a file and carry on working.

**Pass**: every task done by all but at most one person, with no one asking where the
tabs went more than once. A task that fails twice sends the design back before merge.
Notes go in `tests/e2e/file-switching.md`.

---

## 8. Implementation steps

Each step is one reviewable commit (or a few) on `cleanup_filetabs`, ending with
`npm run typecheck` and `npm test` clean and the app working.

| Step | Work | Done when |
|---|---|---|
| **S1** | Order and invariants: `fileOrder.ts` + tests; Files uses `filesInFolderOrder`. | `fileOrder.test.ts` green; no visible change. |
| **S2** | Workspace contract (§ 6.7) + tests; `openTabs` still in state. | `desktop.test.ts` green; the desktop app restarts on the same file. |
| **S3** | Files panel (§ 5.5): role icons, problem marks, shown state, hover actions, scroll-into-view. | Manual checks 2, 6, 10 (with tabs still present). |
| **S4** | `paneRunControl.ts` + tests; disabled Play in today's split headers. | Manual check 7 in the split. |
| **S5** | Headers: plain variant, 39 px, end slot, D5 layout, narrow rules. The tab strip is still there. | Manual checks 1, 11, 12 for the headers. |
| **S6** | Remove the tab strip, `openTabs`, its handlers and the tab CSS; rename `activeTabId` → `activeFileId` (its own commit); `EmptyProject`; deletion per § 5.7. | Unit tests; manual checks 3, 9. |
| **S7** | *Go to file* and `Ctrl+P`. | Manual checks 4, 5, 8. |
| **S8** | Accessibility and visual pass: NVDA, keyboard, zoom, contrast in the built CSS. | Manual checks 12, 13; results recorded. |
| **S9** | Docs on the same branch: impl_split_screen.md (§ 6.8), `tests/e2e/split-screen.md`, README, `Design_Description.md` § 9, `changelog.txt`, a fresh `docs/images/workbench.png`. Then the usability check (§ 7.3). | All of § 7 passes; then merge to `main`. |

---

## 9. Acceptance criteria

User-observable; each is checked in § 7.

- **AC-1** No tab strip in any view. No control closes a file without deleting it.
- **AC-2** With 12 or more files, no horizontal scrollbar in the editor, and every name in
  Files is readable in full at rest at the default width.
- **AC-3** One 39 px header row in every view, aligned with the side pane title strips; the
  file name is the header's main element, set apart from Play.
- **AC-4** *Go to file* lists the same files in the same order as Files, filters per § 5.4,
  never reorders, and opens on the previous file.
- **AC-5** `Ctrl+P` / `⌘P` follows § 5.4's rules in the browser and the desktop build and
  never opens a print dialog.
- **AC-6** Showing a file never changes the top file; only § 5.7's events do (F8).
- **AC-7** Files shows role icons (D9), error dots and warning rings, and one shown state; hover
  actions never overlap the name.
- **AC-8** A one-unit design's Play sends a `RUN` byte-identical to 1.3.0.
- **AC-9** While a run goes, a pane that cannot stop it shows Play disabled with its reason;
  nothing in the header moves when a run starts or stops.
- **AC-10** Every row of § 5.7 and § 5.8 behaves as stated.
- **AC-11** A 1.3.0 workspace opens on its active file; this version's workspace opens in 1.3.0
  with every file kept.
- **AC-12** § 5.9 holds when checked with the keyboard and NVDA + Chrome, and the contrast holds in
  the built CSS.
- **AC-13** The usability check (§ 7.3) passes.

### 9.1 Engineering checks

`npm run typecheck` clean; no new runtime dependency; plain CSS; the pure modules
(`fileOrder`, `fileSwitcher`, `paneRunControl`) import nothing from React; the
invariants I1–I5 are asserted in tests; the repo's Clean Code standard (functions aim
at 20 lines, at most 40); docs updated on the branch (S9).

---

## 10. Out of scope

- Reordering files by drag; folders a student makes (the folders stay `vhdl/`, `verilog/`, `work/`).
- Symbol search (`@entity`) in *Go to file*.
- Back/forward history (`Alt+←`); `Ctrl+P`, `Enter` covers going back one step.
- A runtime "show tabs" setting (D1).
- Automated visual regression tests (the repo has no such tooling; § 7.2 is manual).

---

## 11. Open questions

| # | Question | Default until decided |
|---|---|---|
| Q1 | Hide the view switch on a plain design file? Beginners rarely need it there, but it is how *Create testbench* is found. | Keep it. Watch task 2 of § 7.3. |
| Q2 | Collapse the folder of the language that is not the top file's? | No (F7, P3). |
| Q3 | Shortcut hints as `⌘P` / `⌘B` on macOS? Today every hint says `Ctrl+…`. | `Ctrl+…` everywhere; change all hints together if ever. |

---

## 12. Sources

- [VS Code: User interface](https://code.visualstudio.com/docs/getstarted/userinterface) — `workbench.editor.showTabs`, preview editors, Open Editors, Quick Open (`Ctrl+P`), `Ctrl+Tab`.
- [JetBrains IntelliJ IDEA: Editor basics](https://www.jetbrains.com/help/idea/using-code-editor.html) — tab limit, closing policy, pinned tabs.
- [EDA Playground: FAQ](https://eda-playground.readthedocs.io/en/latest/faq.html), [Quick Start](https://github.com/edaplayground/eda-playground/wiki/Quick-Start) — testbench left, design right, `+` per pane.
- [Arduino Forum: Using tabs in IDE 2](https://forum.arduino.cc/t/using-tabs-in-ide2/1152560) — one tab per sketch file, all files always open.
- [NN/g: Tabs, Used Right](https://www.nngroup.com/articles/tabs-used-right/) — overflowing tabs, one row, "The fewer tabs, the better."
- [WAI-ARIA APG: Combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/) — the *Go to file* search box and listbox.
- [WCAG 2.2: 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) — the 3:1 bar for icons and marks.
- `docs/images/UI_Example_Moderne filutforsker for HDLBoard.png` — the reference image (§ 3.2).
- `docs/images/file_tabs_prototype_switcher.jpg`, `file_tabs_prototype_split.jpg` — DOM prototype, 2026-10-05.
