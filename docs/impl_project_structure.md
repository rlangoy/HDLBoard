# Project folders: `projectDirectory` and `sourceDirectory` — Implementation Specification

> Licensed under the [GNU General Public License v2.0](../LICENSE).

| | |
|---|---|
| **Document** | `docs/impl_project_structure.md` |
| **Version** | 1.3 |
| **Changes in 1.3** | Third review: the project file can clash too (AC-18); all plan comparisons ignore case, and a case-only change is the same place, not a move (§ 6.5); `exists` comes from two folder listings (`list-folder-files` replaces `local-file-exists`); an invalid `projectDirectory` repairs itself instead of blocking Save (§ 3.2); `planDiskSave` takes the current project file text; opening a project zip described (§ 6.7); `diskLayout` ignores new files; a failed save converges on the next one; the `webkitdirectory` segment filter (§ 6.8). |
| **Changes in 1.2** | Second review: Remove-folder button for a folder a save emptied (D13, § 7); hint when the project file was renamed outside HDLBoard; the clash dialog lists full relative paths; the "no delete on failure" rule is its own bullet (§ 6.5); the AC-15 test is named after the criterion. |
| **Status** | Ready for implementation |
| **Changes in 1.1** | After review: Q1–Q4 decided (D20–D23); file names unique per project stated (D24); zip keeps project-relative paths (D25); `projectDirectoryOf` and `diskLayout` helpers (§ 6.1); delete failures defined (§ 6.5); why validation follows Windows (§ 6.2); performance target (§ 6.12); AC-13 to AC-17. |
| **Branch** | `imp_project_structure` |
| **Extends** | [`Impl_project_file_and_online_storage.md`](Impl_project_file_and_online_storage.md) § 4 (file format) and § 5 (file resolution); [`PROJECTS.md`](PROJECTS.md) |
| **Target** | HDLBoard (`src/project/`, `src/components/workbench/`), Windows app (`winInstaller/electron/main.js`) |

---

## Contents

1. [Summary](#1-summary)
2. [Decisions](#2-decisions)
3. [File format](#3-file-format)
4. [Where the folders apply](#4-where-the-folders-apply)
5. [Current code you need to know](#5-current-code-you-need-to-know)
6. [Design](#6-design)
7. [User interface](#7-user-interface)
8. [Test plan](#8-test-plan)
9. [Implementation steps](#9-implementation-steps)
10. [Acceptance criteria](#10-acceptance-criteria)
11. [Open questions](#11-open-questions)

---

## 1. Summary

On **local disk**, each project keeps its files in its own folder next to the project file, so several projects can share one folder without file name clashes:

```
CommonFolder/
├── fantasicleds.hdlboard.json
├── fantasicleds/src/
│   ├── DE1_SoC.vhdl
│   └── led_controller.vhdl
├── not_so_fantasicleds.hdlboard.json
└── not_so_fantasicleds/src/
    ├── DE1_SoC.vhdl
    └── led_controller.vhdl
```

Two new fields in `.hdlboard.json` say where: `projectDirectory` (derived from the project file name, not editable) and `sourceDirectory` (default `src`, editable on the project page). GitHub gists, web addresses and `?project=` links stay **flat**, as today; they only carry the two fields. Existing flat projects on disk are converted on **Save project**. **Download All** — and **Save project** in Firefox and Safari — produce one `.zip` with the full folder layout.

---

## 2. Decisions

| # | Decision |
|---|---|
| D1 | Two new top-level fields: `projectDirectory` and `sourceDirectory`. Both are always written to the project file, wherever it is stored. |
| D2 | `projectDirectory` is the project file name without `.hdlboard.json` (e.g. `fantasicleds.hdlboard.json` → `fantasicleds`). It is not editable on the project page. |
| D3 | `sourceDirectory` defaults to `src` and is editable on the project page. |
| D4 | Project files are stored at `<projectDirectory>/<sourceDirectory>/<name>`, relative to the project file. Only the `.hdlboard.json` itself is outside `projectDirectory`. |
| D5 | Both fields must be **one** folder name: no `/` or `\`, no `..`, no absolute path or drive letter, not empty, none of the characters forbidden in file names (§ 6.2). |
| D6 | The folders apply **only to local disk** (the Windows app, a folder in Chrome/Edge, and `.zip` files). Gists, web addresses, HDLBoard site paths, `?project=` and *Open from a URL or path* stay flat; the two fields are kept in the project file but ignored there. |
| D7 | `?project=` and *Open from a URL or path* keep accepting everything they accept today (gist, any web address, site path, Windows path). |
| D8 | A gist or URL project saved to local disk is written into the folder layout from its stored fields. A local project saved to GitHub is uploaded flat, with the fields unchanged in its project file. |
| D9 | An existing **flat project on disk** is converted on **Save project**: its files are **copied** into `<projectDirectory>/<sourceDirectory>/`. The old flat files are left alone, with no message about them. |
| D10 | Changing `sourceDirectory` on the project page **moves** the files to the new folder on **Save project**. |
| D11 | Renaming the project **file** updates `projectDirectory` and **moves** the files to the new folder on **Save project**. Renaming the project's display `name` changes nothing on disk. |
| D12 | A move into a folder that already has a file with the same name **asks whether to overwrite**. |
| D13 | An emptied old folder is **left in place**. The project page then offers to remove it, but only on request (§ 7). |
| D14 | On an error, a message says what happened (which file or folder, which step). When a file or folder is missing, the user can look for it. |
| D15 | **Download All** saves one `.zip` with the full folder layout, in every browser and in the Windows app. |
| D16 | In **Firefox and Safari**, **Save project** downloads the same `.zip` instead of one download per file. |
| D17 | Projects page: `<projectDirectory>/` folders are not listed as projects or loose files; their files stay searchable by name and visible to the VHDL/Verilog filter. |
| D18 | With a project open, new files (Create Project, **+** New File, Upload File) belong in `<projectDirectory>/<sourceDirectory>/`. |
| D19 | The new fields are optional when reading (§ 3.2). |
| D20 | A project zip holds only the project: the project file and the project's files. Files in Files that are not in the project are left out. |
| D21 | After a rename of the project file is saved, the old `.hdlboard.json` is deleted, as part of the move. |
| D22 | Folder names are compared case-insensitively, like file names. Changing only the case of the source folder renames it. |
| D23 | `version` stays `1` (§ 3.2 gives the reasons). |
| D24 | File names are unique within a project, compared case-insensitively. `parseProject` already skips duplicates; this stays a rule, and everything keyed by `nameKey` (such as `onDisk`) relies on it. |
| D25 | The zip keeps every file's path relative to the project file. Anything the project later stores elsewhere in `<projectDirectory>/` goes in at its own path, so the zip layout never needs another migration. |

---

## 3. File format

### 3.1 Structure

```json
{
  "version": 1,
  "name": "Fantasic_Leds",
  "board": "DE1-SoC",
  "description": "Show the status of the LEDS",
  "projectDirectory": "fantasicleds",
  "sourceDirectory": "src",
  "files": [
    { "name": "DE1_SoC.vhdl", "url": "", "description": "Show Switch status on the LED's" }
  ]
}
```

- `files[].name` stays a **bare file name** (§ 5.1 of the format spec). It never contains a folder, and it is unique within the project (D24).
- Field order when written: `version`, `name`, `board`, `description`, `projectDirectory`, `sourceDirectory`, `files`.

### 3.2 Reading

| In the file | Result |
|---|---|
| Both fields present and valid | Used as they are. |
| A field missing | `projectDirectory` → the project file name without `.hdlboard.json` (or `projectFolderName` of the project name when there is no file name yet); `sourceDirectory` → `src`. No warning. |
| `sourceDirectory` present but invalid (§ 6.2) | Warning on open; `src` is used for reading. Save project is blocked until the field is fixed on the project page. |
| `projectDirectory` present but invalid (§ 6.2) | Treated as missing: warning on open, the derived name is used for reading, and the next save writes the derived name, so the file repairs itself. Save is **not** blocked, because the page cannot edit this field (D2). |
| `projectDirectory` differs from the project file name (renamed in Explorer, say) | The stored value is used to **find** the files. On the next save the files move to the derived name (D2, D11). |

Older HDLBoard builds ignore unknown top-level fields (`parseProject` only reads the fields it knows), so they still open the file, but they look for the files next to the project file and report them "Not found".

**Why the version stays 1 (D23):** the format is unchanged everywhere projects are shared — gists, web addresses and `?project=` links stay flat. Older builds open those correctly. With `version: 2`, every older build would refuse every new project, including the gists that it can read without trouble. Only a project in a folder on disk is affected. There an older build shows the files as "Not found" and loses nothing: the files are still on disk. The changelog states the first version that reads the folder layout.

---

## 4. Where the folders apply

| Where the project is | Read from | Written to |
|---|---|---|
| Folder on disk — Windows app, by path | `<pd>/<sd>/<name>`, else flat `<name>` (§ 6.4) | `<pd>/<sd>/<name>` |
| Folder on disk — Chrome/Edge folder access | same | same |
| Folder chosen with *Choose project folder…* / Upload File / drag and drop | same, matched by relative path | — (read only) |
| `.zip` (Download All, Firefox/Safari Save project) | same, inside the archive | `<pd>/<sd>/<name>` inside the archive |
| GitHub gist | flat (unchanged) | flat (unchanged) |
| Web address, site path, `?project=` | flat, relative to the project file URL (unchanged) | — |

`<pd>` = `projectDirectory`, `<sd>` = `sourceDirectory`. Entries with a non-empty `url` are downloaded from it, as today; their local copies go to `<pd>/<sd>/<name>` like any other file.

---

## 5. Current code you need to know

| Code | What it does today | Change |
|---|---|---|
| `src/project/types.ts` | `HdlBoardProject`: version, name, board, description, files | Add the two fields |
| `src/project/parseProject.ts` | `parseProject`, `serializeProject`; ignores unknown fields | Read, validate, default and write the fields |
| `src/project/fileName.ts` | `fileNameProblem`, `projectFolderName` | Add `folderNameProblem`; `projectFolderName` gives the default `projectDirectory` |
| `src/project/resolveSource.ts` | `resolveSource(entry, location)`: URL or `name` next to the project file | Add the disk path variant |
| `src/components/workbench/projectFile.ts` | `OpenProject`; `openProject` reads entries from `localFiles` (by name), `readLocal(name)` or the URL; `parseStoredProject` restores the desktop workspace | Carry the fields and where each file is on disk; read by relative path with flat fallback |
| `src/components/workbench/projectSave.ts` | `projectSaveFiles` (flat list), `PickedFolder` (`getFileHandle` only), `writeToFolder`, `downloadEach` | Save plan with paths; folder handles; delete; `downloadEach` replaced by the zip |
| `src/components/workbench/Workbench.tsx` | `handleSaveProject` (≈ line 1027): desktop path → picked folder → one download per file. `handleDownloadAll` (≈ line 574). Opening by path (≈ lines 732, 795) | Run the save plan; zip for Firefox/Safari; read by relative path |
| `src/components/workbench/download.ts` | `projectZipEntries` puts files under their Files folders (`vhdl/`, `verilog/`, `work/`); the project file goes at the top | Project layout in the zip (§ 6.7) |
| `src/components/workbench/zipUpload.ts` | `filesInZip` flattens every entry to its base name | Keep the archive path too |
| `src/components/workbench/chosenFolder.ts` | `filesDirectlyInFolder` keeps only top-level files ("a project is flat") | Also keep `<pd>/<sd>/` files of the project |
| `src/components/workbench/localProjectScan.ts` | `scanFolder`, `scanChosenFiles`: project files in the folder and the folders directly inside it; `others` = files in the same folder | `others` includes the project's `<pd>/<sd>/` files; handle source reads subfolders |
| `src/components/workbench/fileSystemAccess.ts` | `pickFolderOf`, `pickProjectsFolder` | Directory handles for reading subfolders |
| `src/github/projectGists.ts` | Saves/opens a project as a flat gist | No layout change; the project file text must carry the fields |
| `winInstaller/electron/main.js` | `read-local-file`, `write-local-file` (creates folders), `list-local-projects` | Add `list-folder-files`, `delete-local-file` and `remove-empty-folder` (§ 6.6, § 7) |
| `src/components/workbench/ProjectPage.tsx` | Edits name, board, description, file name, entries | Show `projectDirectory`, edit `sourceDirectory` (§ 7) |

---

## 6. Design

### 6.1 Data model

`src/project/types.ts`:

```ts
export const DEFAULT_SOURCE_DIRECTORY = 'src';

export interface HdlBoardProject {
  version: number;
  name: string;
  board: string;
  description: string;
  projectDirectory: string;
  sourceDirectory: string;
  files: ProjectFileEntry[];
}
```

`OpenProject` (`projectFile.ts`) gains:

```ts
  /** The source folder the project file names, editable on the project page (D3). */
  sourceDirectory: string;
  /**
   * Where each file of the project is on local disk now, by nameKey, as a path relative to
   * the project file's folder: `fantasicleds/src/DE1_SoC.vhdl`, or `DE1_SoC.vhdl` for a flat
   * project. Set when the file is read from disk or saved there; missing for a project that
   * is not on disk (gist, URL, new), and for a file that is new since then.
   */
  onDisk?: Record<string, string>;
  /** The project file's name on disk as last opened or saved, so a rename is seen as a move (D11). */
  onDiskFileName?: string;
```

`projectDirectory` is **not** stored in `OpenProject`. It is always derived from the file name (D2), so a stored copy could only ever disagree with it. The value read from the project file matters only once, at open, to find the files; where they were found is then in `onDisk`. Two helpers give everything else one place to ask:

```ts
/** The project folder: the project file name without `.hdlboard.json` (D2). */
export function projectDirectoryOf(project: OpenProject): string;

/**
 * How the project is stored on disk now, from `onDisk`: 'none' (not on disk: a gist, a URL,
 * or a new project), 'flat', 'folders' (every file at its target), or 'mixed' (some files
 * flat or in an old folder: the next save copies or moves them).
 */
export function diskLayout(project: OpenProject): 'none' | 'flat' | 'folders' | 'mixed';
```

`diskLayout` is derived, not stored, for the same reason. The project page hints (§ 7) and the tests use it. Files with no `onDisk` entry (added since the last save) do not count: a project stored in folders with some new files is 'folders', not 'mixed'. 'mixed' means at least one file sits flat or in an old folder.

`parseStoredProject` keeps `sourceDirectory`, `onDisk` and `onDiskFileName`, so the Windows app restores them with the workspace.

### 6.2 Folder name validation

`src/project/fileName.ts`:

```ts
/** Why `name` is not a valid project or source folder name (D5), or null. */
export function folderNameProblem(name: string): string | null;
```

Rejects:

- empty or whitespace only;
- `.` or `..`, and any `..`;
- `/` or `\` (one folder only, D5);
- `:` (drive letters, `C:`), and the other characters in `FORBIDDEN_NAME_PARTS`;
- a trailing dot or space (Windows drops them);
- Windows reserved names `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, with or without extension.

Folder names are compared case-insensitively, like file names (`nameKey`, D22).

The rules follow Windows, which is stricter than Linux and macOS. That is deliberate: a project saved on any system must open on any other, and most students use Windows. The error message says so, for example: `"CON" cannot be a folder name on Windows`.

### 6.3 Paths

`src/project/resolveSource.ts`:

```ts
/** `<projectDirectory>/<sourceDirectory>/<name>` — always `/`; the Windows app converts. */
export function diskPath(projectDirectory: string, sourceDirectory: string, name: string): string;
```

Paths inside HDLBoard always use `/`. `pathInFolder` (`projectLocation.ts`) and the Windows app turn them into `\` paths.

### 6.4 Opening a project from disk

`openProject` (`projectFile.ts`):

- `ProjectSource.localFiles` entries get an optional `path` (relative to the project file's folder: `fantasicleds/src/DE1_SoC.vhdl`). Matching uses `path` first, then the bare name.
- `ProjectSource.readLocal(relativePath)` takes a relative path instead of a bare name.

For each entry with an empty `url`, on disk:

1. Try `<pd>/<sd>/<name>`, with `<pd>`/`<sd>` as read from the file (§ 3.2).
2. Else try the flat `<name>` next to the project file.
3. Else leave it unloaded: `Not found in fantasicleds/src or next to the project file.` The project page's existing **Choose project folder…** lets the user look for it (D14).

The path that worked goes into `onDisk`. A project whose files were found flat is converted on the next save (D9).

Projects that are not on disk (gist, URL, `?project=`) are read exactly as today; `onDisk` stays empty.

### 6.5 Saving to disk: the save plan

A pure function decides every action before anything is written, so it can be unit tested without a disk:

```ts
// src/components/workbench/projectSavePlan.ts
export interface SavePlan {
  /** Every file to write, the project file last: relative path + text. */
  writes: { path: string; text: string }[];
  /** Files to delete after every write succeeded: the old place of a moved file (D10, D11). */
  deletes: string[];
  /** Write targets that already exist and are not the file's own place: ask first (D12). */
  clashes: string[];
}

export function planDiskSave(
  project: OpenProject,
  files: readonly SavedFile[],
  /** The current project file text from `projectFileText`; `savedText` is the last saved text and would be stale. */
  projectFile: { name: string; text: string },
  /** Relative paths on disk now, from one listing per folder (§ 6.6). */
  exists: ReadonlySet<string>,
): SavePlan;
```

**All path comparisons in the plan ignore case** ("same place", "clash", "exists"). They compare whole relative paths with `nameKey`, as file names are compared everywhere else (D22).

For each file of the project, the **target** is `diskPath(projectFolderName(project.fileName), project.sourceDirectory, name)`, and its **old place** is `onDisk[nameKey(name)]`:

| Old place | Action |
|---|---|
| none (new file, or a project from a gist/URL) | write the target |
| = target, ignoring case | write the target (a normal save); no delete, no clash |
| flat (no `/`) | write the target; **keep** the old file — copy (D9) |
| another folder path | write the target, then **delete** the old file — move (D10, D11) |

A change that only alters case (`src` → `Src`) is therefore the **same place**, not a move. This matters on Windows: there, writing `proj/Src/x.vhdl` lands in the existing `proj/src` folder, and a following delete of `proj/src/x.vhdl` would remove the file just written. The folder keeps its old case on disk. That is harmless, because every read also ignores case. Do not "fix" the folder's case later. On a case-sensitive file system a second folder can appear, which is accepted under the Windows-first rules of § 6.2.

Then:

- **Clash** (D12): a target that exists on disk and is not the file's own old place. The user is asked once, listing every clashing file: **Overwrite** or **Cancel**. Cancel saves nothing.
- **The project file itself can clash too**: renaming it to `<newName>.hdlboard.json` when that file already exists, and is not its own old place (`onDiskFileName`), puts it in `clashes`. Otherwise a rename could silently overwrite another project's file.
- **Renamed project file** (D11, D21): the new `.hdlboard.json` is written, and the old one goes into `deletes`.
- **Order**: all files first, then the project file, then the deletes.
  - If any write fails, **no delete runs** and the project file is not rewritten. The old project file still points at the old folder, where every file still is.
  - Only the paths in `deletes` are ever deleted: the old places of moved files, and the old project file after a rename.
  - A save that fails partway can leave extra copies in the target folder. They are harmless: the next save writes over its own copies, never makes duplicates, and completes the deletes, so the disk ends up with exactly the targets.
- Emptied folders are not removed (D13).
- After success: `onDisk` becomes the targets, `onDiskFileName` the project file name, and `withSaved` runs as today.

**When a delete fails** (the writes and the new project file already succeeded):

- The **new** place is the right one: the project file just written names it. The old copy is a stray file that no project refers to.
- The save counts as done. `onDisk` points at the targets, so the next save does not try that delete again and makes no further copies.
- The user gets a warning in Simulator Output that names every file left behind, so they can remove it by hand (§ 6.11). There is no dialog: nothing is lost and nothing has to be decided.

### 6.6 Running the plan

| Where | How |
|---|---|
| Windows app, project opened by path | `write-local-file` already creates folders (`mkdirSync … recursive`). Add `hdlboard:list-folder-files` (the file names in one folder, or none if the folder does not exist) and `hdlboard:delete-local-file` (same checks as `localFilePath`: absolute path, allowed extension). |
| Chrome/Edge, picked folder | Extend `PickedFolder` with `getDirectoryHandle(name, { create })`, `entries()` and `removeEntry(name)`. Write each path by walking its folders. |

**Building `exists`:** every target lies in at most two folders: the project file's folder, and `<pd>/<sd>/`. The caller lists each **once** and builds `exists` from those listings, instead of probing each target. That is two calls instead of 500. A listing also returns the names as they are cased on disk, which the case-insensitive comparisons need.
| Firefox/Safari | No disk access: download the `.zip` of § 6.7 (D16). `downloadEach` is removed. `onDisk` is not changed. |

The renderer never sends a path containing `..` to the Windows app: `folderNameProblem` already rejects it, and `delete-local-file` checks that the resolved path stays inside the project file's folder.

### 6.7 The `.zip`

`download.ts`: with a project open, `projectZipEntries` puts

- the project file at the top: `fantasicleds.hdlboard.json`;
- each project file at `fantasicleds/src/<name>`.

Files in Files that are **not** in the project are left out (D20). Every entry is the file's path relative to the project file, the same path Save project writes (D25). Without an open project, Download All is unchanged (`vhdl/`, `verilog/`, `work/`).

Reading a `.zip`: Upload File and drag and drop already open a project from a zip. `Workbench.tsx` unpacks it with `filesInZip`, and `pickProjectUpload` finds the project file and opens it with the other entries as its folder. What changes:

- `filesInZip` keeps each entry's archive path (as a `path` field next to the `File`), so `openProject` can match `fantasicleds/src/DE1_SoC.vhdl` exactly.
- Only a `.hdlboard.json` **at the top of the archive** counts as the project file. A zip without one keeps today's behaviour: its files are added to Files.
- A zip saved by an older build (flat, or `vhdl/…`) still opens through the bare-name fallback.

### 6.8 Folders chosen in a browser, and the Projects page

- `chosenFolder.ts`: `filesDirectlyInFolder` is replaced by a function that keeps the top-level files **and** the files under `<pd>/<sd>/` of the chosen project file, each with its relative path.
- `localProjectScan.ts`:
  - `scanChosenFiles`: `others` also takes the files under `<folder>/<pd>/<sd>/` of each project file. **Watch the segment filter:** `MAX_SEGMENTS = 3` admits project files at `root/sub/file`, but their files now sit one or two levels deeper (`root/<pd>/<sd>/file`, `root/sub/<pd>/<sd>/file`). The filter applies to project files only; `others` must be collected by path prefix, or the files are silently dropped.
  - The handle source (`{ kind: 'handle', folder }`) reads files through `getDirectoryHandle` for subfolders.
  - `<pd>` folders are only ever looked into for project files one level down, as today; they hold no `.hdlboard.json`, so nothing is listed from them (D17).
- After a conversion, the flat originals stay next to the project file (D9), so `others` holds both copies. Opening takes the `<pd>/<sd>/` copy, because the relative path wins (§ 6.4). The flat copy is never used, and the Projects page does not show it: the page lists projects from their project files, not loose files.
- `main.js` `listLocalProjects`: unchanged. Search and the VHDL/Verilog filter already use the file names inside the project file, not the folder contents, so files under `<pd>/<sd>/` stay searchable (D17).

### 6.9 GitHub

- `projectGists.ts` and `gistSavePlan.ts`: no change to what is stored; files stay flat (D6).
- The project file text written to the gist comes from `projectFileText`, which now includes `projectDirectory` and `sourceDirectory` (D8).
- Opening a gist: `onDisk` stays empty, so a later **Save project** writes everything into the folder layout.

### 6.10 New files

New files only live in the Files panel until **Save project**; the save plan writes them to `<pd>/<sd>/` (their `onDisk` is empty). No change in Create Project, New File or Upload File beyond the project page hint (§ 7).

### 6.11 Errors (D14)

Every failure is logged in Simulator Output with the step and the path, for example:

- `Project not saved: could not create the folder fantasicleds/src: <reason>.`
- `Project not saved: could not write fantasicleds/src/DE1_SoC.vhdl: <reason>. Nothing was deleted; fantasicleds.hdlboard.json still points to the old folder.` Copies written before the failure stay, and the next save tidies them (§ 6.5).
- `Saved fantasicleds.hdlboard.json. Could not remove the old copies, which you can delete yourself: fantasicleds/old_src/DE1_SoC.vhdl (<reason>).` (a warning: the save itself succeeded, § 6.5).
- The Windows app, when the project's folder no longer exists: `The folder C:\Labs\fantasicleds is gone.` and a folder picker so the user can look for it, as **Choose project folder…** does.

### 6.12 Performance

Target: a project with **500 files** opens, saves and zips with the page still responding, and the Projects page still lists a folder with 200 projects as fast as today.

- Opening reads only the files the project lists, at most two places each (§ 6.4). It never walks a whole folder tree.
- The save plan is one pass over the files. `exists` comes from two folder listings, not one probe per file (§ 6.6).
- Scanning the projects folder reads only `.hdlboard.json` files, as today (§ 6.8).
- Each of `projectSavePlan.test.ts` (plan), `projectFile.test.ts` (open) and `download.test.ts` (zip) has a case with 500 files, which must finish within the normal Vitest timeout.

---

## 7. User interface

Project page (`ProjectPage.tsx`), under the project file name:

| Row | Content |
|---|---|
| **Project folder** | `fantasicleds` — read only, with the hint "Named after the project file". |
| **Source folder** | Text field, default `src`. Inline error from `folderNameProblem`. While invalid, **Save project** is disabled with that error as its tooltip. |
| Hint, when the files will move or be copied | Source folder changed: "Files move to `fantasicleds/lab_src` when you save." Project file renamed: "Files move to `newname/src` when you save." Flat project: "Files are copied to `fantasicleds/src` when you save." Nothing more is said about the flat files (D9). |
| Hint, when the project file was renamed outside HDLBoard | The stored `projectDirectory` differs from the file name (§ 3.2). Shown as soon as the project opens: "The project file was renamed: its files move from `oldname/src` to `newname/src` when you save." |
| Clean-up, after a save emptied a folder | Shown only for a folder that this save emptied: "The old folder `fantasicleds/old_src` is empty." with a **Remove folder** button. It removes the folder only if it is still empty and gives no warning; otherwise it says why it did not. The note goes away when the button is clicked, when the project is closed, or at the next save. Nothing is removed without the click (D13). |

Changing either the source folder or the project file name counts as an unsaved change (it is in the project file text, so `hasUnsavedChanges` already sees it).

The overwrite question (D12) uses the existing `Dialog` component: title "Overwrite files?", **Overwrite** and **Cancel**. It lists each clashing file by its **full path relative to the project file**, e.g. `fantasicleds/src/DE1_SoC.vhdl`, never the bare name: when several projects share a folder, the bare name is ambiguous.

Removing an empty folder needs a directory delete: `removeEntry` on the parent handle in Chrome/Edge, and a new `hdlboard:remove-empty-folder` in the Windows app. That call refuses a folder that is not empty, or one outside the project file's folder.

The **Save project** tooltip (`saveHint`) for Firefox/Safari becomes "Download the project as a .zip".

---

## 8. Test plan

Vitest, next to the code it tests.

| File | Cases |
|---|---|
| `src/project/parseProject.test.ts` | Fields read; missing fields → defaults; invalid `sourceDirectory` → warning + default; invalid `projectDirectory` → warning, treated as missing; `serializeProject` writes both in order |
| `src/project/fileName.test.ts` (new) | `folderNameProblem`: valid `src`, `lab_src`; rejected: `''`, `.`, `..`, `a/b`, `a\b`, `C:`, `src.`, `src `, `CON`, `nul.txt`, `<`, `*` |
| `src/project/resolveSource.test.ts` | `diskPath` |
| `src/components/workbench/projectSavePlan.test.ts` (new) | New file → write; same place → write; flat → write, no delete; other folder → write + delete; rename of project file → files move and old project file deleted; renamed project file whose target exists → clash listed, Cancel saves nothing; only the case of the source folder changed → write only, no delete, no clash; same place is decided ignoring case (`proj/src/x` vs `proj/Src/x`); the project file text comes from the `projectFile` argument, not `savedText`; a write fails partway → the next successful save leaves exactly the targets and completes the moves; clash detected only for foreign files; project file written last; deletes only listed, never run on failure; **AC-15: a second save after a conversion or a move writes nothing outside the target paths and deletes nothing**; `clashes` holds full relative paths; 500 files |
| `src/components/workbench/projectFile.test.ts` | Open reads `<pd>/<sd>/` first, flat second; `onDisk` records the found path; missing message; `parseStoredProject` keeps the new fields; `projectDirectoryOf`; `diskLayout` for none, flat, folders, mixed, and folders with new files (→ folders); after a conversion with the flat copies still there, opening takes the `<pd>/<sd>/` copies; 500 files |
| `src/components/workbench/download.test.ts` (new) / `zipUpload.test.ts` | Zip layout with a project; paths kept on upload; a zip with a top-level `.hdlboard.json` opens as a project; a zip without one adds its files; old flat zip still opens; 500 files |
| `src/components/workbench/chosenFolder.test.ts`, `localProjectScan.test.ts` | `<pd>/<sd>/` files included for the right project only, for project files at the root and one folder down (4 and 5 path segments); two projects with the same file names in one folder do not mix |
| `src/github/projectGists.test.ts` | The gist stays flat and its project file carries the fields |

Manual, in the running app with the Chrome extension, and in the Windows app:

1. New project → Save project → folder has `name.hdlboard.json` and `name/src/…`.
2. Open an old flat project → Save → files copied into `name/src/`, flat files still there.
3. Change Source folder to `rtl` → Save → files moved, `src/` left empty.
4. Rename the project file → Save → files moved to the new project folder.
5. Clash: put a file in the target folder first → Save asks; Cancel saves nothing.
6. Two projects with the same file names in one folder → both open with their own files.
7. Download All → zip opens again with Upload File.
8. Firefox: Save project downloads the zip.
9. Save to GitHub → gist is flat; open it on another computer → Save project writes the folder layout.
10. `?project=` with the shipped `adder-and-counter` example still opens.

---

## 9. Implementation steps

Each step leaves the app working; run `npm test` and `npm run typecheck` after each.

1. **Format**: types, `folderNameProblem`, `diskPath`, `parseProject`/`serializeProject` with defaults. Tests.
2. **Model**: `OpenProject.sourceDirectory`, `onDisk`, `onDiskFileName`; `projectFileText` writes the fields; `parseStoredProject`.
3. **Open from disk**: `openProject` with paths and flat fallback; Windows path opening (`Workbench.tsx` ≈ 732, 795); `chosenFolder.ts`; `localProjectScan.ts`; `filesInZip` paths.
4. **Save plan**: `projectSavePlan.ts` and tests.
5. **Run the plan**: Windows app IPC (`list-folder-files`, `delete-local-file`, `remove-empty-folder`, preload, `desktop.ts` bridge); `PickedFolder` subfolders and `removeEntry`; `handleSaveProject` rewritten around the plan; overwrite dialog; error messages.
6. **Zip**: Download All layout; Firefox/Safari Save project → zip; remove `downloadEach`.
7. **Project page**: Project folder row, Source folder field, hints (including the outside-rename hint), Remove folder button, Save disabled while invalid.
8. **Docs**: `PROJECTS.md` (layout, conversion, zip, Firefox/Safari), `Impl_project_file_and_online_storage.md` § 4 and § 5, `changelog.txt`.
9. **Manual tests** of § 8 in the browser and the Windows app.

---

## 10. Acceptance criteria

- AC-1 A project saved to disk has `<name>.hdlboard.json` and `<name>/<sourceDirectory>/<files>`, with both fields in the project file.
- AC-2 Two projects with the same file names live in one folder and each opens its own files.
- AC-3 An old flat project opens unchanged, and after Save project its files are copied into the folder layout while the flat files remain.
- AC-4 Changing the source folder, or renaming the project file, moves the files on save; an emptied folder remains.
- AC-5 A clash asks before overwriting; Cancel writes nothing.
- AC-6 An invalid **source folder** shows an error and blocks Save project. An invalid stored `projectDirectory` only warns, and the next save repairs it.
- AC-7 A failed write leaves the old project file and every old file in place, and the message names the file and step.
- AC-8 Gists stay flat, carry both fields, and a gist saved to disk lands in the folder layout.
- AC-9 `?project=`, web addresses and site paths open as before, including `adder-and-counter`.
- AC-10 Download All gives a zip with the folder layout in every browser and the Windows app; that zip opens again.
- AC-11 Save project in Firefox and Safari downloads that zip.
- AC-12 The Projects page lists no project folders as projects, and search still finds files by name.
- AC-13 A project whose file was renamed and saved opens again with every file, and the old project file is gone.
- AC-14 A project saved as a zip and opened again keeps the exact folder layout. This holds right after converting a flat project too.
- AC-15 Saving several times in a row, including after a move, creates no extra copies of any file.
- AC-16 A gist saved to disk and saved back to GitHub is the same flat gist, with the same files and the same two fields.
- AC-17 Changing only the case of the source folder (`src` → `Src`) saves without a clash question and leaves one folder with every file in it.
- AC-18 Renaming the project file to a name that already exists asks before overwriting; Cancel writes nothing.

---

## 11. Open questions

None. The questions from version 1.0 are decided: Q1 → D20, Q2 → D21, Q3 → D22, Q4 → D23.

Review points not taken:

- **Removing emptied folders automatically.** D13 was decided explicitly: emptied folders stay. Removing a folder the user may have put other things in is riskier than leaving an empty one. Since 1.2, the project page offers to remove a folder that a save emptied, but only on request (§ 7).
- **A note after conversion that the flat files are no longer used.** D9 says the flat files are left alone, with no message about them. The hint before saving says only where the files are copied to.
- **Storing `projectDirectory` and a layout status in `OpenProject`.** Both are derived instead (§ 6.1), so they can never disagree with the file name or with `onDisk`. They are just as easy to show and to test.
