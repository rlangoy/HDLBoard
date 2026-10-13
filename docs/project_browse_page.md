# Projects page: browse local and GitHub projects

**Implementation specification** · Status: ready to implement · Date: 2026-10-13
Visual reference: [`docs/mockup/projects_page.html`](mockup/projects_page.html) (open it in a browser).
Sketch it is based on: [`docs/images/UI_Project_Open_page.png`](images/UI_Project_Open_page.png).

This is a UI change. Work directly on `main` (no feature branch). Build it in the order of § 12; each
step leaves the app working, type-checked (`npm run typecheck`) and tested (`npm test`).

---

## 1. What changes, in one paragraph

Today the header's **GitHub** button opens a modal dialog (`GitHubDialog.tsx`, title "GitHub",
subtitle "Keep your projects on GitHub, and open them on any computer") that holds the sign-in, the
signed-in account, the open project and the list of projects on GitHub. That dialog goes away as a
dialog. Its content moves into a new full-height **Projects page** (`ProjectsPage.tsx`), shown over
the editor exactly like the existing **Project page** (`ProjectPage.tsx`) and the **Examples pane**
(`ExamplesPane.tsx`). The Projects page lists **all** projects in one list — the ones in the local
projects folder (marked **Local**) and the ones on GitHub (marked **GitHub**) — with a search field,
a language filter, a sort order and a list/grid switch. Only the GitHub *sign-in steps* stay in a
small dialog (`GitHubSignInDialog.tsx`), because they wait for the user to act in another window.

## 2. Words used in this document

| Word | Meaning |
|------|---------|
| **Projects page** | The new page in this spec: browse and open projects. Overlay value `'projects'`. |
| **Project page** | The existing page for *one* open project (`ProjectPage.tsx`, overlay `'project'`). Unchanged except where § 9 says. |
| **Projects folder** | The local folder the Projects page scans for project files (§ 6). |
| **Project file** | A `*.hdlboard.json` file (`src/project/types.ts`, `PROJECT_FILE_EXTENSION`). |
| **Item** | One row/card in the list: a `ProjectListItem` (§ 5.1), either local or GitHub. |

## 3. Current code you need to know (read these first)

| File | What it does today | What happens to it |
|------|--------------------|--------------------|
| `src/components/workbench/Workbench.tsx` | Owns `dialog` state (`'github'` opens `GitHubDialog`, line ~1294) and `overlay` state (`'examples' \| 'project' \| null`, line ~260). Renders `ProjectPage` / `ExamplesPane` inside `.wb-center`. Has `openProjectFrom`, `openProjectText`, `openProjectUpload`, `handleStartProject`, `handleSaveProject`, `saveFolderRef`. | Add overlay `'projects'`; replace dialog `'github'` with `'githubSignIn'`; wire the page (§ 9). |
| `src/components/workbench/GitHubDialog.tsx` | Modal: `SignInPanel` (signed out) or `SignedInPanel` (`Account`, `CurrentProject`, `Activity`, `ProjectList`). | Split: sign-in parts → `GitHubSignInDialog.tsx`; `Account` and `CurrentProject` → reused on the Projects page; `ProjectList`/`ProjectRow` → replaced by the new list. Then delete `GitHubDialog.tsx`. |
| `src/components/workbench/useGitHub.ts` | Sign-in state (`GitHubConnection`). | Unchanged. |
| `src/components/workbench/useGitHubProjects.ts` | GitHub list/open/save/delete (`GitHubProjects`). `showSignIn` opens the dialog. | Unchanged API; `showSignIn` now opens `GitHubSignInDialog`. |
| `src/github/projectIndex.ts` | `IndexEntry` = `{name, description, url, gistId, createdAt, updatedAt}`. | Add optional `files` (§ 7). |
| `src/github/projectGists.ts` | `indexEntryFor()` builds the index entry on every save. | Also write `files` (§ 7). |
| `src/components/workbench/ExamplesPane.tsx` + `.css` | Overlay page with search field and language filter. | Pattern to copy (layout, Escape, focus). |
| `src/components/workbench/ProjectPage.css` | Card look of the Project page (`.wb-project__card`, 12 px radius, `--wb-border`). | Pattern to copy. |
| `src/components/workbench/Header.tsx` | GitHub button: avatar + login when signed in, GitHub mark + "GitHub" when not. | Button label/title change (§ 9.3). |
| `src/components/workbench/FileExplorer.tsx` | **Open Project** button calls `onOpenProject` (opens `OpenProjectDialog`). | Now opens the Projects page (§ 9.4). |
| `src/components/workbench/desktop.ts` | `HdlBoardBridge` (`window.hdlboard`, Windows app). | Add 3 optional methods (§ 6.2). |
| `winInstaller/electron/preload.js`, `main.js` | IPC for `read-local-file`, `write-local-file`, … | Add 3 IPC handlers (§ 6.2). |
| `src/components/workbench/fileKinds.ts` | `languageOfName(name)` → `'vhdl' \| 'verilog' \| undefined`. | Reused for language detection. |
| `src/components/workbench/projectSave.ts` | `canPickFolder()`, `PickedFolder`, `pickSaveFolder()`. | Reused for the browser folder (§ 6.3). |
| `src/components/workbench/icons.tsx` | All SVG icons (Material Symbols + Lucide-style `OutlineIcon`). | Add 9 icons (§ 10). |

## 4. The page, top to bottom

Exact look: see the mockup. Max content width **1040 px**, centred, 24 px side padding, 16 px gap
between blocks, background `var(--wb-sidebar-bg)`, cards white with `1px solid var(--wb-border)`,
radius 12 px — same as `.wb-project__card`.

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ A  [account card ......................................]  [+ New project] [×] │
│ B  [Open now: Full Adder Truth Table · ✓ Saved on GitHub · Save to GitHub · ⋯] │
│ C  My Projects                                                    [⟳ Refresh] │
│    Projects on this computer and on GitHub, in one place.                     │
│ D  [🔍 Search projects and files…        ] [All types ▾] [Newest first ▾] [☰|▦]│
│ E  Local folder: C:\Users\…\HDLBoard Projects   Change…      3 local · 5 GitHub│
│ F  ┌ list of items ──────────────────────────────────────────────────────────┐│
│    │ [</>] VHDL-Examples                   ●VHDL          [📂 Open]  ↗  ⋮    ││
│    │       Simple VHDL examples …                                            ││
│    │       👤 rlangoy  🕒 Updated Oct 5, 2026  [GitHub mark] GitHub          ││
│    └─────────────────────────────────────────────────────────────────────────┘│
│ G  ⓘ footnote                                                                 │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 A — top bar

Left: the **account card** (flex 1). Right: **New project** (primary button) and **Close** (×).

**Account card, signed in** (`session !== null`), moved from `GitHubDialog`'s `Account`:
- Avatar 40 px circle (`user.avatarUrl`; hide `<img>` when empty).
- Line 1: `Signed in as <strong>{login}</strong>`.
- Line 2 (small, muted): `Until you close this tab.` or `Remembered on this computer until you sign out.`
  (`connection.remembersSignIn`), then link **Manage access on GitHub** (`AUTHORIZED_APPS_URL`).
- Button **Sign out** (`SignOutIcon`) → `connection.signOut()`.

**Account card, signed out**:
- A 40 px round tile with the GitHub mark (`GitHubIcon`) on `#24292f`, white mark.
- Line 1: `<strong>Connect GitHub</strong>` · Line 2: `Sign in to see and save your projects on GitHub, on any computer.`
- Button **Sign in with GitHub** (`GitHubIcon`, dark button) → opens `GitHubSignInDialog`
  (the same dialog the header's GitHub button opens when signed out, § 9.3).
- While `connection.step.kind !== 'idle'` (signing in), the button shows a spinner and the text
  `Signing in…` and is disabled.

**New project** (primary, `PlusIcon`, label "New project" — **not** the GitHub icon, a project may end
up local, on GitHub, or both). Click → `handleStartProject()` (existing: starts an empty project and
shows the Project page). It replaces the Projects page (overlay becomes `'project'`).

**Close** (×, `CloseIcon`, `aria-label="Close the projects page"`, `title="Back to the code (Esc)"`) → overlay `null`.

### 4.2 B — "Open now" card (only when a project is open)

Moved from `GitHubDialog`'s `CurrentProject`, made wider:
- Small muted label `Open now`, then the project name in bold (`Untitled project` when empty).
- `GitHubStatus` chip (existing component) for `gitHubSync`.
- A second chip **Unsaved changes** (amber) when `projectUnsaved` (local save state).
- Button **Project page** (`ProjectIcon`) → overlay `'project'`.
- Button **Save to GitHub** (primary, `CloudUploadIcon`) → `gitHubProjects.save()`; disabled when
  `busy` or `syncState === 'saved'`. Signed out: still enabled; `save()` already asks to sign in first.
- Background `var(--wb-accent-soft)`, border `#cfe0ff`, radius 12 px.

### 4.3 C — title row

- `<h2 id="wb-projects-title">My Projects</h2>` (22 px, 700) and subtitle
  `Projects on this computer and on GitHub, in one place.` (muted, 14 px).
- Right: icon button **Refresh** (`RefreshIcon`, `aria-label="Read the lists again"`) → rescans the
  local folder and calls `gitHubProjects.refresh()`. Spins (CSS rotate animation) while either is busy.

### 4.4 D — toolbar

One row (wraps on narrow widths, § 4.8):

1. **Search** — `<input type="search">` with `SearchIcon` inside on the left, placeholder
   `Search projects and files…`, `aria-label="Search projects"`, flex 1, height 40 px. Gets focus
   when the page opens. Matching rules in § 5.3.
2. **Type filter** — native `<select aria-label="Language">` styled as a pill button (40 px, chevron):
   `All types` (`'all'`), `VHDL` (`'vhdl'`), `Verilog` (`'verilog'`).
3. **Sort** — native `<select aria-label="Sort by">`:
   `Newest first` (`'newest'`, default), `Oldest first` (`'oldest'`), `Name A–Z` (`'name'`).
4. **View switch** — a 3-button segmented control (`role="radiogroup" aria-label="View"`), each a
   34×34 icon button with `role="radio"` and `aria-checked`, in this order: **Compact list**
   (`RowsIcon`, value `'compact'`, the **default**), **Small icons** (`GridIcon`, value `'grid'`) and
   **Details** (`ListIcon`, value `'list'`). Selected one: accent background, white icon.

The type, sort and view choices are remembered in `localStorage` under one key
`hdlboard.projectsPage` as `{"type":"all","sort":"newest","view":"compact"}`; wrap reads/writes in
`try/catch` and fall back to the defaults. The search text is **not** remembered.

### 4.5 E — status line

One muted 13 px line between toolbar and list:
- Left: `LaptopIcon` + `Local folder:` + folder name/path in monospace + text button **Change…**
  (§ 6). When no folder is chosen: `No local folder chosen.` + button **Choose folder…**.
  When permission is needed (browser, § 6.3): `Allow access to <name>` button.
- Right: counts of what is shown: `3 local · 5 on GitHub` (only the parts that exist). When a search
  or filter hides items: `Showing 2 of 8`.

### 4.6 F — the list

`<ul class="wb-projects__list" aria-label="Projects">`, one `<li>` per item, sorted and filtered (§ 5).

**Details view (`'list'`)** — one card per row, 16 px padding, 10 px gap between cards:

| Part | Content |
|------|---------|
| Tile (48×48, radius 12) | `CodeIcon` (`</>`) white on a gradient chosen by language (§ 4.9). |
| Name | Bold 16 px. `Untitled project` when empty. If the item is the open project: chip **Open now**. |
| Description | 14 px muted, max 2 lines (`-webkit-line-clamp: 2`). Hidden when empty. |
| Search hit (only while searching, only when the hit is in a file) | 12 px line: `FileIcon` + `counter.vhd — 4-bit counter with enable` (the first matching file, § 5.3). |
| Meta row | `PersonIcon` + owner (GitHub items: the login; local items: `This computer`), `ClockIcon` + `Updated Oct 5, 2026` (`toLocaleDateString(undefined, {dateStyle:'medium'})`; omit when unknown), then the **source badge**. |
| Source badge | Local: `LaptopIcon` + `Local` (slate). GitHub: `GitHubIcon` + `GitHub` (near-black). 12 px, 600 weight, pill with tinted background. |
| Language chips | Middle column: one pill per language, a coloured dot + `VHDL` / `Verilog`. None when no source file. |
| **Open** | Outline accent button with `FolderOpenIcon`. Primary action (§ 8). |
| External | Icon button. GitHub: `OpenInIcon`, link to `item.url` (new tab), `title="Show on github.com"`. Local in the Windows app: `OpenInIcon`, `title="Show in Explorer"`, calls `bridge.showInFolder(path)`. Local in a browser: not rendered. |
| More (`⋮`) | `MoreIcon` button opening a small menu (§ 4.7). |

**Compact list view (`'compact'`)** — one table row per item, for many projects at a glance
(sketch: `docs/images/UI_Project_Open_page_compact_list.png`). A white card (border, radius 12,
`overflow: hidden`) holding a `<table class="wb-projects__table">` with `table-layout: fixed`,
then a footer line.

| Column | Width | Header | Cell |
|--------|-------|--------|------|
| Project name | 30 % | Sort button **Project name** | The same project tile as the other views (§ 4.9 gradient by language, white `CodeIcon`), smaller: 30×30, radius 8, icon 17 px; `title` on the tile = `VHDL`, `Verilog`, `VHDL + Verilog` or `No source files`. Then the name bold, one line with ellipsis, then the **Open now** chip for the open project. |
| Description | rest | `Description` | One line, ellipsis, muted; full text in `title`. While searching with a file hit (§ 5.3) it shows `counter.vhd — 4-bit counter with enable` instead, matches marked with `<mark>`. |
| Stored | 104 px | `Stored` | The source badge (§ 4.6 table), with text. |
| Last saved | 150 px | Sort button **Last saved** | `relativeTime(item.updatedAt)` (§ 5.2), e.g. `4 days ago`; `title` = full local date and time; `—` when unknown. One line, ellipsis. |
| Actions | 160 px | `Actions` (right-aligned) | **Open** as a small **filled** primary button (32 px high — the table is dense, so the main action is the strongest colour in the row), the external icon button and `⋮` (both 32×32). |

- Header row: 42 px, `#f8fafc` background, 12.5 px 600 `#475569`. Body rows: 50 px, divider
  `1px solid #eef2f7`, hover background `#f8fafc`. Open-now row: background `#f3f7ff` and an
  inset 3 px accent bar on the left (`box-shadow: inset 3px 0 0 var(--wb-accent)`).
- **Sortable headers**: *Project name* and *Last saved* are `<button>`s inside their `<th>`, with an
  `ArrowDownIcon` (16 px) that is visible only on the active column and turned 180° for ascending.
  The active `<th>` has `aria-sort="ascending"` / `"descending"`. Clicking *Project name* sets
  sort `'name'`; clicking *Last saved* sets `'newest'`, or `'oldest'` when it already is `'newest'`.
  This is the same state as the Sort `<select>` (§ 4.4), so both always agree.
- Footer (`#f8fafc`, top border, 13 px muted): `Showing 1–6 of 6 projects` (shown count of all).
- Double-click on a row = Open. Loading and empty states are the same as the other views.

**Small icons view (`'grid'`)** — CSS grid `repeat(auto-fill, minmax(200px, 1fr))`, 12 px gap. Each
card: tile (40 px) top-left, source badge top-right (icon only, with `title`), name (1 line,
ellipsis), description (2 lines), language dots, **Open** button full width at the bottom. No meta
row, no external button; the `⋮` menu sits in the top-right corner on hover/focus.

The whole card is **not** a button (it has several buttons). Double-click on the card = Open.

**Loading**: while the first local scan or the first GitHub read is running and the list has no
items yet, show 3 skeleton cards (grey bars with a shimmer). Respect `prefers-reduced-motion`.

**Empty states** (centred, icon 40 px, text, optional button):

| Case | Text | Button |
|------|------|--------|
| No items at all, signed out, no folder | `No projects yet. Create one, choose a local folder, or connect GitHub.` | **New project** |
| Items exist but search/filter hides all | `No projects match “<query>”.` (or `No VHDL projects.` / `No Verilog projects.` when only the type hides them) | **Clear filters** (empties search, type `all`) |

**Errors**: a GitHub list failure (`gitHubProjects.message?.tone === 'error'`) and a local scan
failure are shown as one inline red banner above the list with **Try again**. The other source's
items still show.

### 4.7 The `⋮` menu

A small popover menu (`role="menu"`, items `role="menuitem"`), closed by Escape, outside click or
choosing an item; arrow keys move between items. Items:

| Item | Local | GitHub |
|------|:-----:|:------:|
| **Open** | ✓ | ✓ |
| **Copy share link** (`CopyIcon`) — `copyText(shareLink(window.location.href, { htmlUrl: entry.url }))`; change `shareLink`'s second parameter type to `Pick<GistLink, 'htmlUrl'>` (it only reads that field) | | ✓ |
| **Copy path** (`CopyIcon`) — Windows app only | ✓ | |
| **Show in Explorer** — Windows app only | ✓ | |
| **Delete from GitHub…** (`DeleteIcon`, red) → `gitHubProjects.remove(entry)` (it already confirms) | | ✓ (own projects) |

There is **no** delete for local projects: HDLBoard never deletes files on disk.

### 4.8 Responsive

The page uses a container query (`container: wb-projects / inline-size`), like `.wb-project`:
- `< 720px`: toolbar wraps — search on its own full-width row, the 3 controls below; in details view
  the language chips move under the description and the external button hides (it stays in `⋮`).
  In the compact list the Description column hides and the Stored badge shows its icon only.
- `< 480px`: the account card stacks (avatar+text, then Sign out full width); New project shows icon
  only (`aria-label` keeps "New project"). In the compact list the Last saved column and the
  external button hide.

### 4.9 Colours (add to `ProjectsPage.css`, reuse `--wb-*` tokens)

| Use | Value |
|-----|-------|
| Tile, VHDL only | `linear-gradient(160deg, #4f8bff, #1d4ed8)` |
| Tile, Verilog only | `linear-gradient(160deg, #34d399, #15803d)` |
| Tile, both | `linear-gradient(160deg, #a78bfa, #6d28d9)` |
| Tile, no source files | `linear-gradient(160deg, #94a3b8, #475569)` |
| VHDL dot | `var(--wb-accent)` (`#2f6fed`) — same as the Examples pane's VHDL badge |
| Verilog dot | `var(--wb-success)` (`#16a34a`) — same as the Examples pane's Verilog badge |
| Local badge | text `#334155`, background `#f1f5f9`, border `#e2e8f0` |
| GitHub badge | text `#1f2328`, background `#f6f8fa`, border `#d0d7de` |
| Open-now card | background `var(--wb-accent-soft)`, border `#cfe0ff` |
| Open-now row highlight | border `var(--wb-accent)`, `box-shadow: 0 0 0 3px var(--wb-accent-soft)` |
| Card hover | border `#cbd5e1`, `box-shadow: 0 4px 12px rgba(15,23,42,.06)`, 120 ms transition |

Focus rings: `outline: 2px solid var(--wb-accent); outline-offset: 2px` on every button, select and input.

## 5. Data and pure logic (`src/components/workbench/projectCatalog.ts`)

All filtering, sorting and conversion is **pure** (no React, no DOM, no I/O) and unit-tested in
`projectCatalog.test.ts` (vitest, like `examples.ts` / `filterExamples`).

### 5.1 Types

```ts
export type ProjectLanguage = 'vhdl' | 'verilog';
export type ProjectSource = 'local' | 'github';
export type TypeFilter = 'all' | ProjectLanguage;
export type SortOrder = 'newest' | 'oldest' | 'name';
export type ProjectsView = 'list' | 'compact' | 'grid';

export interface CatalogFile {
  name: string;
  description: string;
}

export interface ProjectListItem {
  /** Unique in the list: `local:<location>` or `github:<gistId>`. */
  key: string;
  source: ProjectSource;
  name: string;
  description: string;
  files: CatalogFile[];
  /** From the file names, in the order 'vhdl', 'verilog'; empty when none is a source file. */
  languages: ProjectLanguage[];
  /** ISO 8601, or '' when unknown. Local: the project file's modification time. GitHub: updatedAt || createdAt. */
  updatedAt: string;
  /** GitHub login for GitHub items; '' for local items. */
  owner: string;
  /** Local: full path (Windows app) or `<folder>/<sub>/<file>` (browser). GitHub: the gist's html_url. */
  location: string;
  /** GitHub items only. */
  gistId?: string;
  /** The original index entry, so the page can call gitHubProjects.open/remove with it. */
  entry?: IndexEntry;
}
```

### 5.2 Functions (exact signatures)

```ts
/** Languages of the given file names, via languageOfName (fileKinds.ts), deduplicated, 'vhdl' first. */
export function languagesOf(fileNames: readonly string[]): ProjectLanguage[];

/** A GitHub index entry as an item. Uses entry.files when present (§ 7), else []. */
export function itemFromIndexEntry(entry: IndexEntry, owner: string): ProjectListItem;

/**
 * A local project file as an item. Parses with parseProject (src/project/parseProject.ts);
 * returns undefined when it is not a valid project file (it is then listed in scan problems, § 6.4).
 */
export function itemFromProjectFile(text: string, location: string, modifiedMs: number): ProjectListItem | undefined;

/** Items whose search text contains every word of `query` (case- and accent-insensitive) and that match `type`. */
export function filterItems(items: readonly ProjectListItem[], query: string, type: TypeFilter): ProjectListItem[];

/** A new array, sorted; ties broken by name, then key, so the order is stable. */
export function sortItems(items: readonly ProjectListItem[], order: SortOrder): ProjectListItem[];

/** The first file whose name or description matches every word not already matched by the project name/description; undefined if the hit is in the project itself. */
export function fileHit(item: ProjectListItem, query: string): CatalogFile | undefined;

/** Reads/writes the remembered choices (§ 4.4); bad or missing JSON gives the defaults. */
export function parseProjectsPagePrefs(json: string | null): { type: TypeFilter; sort: SortOrder; view: ProjectsView };

/**
 * "4 days ago", "2 weeks ago", "yesterday": Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
 * with the largest unit of year/month/week/day/hour/minute/second that fits. A time in the future
 * (clock skew) reads as now. `now` is a parameter so tests are stable.
 */
export function relativeTime(iso: string, now: number = Date.now()): string;
```

### 5.3 Search rules

- Normalise: `text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()`.
- Words: the query split on whitespace, empty words dropped. Empty query → every item matches.
- An item's search text = name + description + every file name + every file description (+ the owner
  login for GitHub items), joined with spaces.
- An item matches when **every** word is a substring of its search text (AND, like `filterExamples`).
- Type filter: `'all'` → all; `'vhdl'` → items whose `languages` includes `'vhdl'` (mixed projects
  match both filters); same for `'verilog'`.

### 5.4 Sort rules

- `'newest'`: `updatedAt` descending; items with `updatedAt === ''` last.
- `'oldest'`: `updatedAt` ascending; items with `updatedAt === ''` last.
- `'name'`: `name.localeCompare(other.name, undefined, { sensitivity: 'base', numeric: true })`.

### 5.5 Required unit tests (`projectCatalog.test.ts`)

1. `languagesOf(['a.vhd','b.v','c.vhdl','x.txt'])` → `['vhdl','verilog']`; `languagesOf([])` → `[]`.
2. Search `"counter"` matches an item whose only hit is a **file description**.
3. Search `"cöunter ENABLE"` matches `counter.vhd — "4-bit counter with enable"` (accent + case, AND).
4. Search `"counter xyz"` does not match (AND).
5. Type `'verilog'` keeps Verilog-only and mixed items, drops VHDL-only and no-language items.
6. `'newest'`/`'oldest'` put unknown dates last; equal dates sort by name.
7. `'name'` sorts `lab2` before `lab10` (numeric).
8. `itemFromIndexEntry` without `files` gives `files: []`, `languages: []`.
9. `itemFromProjectFile` with invalid JSON → `undefined`.
10. `parseProjectsPagePrefs('{"view":"grid","sort":"bogus"}')` → `{type:'all', sort:'newest', view:'grid'}`;
    `parseProjectsPagePrefs(null)` → `{type:'all', sort:'newest', view:'compact'}`; `'{"view":"table"}'` → `'compact'`.
11. `fileHit` returns the file for a file-only hit, `undefined` when the name matches.
12. `relativeTime` with a fixed `now` (use `new Intl.RelativeTimeFormat('en', …)` output for the
    expected strings, or run the test with locale `en`): 4 days earlier → `4 days ago`; 9 days →
    `last week`; 30 s in the future → `now`.

## 6. The local projects folder

### 6.1 What is scanned

The Projects folder itself and each **direct** subfolder (depth 1). In each, every file whose name
ends in `.hdlboard.json` is read and becomes one item (`itemFromProjectFile`). Deeper folders are
not scanned. Hard limits: at most **200** project files and **1 MB** per project file; beyond that the
rest is skipped and the status line says `Showing the first 200 projects`. Files that fail to parse
are counted, and the status line shows `1 file could not be read` with a `title` listing the names.

The scan runs: when the page opens, on **Refresh**, after the folder changes, and after
`handleSaveProject` succeeds while the page is closed (cheap; just mark the list stale and rescan on
next open).

### 6.2 Windows app (Electron) — the default and best case

Default folder: `<Documents>\HDLBoard Projects` (`app.getPath('documents')`). It is created on first
use (`fs.mkdirSync(…, {recursive:true})`). The chosen folder is stored in the existing
`<userData>/settings.json` as `"projectsFolder"`.

Add to `HdlBoardBridge` in `desktop.ts` (all optional, feature-detected like the others):

```ts
/** The local projects folder (created if missing) and its project files, depth ≤ 1 (§ 6.1). */
listLocalProjects?(): Promise<{
  folder: string;
  projects: { path: string; text: string; modifiedMs: number }[];
  skipped: { path: string; reason: string }[];
  truncated: boolean;
}>;
/** Shows the system folder picker; the chosen folder becomes the projects folder. null when cancelled. */
chooseProjectsFolder?(): Promise<string | null>;
/** Opens Explorer with the file selected (shell.showItemInFolder). */
showInFolder?(path: string): Promise<boolean>;
```

`preload.js`: expose them as `ipcRenderer.invoke('hdlboard:list-local-projects')`,
`'hdlboard:choose-projects-folder'`, `'hdlboard:show-in-folder'` (path as `String(path)`).

`main.js` (register next to `registerLocalFileIpc`, every handler starts with `fromApp(event)`):
- `list-local-projects`: read folder from settings (or the default), `mkdirSync` it, `readdirSync`
  with `withFileTypes`, the folder + depth-1 directories, `*.hdlboard.json` only, `statSync` size
  ≤ 1 MB, `readFileSync(…, 'utf8')`, `mtimeMs`. Stop after 200. Errors per file go to `skipped`;
  never throw for one bad file. Skip symlinked directories (`dirent.isSymbolicLink()`).
- `choose-projects-folder`: `dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'], defaultPath: current })`; save to settings; return the path or `null`.
- `show-in-folder`: only for an absolute path ending in `.hdlboard.json` (reuse `localFilePath` checks), then `shell.showItemInFolder(path)`.

Opening a local item in the Windows app = existing `openProjectFrom(item.location)` (a path; it reads
the project's files next to it and Save project writes back there).

### 6.3 Browser with folder access (Chrome, Edge: `canPickFolder()`)

- **Choose folder…** → `showDirectoryPicker({ id: 'hdlboard-projects', mode: 'readwrite' })`.
- Store the `FileSystemDirectoryHandle` in IndexedDB (database `hdlboard`, store `handles`, key
  `projectsFolder`) — new tiny module `src/components/workbench/projectsFolderStore.ts` with
  `loadProjectsFolder(): Promise<FileSystemDirectoryHandle | null>` and
  `saveProjectsFolder(handle): Promise<void>`; all IndexedDB errors → treat as "no folder".
- On page open: load the handle; `await handle.queryPermission({ mode: 'readwrite' })`:
  `'granted'` → scan; `'prompt'` → status line shows **Allow access to <name>**, whose click calls
  `requestPermission({ mode: 'readwrite' })` then scans (a user gesture is required); `'denied'` → as
  if no folder.
- Scan with `for await (const [name, child] of handle.entries())`, same rules as § 6.1;
  `location` = `${handle.name}/${sub}/${file}`; `modifiedMs` = `(await fileHandle.getFile()).lastModified`.
- Opening a local item: read the project file and all files directly in its folder
  (`File` objects from the sub-directory handle), then call the existing
  `openProjectText({ text, location, localFiles }, undefined, 'whenEmpty')` and set
  `saveFolderRef.current` to that sub-directory handle, so **Save project** writes back to it without
  asking. (`FileSystemDirectoryHandle` already satisfies `PickedFolder`.)

### 6.4 Browser without folder access (Firefox, Safari)

- **Choose folder…** opens a hidden `<input type="file" webkitdirectory multiple>` (same trick as
  `MissingFilesCard` in `ProjectPage.tsx`). The chosen files are scanned in memory (paths from
  `webkitRelativePath`, depth rule § 6.1 counted from the chosen folder).
- Nothing is remembered: after a reload the list shows **Choose folder…** again. The status line
  says `Chosen for this visit only`.
- Opening a local item = `openProjectUpload(projectFile, filesInSameFolder)` (existing).

### 6.5 Hook: `useLocalProjects.ts`

```ts
export interface LocalProjects {
  /** null until the first scan finished (or when there is no folder). */
  items: ProjectListItem[] | null;
  /** 'none' | 'needs-permission' | 'ready' — drives the status line. */
  folderState: 'none' | 'needs-permission' | 'ready';
  /** Display name: full path (Windows app) or folder name (browser). */
  folderLabel: string;
  scanning: boolean;
  error: string | null;
  skipped: { path: string; reason: string }[];
  truncated: boolean;
  /** Whether the folder is remembered (Windows app, Chrome/Edge) or only for this visit. */
  remembered: boolean;
  rescan(): void;
  chooseFolder(): void;          // must be called from a click
  allowAccess(): void;           // must be called from a click
  /** Reads what is needed to open the item; the Workbench then opens it (§ 8). */
  readForOpen(item: ProjectListItem): Promise<LocalOpenRequest>;
}

export type LocalOpenRequest =
  | { kind: 'path'; path: string }                                         // Windows app
  | { kind: 'handle'; text: string; location: string; localFiles: ProjectSourceFile[]; folder: PickedFolder }
  | { kind: 'files'; projectFile: File; others: File[] };                  // Firefox/Safari
```

The hook picks the implementation once: Windows bridge if `listLocalProjects` exists, else
`canPickFolder()`, else the input fallback.

## 7. GitHub index: remember file descriptions

Search must find words in **file descriptions** of GitHub projects too. The index gist
(`Repo.HDLBoard.json`) only holds name and description today. Add one optional field:

```ts
export interface IndexEntry {
  // …existing fields…
  /** The project's files and their descriptions, written on every save; missing in older indexes. */
  files?: { name: string; description: string }[];
}
```

- `projectIndex.ts` `parseEntry`: read `files` when it is an array of `{name: string, description: string}`;
  otherwise leave it `undefined` (never fail the whole index for it). `serializeIndex` writes it as is.
  The index `version` stays **1** (the field is optional; old HDLBoard ignores it).
- `ProjectSnapshot` (`projectGists.ts`) has no descriptions today. Add a field
  `entries: { name: string; description: string }[]` and fill it in `projectSnapshot()`
  (`projectGitHub.ts`) from `projectEntries(stored, fileNames)` (name + description; **not** the
  file contents). Update the test helpers that build snapshots by hand.
- `projectGists.ts` `indexEntryFor(snapshot, gist)`: add `files: snapshot.entries`.
- Tests in `projectIndex.test.ts`: round-trip with `files`; an entry without `files` still parses;
  an entry with a broken `files` value parses with `files: undefined`.
- Projects saved before this change show no languages and are found by name/description only, until
  they are saved again. That is acceptable; do not fetch every gist to fill it in.

## 8. Opening an item

Common to both sources, in `Workbench.tsx` (`handleOpenListedProject(item)`):

1. If the item is already the open project (same `gistId`, or same local `location`), just close the
   Projects page and show the editor.
2. If a project is open with unsaved changes (`projectUnsaved`) or changes not on GitHub
   (`gitHubSync === 'changed'`), `window.confirm('Open <name>?\n\n<open name> has changes that are not saved. They are lost when another project opens.')`.
   (For GitHub items `gitHubProjects.open` already asks about GitHub changes; ask only once — call
   `open` after your own confirm only when it would not ask again, or pass through and let it ask.)
3. GitHub item → `gitHubProjects.open(item.entry!)`. Local item → `localProjects.readForOpen(item)`,
   then the matching existing path (§ 6.2–6.4).
4. On success the overlay becomes `null` (editor), or `'project'` when the opened project has
   problems (the existing `ProjectPageWhen` logic in `applyOpenedProject` already decides this — make
   sure it is not overwritten by the Projects page closing; set overlay to `null` **before** opening).
5. While opening, the item's **Open** button shows a spinner and every Open button is disabled
   (`gitHubProjects.busy !== null || projectBusy !== null`).

## 9. Wiring in the app

### 9.1 `Workbench.tsx`

- `overlay` type: `'examples' | 'project' | 'projects' | null`.
- Render, next to `ProjectPage` and `ExamplesPane` inside `.wb-center`:
  ```tsx
  {overlay === 'projects' && (
    <ProjectsPage
      connection={gitHub}
      gitHubProjects={gitHubProjects}
      localProjects={localProjects}
      openProject={project && { name: project.name, gistId: project.gist?.gistId, location: project.location, syncState: gitHubSync, unsaved: projectUnsaved }}
      opening={projectBusy !== null || gitHubProjects.busy !== null}
      onOpenItem={(item) => void handleOpenListedProject(item)}
      onNewProject={handleStartProject}
      onShowProjectPage={() => setOverlay('project')}
      onSignIn={() => setDialog('githubSignIn')}
      onClose={() => setOverlay(null)}
    />
  )}
  ```
- `dialog === 'github'` → rename to `'githubSignIn'` and render `<GitHubSignInDialog connection={gitHub} onClose={…} />`.
- `useGitHubProjects({ … showSignIn: () => setDialog('githubSignIn') })`.
- When a sign-in finishes (`gitHub.session` goes from `null` to a session) while
  `dialog === 'githubSignIn'`: close the dialog and set overlay `'projects'` (a `useEffect` on
  `gitHub.session`).
- Remove the `GitHubDialog` import; `openGistProject` no longer needs to close a `'github'` dialog —
  close the Projects page instead (`setOverlay((o) => (o === 'projects' ? null : o))`).

### 9.2 `GitHubSignInDialog.tsx` (new, from `GitHubDialog.tsx`)

Move `SignInPanel`, `Waiting`, `SignedOut`, `DeviceCodeSteps`, `TokenSignIn` unchanged. Dialog:
`title="Sign in to GitHub"`, `subtitle="Keep your projects on GitHub, and open them on any computer"`,
`icon={<GitHubIcon />}`, size **default** (not `wide`). Keep the `prepare()`-once effect. When the
session exists it renders nothing (the effect in § 9.1 closes it). Delete `GitHubDialog.tsx`; move its
`Account` and `CurrentProject` into `ProjectsPage.tsx` (restyled per § 4.1/4.2). Keep CSS classes in
`GitHub.css` that the sign-in parts use; delete the ones only the old list used
(`wb-github__list*`, `wb-github__row*`) after checking with grep that nothing else uses them.

### 9.3 Header GitHub button (`Header.tsx`)

- Signed out: label `GitHub`, `title="Sign in to GitHub to save your projects there"`, click → `GitHubSignInDialog`.
- Signed in: avatar + login (unchanged look), `title="Your projects"`, click → overlay `'projects'`
  (toggle: a second click closes it).

### 9.4 Explorer (`FileExplorer.tsx`)

- **Open Project** button → overlay `'projects'` (prop `onOpenProject` keeps its name; Workbench
  passes the new handler). Title: `Open Project: your projects on this computer and on GitHub`.
  `aria-pressed` when the Projects page is showing.
- The Projects page footer (§ 4, G) keeps the old way in: text button **Open from a URL or path…**
  → the existing `OpenProjectDialog` (`setDialog('openProject')`). Nothing is lost.

### 9.5 Footnote (G)

`InfoIcon` + muted 13 px text:
`Local projects are the project files in your projects folder and the folders directly inside it.
Projects on GitHub are stored as secret gists on your account.` + the text button from § 9.4.

## 10. New icons (`icons.tsx`)

Use `OutlineIcon` (24×24, stroke 2, Lucide geometry) so they match `ProjectIcon`, `RefreshIcon` etc.
The mockup contains the exact paths — copy them from there.

| Export | Picture | Used for |
|--------|---------|----------|
| `CodeIcon` | `</>` | Project tile |
| `LaptopIcon` | a laptop | Local badge, local folder line |
| `ListIcon` | 3 lines with dots | Details view |
| `GridIcon` | 2×2 squares | Small icons view |
| `MoreIcon` | 3 vertical dots | `⋮` menu |
| `RowsIcon` | a box with 2 horizontal lines | Compact list view |
| `ArrowDownIcon` | an arrow down | Sorted column in the compact list |
| `ClockIcon` | a clock | "Updated …" |
| `PersonIcon` | a person | owner |

(`PlusIcon`, `SearchIcon`, `FolderOpenIcon`, `OpenInIcon`, `GitHubIcon`, `SignOutIcon`, `CloseIcon`,
`RefreshIcon`, `CopyIcon`, `DeleteIcon`, `CloudUploadIcon`, `ProjectIcon`, `InfoIcon`, `FileIcon`,
`ChevronDownIcon` already exist.)

## 11. Accessibility and keyboard

- The page is a `<section aria-labelledby="wb-projects-title" tabIndex={-1}>`; **Escape** closes it
  (but not while the `⋮` menu is open, and not when the Escape came from a `<select>` that is open).
- Focus goes to the search field on open; when the page closes focus returns to the button that
  opened it (store `document.activeElement` on open).
- `Ctrl+F` / `/` while the page is open focuses the search field (prevent the browser's find only
  for `Ctrl+F` when focus is inside the page).
- Every icon-only button has an `aria-label`; source badges include text (`Local` / `GitHub`) or, in
  grid view, a visually hidden text.
- The list announces result counts: a visually hidden `<p role="status">` with `Showing 2 of 8 projects`.
- Text contrast ≥ 4.5:1 (all colours in § 4.9 were picked for that on white).

## 12. Implementation order (each step: typecheck + tests green, app runs)

1. **Pure logic**: `projectCatalog.ts` + `projectCatalog.test.ts` (§ 5).
2. **Index files field**: `projectIndex.ts`, `projectGists.ts`, tests (§ 7).
3. **Icons**: add the 9 icons (§ 10).
4. **Sign-in dialog split**: create `GitHubSignInDialog.tsx`; Header/Workbench use it; the old
   dialog's signed-in panel temporarily still reachable — then step 5 replaces it.
5. **Projects page, GitHub only**: `ProjectsPage.tsx` + `ProjectsPage.css` with A–D, F, G using only
   GitHub items; delete `GitHubDialog.tsx`; Explorer Open Project and header wired (§ 9).
6. **Local folder, Windows app**: bridge methods (§ 6.2) + `useLocalProjects` (Windows branch) + E line.
7. **Local folder, browsers**: § 6.3 and § 6.4 branches, `projectsFolderStore.ts`.
8. **Polish**: `⋮` menu, compact list and grid views, skeletons, empty/error states, responsive rules, remembered prefs.
9. **Docs**: update `docs/GITHUB.md` (no more GitHub dialog; the Projects page), `docs/PROJECTS.md`
   (Open Project → Projects page; projects folder), `src/components/workbench/README.md` (new files).

## 13. Acceptance criteria (check them in the running app)

Run with `scripts\start-windows.cmd` (browser) and in the Windows app build.

1. The header GitHub button **never** opens a large modal: signed out it opens the small sign-in
   dialog; signed in it opens the Projects page.
2. Explorer **Open Project** opens the Projects page; Escape and × close it and the editor is as before.
3. Signed out, the page shows the **Connect GitHub** card; **Sign in with GitHub** opens the sign-in
   dialog; after signing in, the dialog closes and the page shows avatar, name and **Sign out**.
4. **New project** has a plus icon (no GitHub mark) and opens the Project page with a new, empty project.
5. Local projects in the projects folder (and one level down) are listed with the laptop icon and
   **Local**; GitHub projects with the GitHub mark and **GitHub**.
6. Typing a word that appears only in a **file description** finds the project and shows the
   matching file under it — for local projects, and for GitHub projects saved after § 7.
7. **All types / VHDL / Verilog** filters; a project with both languages appears under both.
8. **Newest first / Oldest first / Name A–Z** sort as § 5.4.
9. The page first opens in the compact list. The Compact list / Small icons / Details switch (in that
   order) changes the layout; type, sort and view survive a reload. In the compact list, clicking *Project name* or *Last saved* sorts and the Sort select follows.
10. **Open** on a local project in the Windows app opens it and **Save project** writes back into its
    folder; in Chrome after **Allow access** the same; in Firefox via **Choose folder…**.
11. **Open** on a GitHub project opens it (as today from the dialog).
12. The open project is marked **Open now** in the list, and the **Open now** card shows its GitHub
    state and unsaved state.
13. At 700 px and 420 px wide centre panes nothing overflows horizontally.
14. `npm run typecheck`, `npm test` pass; no `GitHubDialog` import remains (`grep -r GitHubDialog src`
    finds only `GitHubSignInDialog`).

## 14. Out of scope

- Merging a local project and its GitHub copy into one row (both rows show; each opens its own copy).
- Deleting or renaming local projects from this page.
- Thumbnails/previews of project contents.
- GitHub *repositories* (HDLBoard uses gists only; see `docs/GITHUB.md`).
- The storage-model work in `hdlboard_project_panel_gist_spec.md` (branch `project_page_touchup`).

## 15. As built (differences from the text above)

- **Search hit in the compact list** is the file's name in bold followed by its description, not `<mark>`-highlighted words (the mockup highlights; the app does not).
- **Busy and success messages** of the GitHub actions use the existing `Activity` line under the Open now card; only *errors* use the red banner with **Try again** (the local scan's error too).
- **Opening** does not clear the overlay first: a successful open sets it itself (`applyOpenedProject`), and a failed one leaves the page open with the reason in the "Project not opened" dialog.
- **Show in Explorer** reaches the page as the prop `onShowInFolder` (present only in the Windows app) instead of the page asking `desktopBridge()` itself.
- **Escape** closes the page while focus is inside it; the ⋮ menu takes its own Escape first.
- **Not verified in this build:** the Electron side (`main.js` is syntax-checked only), and the Firefox / Safari folder input.
