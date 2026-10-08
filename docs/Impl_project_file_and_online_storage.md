# HDLBoard Feature: Project File

## 1. Purpose

Introduce a **project file** that describes a HDLBoard project: what it is, which board it targets, and which source files belong to it. Opening one project file loads the whole project (design, testbench, supporting files) instead of opening files one by one.

The project file can be stored **locally** or at an **HTTP(S) URL**, so a teacher can publish a ready-made exercise and students open it with a single link.

## 2. Goals

- One file describes the whole project.
- The project names its target board; it does not contain board files.
- All project files live in the **same directory** as the project file (flat structure, no subfolders).
- A file entry has a `name`, a `url` and a `description`.
- `url` is an absolute HTTP(S) URL when the file is stored/synced to a URL, and **empty** when it is not.
- The project file itself can be loaded from a local path or an HTTP(S) URL.
- Simple, human-editable, easy to version in Git.

## 3. Non-goals (initial version)

- Board definitions or board files (the project only names its board), simulator settings or build options.
- Subdirectories inside the project.
- Writing back to arbitrary remote (HTTP) locations. The only supported remote store is GitHub Gists (Section 11).
- Dependency resolution between files.

## 4. File Format

JSON, with the extension `.hdlboard.json` (e.g. `counter.hdlboard.json`).

### 4.1 Structure

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | number | yes | Project file format version. Starts at `1`. |
| `name` | string | yes | Short project name. |
| `board` | string | yes | Name of the board the project targets (e.g. `"DE1-SoC"`). See 4.2. |
| `description` | string | yes | Description of the overall project. Plain text, multi-line allowed (`\n`). |
| `files` | array | yes | List of project files (see 4.3). |

### 4.2 Board name

The `board` field is only a **name**. Board definitions (switch/LED/7-segment layout, pin mapping, etc.) are built into HDLBoard and are **never** stored as files in the project. Consequently, the `files` list contains only user source files (design, testbench, etc.), not board files.

- The name is matched against the boards known to HDLBoard (case-insensitive).
- If the name is unknown, HDLBoard shows a warning and falls back to the default board.

### 4.3 File entry

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | File name, e.g. `counter.vhd`. Identifies the file in the project directory and is the name shown in the editor. Unique case-insensitively within the project. Must follow the file name rules in Section 5.1. |
| `url` | string | yes | Absolute `http://` / `https://` URL the file is stored/synced to. **Empty string (`""`) if the file is not stored/synced to a URL.** |
| `description` | string | yes | What the file is for. |

Where the content comes from:

- `url` empty: the file is read from the project directory, using `name`.
- `url` set: the file content is fetched from that URL and kept under `name`.

### 4.4 Example

```json
{
  "version": 1,
  "name": "4-bit Counter",
  "board": "DE1-SoC",
  "description": "Introductory exercise: a 4-bit counter driven by KEY0, shown on LEDR[3:0].",
  "files": [
    {
      "name": "counter.vhd",
      "url": "",
      "description": "Design: 4-bit counter entity and architecture"
    },
    {
      "name": "counter_tb.vhd",
      "url": "",
      "description": "Testbench for the counter"
    },
    {
      "name": "debounce.vhd",
      "url": "https://example.com/shared/debounce.vhd",
      "description": "Shared debounce module (synced from URL)"
    }
  ]
}
```

## 5. File Resolution

For each file entry:

1. If `url` is non-empty, it is used as-is (absolute URL).
2. If `url` is empty, the file is `name` in the **project directory**, i.e. the directory (or URL "directory") that contains the project file.

| Project file location | `name` | `url` | Content loaded from |
|---|---|---|---|
| `projects/counter/counter.hdlboard.json` | `counter.vhd` | `""` | `projects/counter/counter.vhd` |
| `https://example.com/ex1/counter.hdlboard.json` | `counter.vhd` | `""` | `https://example.com/ex1/counter.vhd` |
| any | `debounce.vhd` | `https://other.org/x.vhd` | `https://other.org/x.vhd` |

### 5.1 Rules

- `name` must be a plain, non-empty file name. It is rejected if it contains any of these characters or sequences:

  ```text
  /  \  ..  :  *  ?  "  <  >  |
  ```

  An entry that violates this is skipped with a warning. The rule keeps all files in the project directory, prevents escaping it, and keeps names valid on Windows, macOS, Linux and in gists. It applies to `name` only; `url` is a URL and is not affected.
- The same rules apply to the name of the project file itself.
- **File names are unique case-insensitively.** A project must not contain both `counter.vhd` and `Counter.vhd`. If a duplicate is detected, the later entry is skipped with a warning. Names keep the case they were written in for display and saving; only the duplicate check (and matching in sync, Section 12.4) ignores case. This avoids collisions on case-insensitive file systems such as Windows and macOS.
- When the project file is remote, files with an empty `url` resolve to the remote project directory, so the whole project is remote.
- Implementation note: for remote projects use `new URL(name, projectUrl)`.

## 6. Loading a Project

### 6.1 Sources

- **Local file**: open dialog or drag-and-drop.
- **HTTP(S) URL**: entered in an "Open project from URL" field, or passed as a query parameter, e.g. `?project=https://example.com/ex1/counter.hdlboard.json`.

### 6.2 Load sequence

1. Fetch/read the project file.
2. Parse JSON and validate (Section 7).
3. Show the project name and description, and select the board named in `board`.
4. Resolve every file entry to a source (Section 5).
5. Load each file's content (in parallel for remote files).
6. Open the files in the editor under their `name`, showing the file description (e.g. as a tooltip or in the file list).
7. Report files that failed to load, without aborting the rest.

### 6.3 Remote access considerations

- Remote servers must allow cross-origin requests (CORS) when HDLBoard runs in a browser. GitHub raw URLs and most static hosts work; otherwise loading fails with a clear error.
- Remote files are **read-only** by default. Edits are kept in the session; "Save a copy" stores them locally.
- Only `http://` and `https://` are accepted. Other schemes (e.g. `file://`, `javascript:`) are rejected.
- Prefer `https://`; warn on plain `http://`.

### 6.4 Choosing the project file in a folder or gist

When a project is opened from a **local folder** (or downloaded from a **gist**, Section 11.5), the project file is found by its extension `.hdlboard.json` (compared case-insensitively):

- **Exactly one** `.hdlboard.json` file: load it automatically.
- **Multiple** `.hdlboard.json` files: present a picker to the user, listing the file names.
- **No** `.hdlboard.json` file: show an error ("no project file found").

Opening a project from an HTTP(S) URL points directly at a project file, so no choice is needed.

Only the chosen project file and the files it lists belong to the open project. Other `.hdlboard.json` files in the folder or gist are ignored: they are not loaded and not synced (Section 12).

## 7. Validation

| Check | Result |
|---|---|
| Invalid JSON | Error: project not loaded |
| Missing `version`, `name`, `board`, `description` or `files` | Error: project not loaded |
| Unsupported `version` | Error with the supported version number |
| Unknown `board` name | Warning, default board used |
| File entry missing `name` or `url` field | File skipped, warning (`url` must be present, but may be empty) |
| File entry missing `description` | Loaded, empty description, warning |
| Duplicate `name` (compared case-insensitively, e.g. `counter.vhd` and `Counter.vhd`) | Later entry skipped, warning |
| `name` empty, or containing any of `/ \ .. : * ? " < > \|` | File skipped, warning |
| Folder or gist with exactly one `.hdlboard.json` | Loaded automatically |
| Folder or gist with several `.hdlboard.json` files | Picker shown |
| Folder or gist with no `.hdlboard.json` file | Error: no project file found |
| Non-empty `url` that is not `http(s)` | File skipped, warning |
| File not found / fetch failed | Warning per file, others still load |

## 8. UI Behaviour

- **Project panel**: shows project name, board, description, and the file list (by `name`) with per-file descriptions.
- **Open project**: from local file or URL.
- **Remote marker**: a small icon on files with a non-empty `url`.
- **Active project**: only one project open at a time (initial version).

## 9. Suggested Implementation

Types (TypeScript):

```ts
interface ProjectFileEntry {
  name: string;         // file name in project directory, no path separators
  url: string;          // http(s) URL, or "" if not stored/synced to a URL
  description: string;
}

interface HdlBoardProject {
  version: number;
  name: string;
  board: string;        // board name only, no board files
  description: string;
  files: ProjectFileEntry[];
}
```

Core functions:

```ts
// Parse and validate raw JSON, returning the project plus any warnings
function parseProject(json: string): { project: HdlBoardProject; warnings: string[] };

// Resolve where a file entry's content is loaded from
function resolveSource(entry: ProjectFileEntry, projectLocation: string): string;

// Load project from a local File or an http(s) URL
async function loadProject(source: File | string): Promise<LoadedProject>;
```

`resolveSource` outline:

```ts
function isHttpUrl(s: string) {
  return /^https?:\/\//i.test(s);
}

function resolveSource(entry: ProjectFileEntry, projectLocation: string): string {
  if (entry.url !== "") return entry.url;
  if (isHttpUrl(projectLocation)) return new URL(entry.name, projectLocation).toString();
  return joinPath(dirname(projectLocation), entry.name);
}
```

## 10. Implementation Plan: Stage 1 (standalone test page)

### 10.1 Purpose and gate

Stage 1 builds an **independent React/TypeScript page** to test local and HTTP store/sync of project files **outside HDLBoard**. It has no dependency on HDLBoard code.

- Stage 1 includes the GitHub Gist upload/download in Section 11 and the local/gist sync in Section 12.
- Stage 1 must be **approved and tested** before any integration is attempted.
- Integration into HDLBoard (Stage 2) is covered by a **separate implementation plan**, written after Stage 1 is approved. It is not part of this document.

### 10.2 Scope

In scope:

- Open a project from a **local folder**.
- Open a project from an **HTTP(S) URL**.
- Load files by the rules in Section 5 (empty `url` = project directory, non-empty `url` = fetched).
- Show project name, board, description and the file list (name, description, source, status).
- Show file content in a simple read-only viewer.
- Show all validation warnings and errors (Section 7).
- **Sync from URL**: re-fetch a file that has a non-empty `url`.
- **Store locally**: save files back to the local folder.
- **Two-way sync** between the local project folder and a GitHub gist (Section 12).

Out of scope:

- Any HDLBoard code, editor, simulator or board handling (the `board` value is only displayed).
- Writing back to HTTP locations other than GitHub Gists (Section 11 covers gists).

### 10.3 Technology

- Vite + React + TypeScript, the same stack as HDLBoard, so the code can be moved over later.
- Vitest for unit tests of the pure logic.
- No other runtime dependencies if avoidable.

### 10.4 Code structure

The project logic is kept separate from the UI so it can be reused unchanged in Stage 2.

```text
project-file-test/
  src/
    project/               # pure TypeScript, no React, no DOM-specific UI code
      types.ts             # ProjectFileEntry, HdlBoardProject
      parseProject.ts      # parse + validate (Section 7)
      resolveSource.ts     # Section 5
      loadProject.ts       # load from local folder or URL
      sync.ts              # re-fetch from URL, store locally
    ui/
      App.tsx              # test page
      ProjectPanel.tsx     # name, board, description
      FileList.tsx         # files, source, status
      FileViewer.tsx       # read-only content
      WarningList.tsx
  test/
    project/               # Vitest unit tests
  samples/                 # sample projects, see 10.7
```

### 10.5 Test page behaviour

- **Open local project**: pick a folder. A browser cannot read sibling files from a single selected file, so the folder is selected with a directory picker (File System Access API where available, with a `webkitdirectory` fallback that is read-only). The project file is then chosen as in Section 6.4: loaded automatically if there is one, a picker if there are several, an error if there is none.
- **Open from URL**: text field plus button, also accepting `?project=<url>`.
- **File list**: each row shows `name`, description, source (local or URL) and status (loaded, failed, skipped).
- **Viewer**: shows the selected file content.
- **Sync from URL**: per file and for all files with a non-empty `url`; shows whether the content changed.
- **Store locally**: writes loaded files to the chosen folder (needs the File System Access API; otherwise offers download).
- **Warnings panel**: lists every validation warning and error.

### 10.6 Unit tests (Vitest)

- `parseProject`: every row in the Section 7 validation table.
- `resolveSource`: local project with empty `url`, remote project with empty `url`, non-empty `url`.
- `name` rules: each of `/ \ .. : * ? " < > |` rejected, empty name rejected.
- Duplicates rejected case-insensitively (`counter.vhd` vs `Counter.vhd`); the later entry is skipped.
- Project file selection in a folder: none (error), one (automatic), several (picker).

### 10.7 Manual test cases

Sample projects in `samples/`:

| Sample | Purpose |
|---|---|
| `local-only` | All files with empty `url`, loaded from a local folder |
| `remote-project` | Project file and files hosted over HTTP, empty `url` entries resolve remotely |
| `mixed` | Local project with some files synced from a URL |
| `multi-project` | Folder with several `.hdlboard.json` files (picker) |
| `no-project` | Folder with no `.hdlboard.json` file (error) |
| `case-duplicate` | Entries `counter.vhd` and `Counter.vhd` (later skipped) |
| `bad-*` | One sample per validation error/warning, including each forbidden file name character |

Test servers:

- A local static server **with** CORS enabled (success case).
- A local static server **without** CORS (verifies the clear CORS error).
- A public host such as GitHub raw URLs.

### 10.8 Acceptance criteria

1. A local project opens and all files load.
2. A project opens from an HTTP(S) URL and all files load.
3. A mixed project loads each file from the correct source.
4. Every validation case produces the documented result and the other files still load.
5. Sync from URL detects changed and unchanged content.
6. Store locally writes files with the correct names to the project folder.
7. Non-http(s) schemes are rejected.
8. All unit tests pass, and the logic in `src/project/` has no dependency on React or HDLBoard.
9. All acceptance criteria in Section 11.11 (GitHub Gists) are met.
10. All acceptance criteria in Section 12.12 (local/gist sync) are met.

### 10.9 Resolved question: storing to HTTP

"Store" to an HTTP location is done through the GitHub Gist API, specified in Section 11. Other HTTP stores (for example a generic `PUT`) are not part of Stage 1.

## 11. GitHub Gist Upload/Download (part of Stage 1)

### 11.1 Purpose

The test page can **upload** a project (the project file and all its other files) to a GitHub **gist**, and **download** a project from a gist. This is the HTTP store/sync used to test remote projects, and it gives a free, shareable place to host them.

This is tested as part of Stage 1, **before any HDLBoard integration**. Upload and download here are the one-way building blocks; Section 12 builds a two-way sync on top of them.

### 11.2 Why gists fit the project format

- A gist is a **flat set of named text files**, which matches the rule that all project files live in one directory.
- The gist file names are the project `name` values.
- Raw file URLs share one base, so a project file in a gist works as a remote project (Section 5): files with an empty `url` resolve next to the project file.

### 11.3 What is uploaded

| Project item | Uploaded to gist? |
|---|---|
| Project file (`*.hdlboard.json`) | Yes, one per gist |
| File entries with an **empty** `url` | Yes, as a gist file named `name` |
| File entries with a **non-empty** `url` | No. They stay external; the entry is kept unchanged in the uploaded project file |

Gist properties:

- **Description**: the project `name` (and optionally the project `description`).
- **Visibility**: chosen in the UI, public or secret. A secret gist is unlisted, **not private**: anyone with the URL can read it.
- Gists hold **text files only**, and the Gist API rejects empty file content. An empty file gives a clear error for that file.

### 11.4 Upload

1. Validate the project (Section 7); do not upload if there are errors.
2. Collect the project file and all files with an empty `url`.
3. **New gist**: `POST /gists` with the description, visibility and files.
4. **Existing gist** (one created or downloaded in this session, or entered by the user): `PATCH /gists/{id}` with the changed files. A file removed from the project is deleted from the gist by sending it as `null`.
5. Before updating, compare the gist's last-updated time with the time it was loaded. If it changed, warn and let the user choose to overwrite or cancel.
6. Show the result: gist URL, raw URL of the project file, and a copy button. The raw URL can be pasted into "Open from URL" (Section 6).

### 11.5 Download

1. The user enters a gist URL or gist id.
2. `GET /gists/{id}`. A secret gist can be read by anyone with its id; a token is optional but raises the rate limit.
3. Find the project file as in Section 6.4: one `.hdlboard.json` file loads automatically, several show a picker, none is an error.
4. Parse and validate it as in Section 6.
5. Files with an empty `url` are taken from the gist. If the API marks a file as truncated (large files), fetch it from its raw URL instead.
6. Files with a non-empty `url` are fetched from that URL as usual.
7. Remember the gist id so the next upload updates this gist.

Opening the gist's raw project file URL with "Open from URL" must give the same result as downloading via the API.

### 11.6 Authentication and security

- Uploading needs a GitHub **personal access token** with permission to write gists (classic token: `gist` scope; fine-grained token: Gists read/write). Downloading public or secret gists needs no token.
- The token is entered in the page and held **in memory only**, never written to `localStorage`, files, URLs or logs, and never included in a project file or a gist.
- The token is sent only to `https://api.github.com`.
- The page shows a warning on public visibility, and a reminder that secret gists are reachable by URL.
- Never put secrets in project files; they are readable by anyone with the gist URL.

### 11.7 Errors and limits

| Situation | Result |
|---|---|
| No token when uploading | Error asking for a token |
| Invalid or expired token (401) | Error: token rejected |
| Missing permission (403/404 on write) | Error: token lacks gist permission |
| Rate limit exceeded | Error showing when the limit resets; suggest using a token |
| Gist not found | Error: gist not found or not readable |
| Empty file | That file reports an error; nothing is uploaded |
| Network error | Clear error; no partial state is shown as success |
| Remote changed since load (on update) | Warning, overwrite or cancel |

Raw gist URLs can be cached for a few minutes. After an upload, downloading through the API gives the current content immediately.

### 11.8 Code additions

```text
src/project/
  gist.ts            # createGist, updateGist, fetchGist, gistRawUrl (pure TS, only needs fetch)
src/ui/
  GistPanel.tsx      # token field, visibility, Upload, Download, result links
test/project/
  gist.test.ts       # unit tests with a mocked fetch
```

`gist.ts` has no React or HDLBoard dependency, so it can be reused in Stage 2.

### 11.9 Test page behaviour

- **GitHub panel** with: token field (masked), public/secret toggle, gist URL/id field.
- **Upload new gist** and **Update gist** buttons.
- **Download gist** button.
- After upload: gist URL and raw project URL with copy buttons.
- The warnings panel (Section 10.5) shows gist errors.

### 11.10 Tests

Unit tests (Vitest, mocked `fetch`):

- Request bodies for create and update, including deleting a removed file with `null`.
- Entries with a non-empty `url` are not uploaded and stay unchanged.
- Project file detection: none (error), one (automatic), several (picker).
- Truncated file falls back to the raw URL.
- Error mapping for 401, 403, 404, 422 and rate limit.
- The token never appears in any request other than the `Authorization` header to `api.github.com`.

Manual tests against real GitHub (use a throwaway token and test gists):

| Test | Expected |
|---|---|
| Upload `local-only` as secret gist | Gist contains project file and all files, names match `name` |
| Download that gist in a fresh page session | Identical files and project data |
| Open the raw project URL with "Open from URL" | Same result as API download |
| Upload `mixed` | Only empty-`url` files uploaded; external entry unchanged |
| Edit a file, Update gist | Only changed file updated |
| Remove a file from the project, Update gist | File removed from gist |
| Change the gist on GitHub, then Update from the page | Conflict warning |
| Wrong token | Token-rejected error |
| Token without gist permission | Permission error |
| Public vs secret | Visibility matches the choice; warning shown for public |
| Empty file | Clear error, nothing uploaded |

### 11.11 Acceptance criteria

1. A project uploads to a new gist with the project file and all empty-`url` files.
2. Files with a non-empty `url` are not uploaded.
3. A gist downloads into an identical project (round trip with no differences).
4. Opening the raw project file URL gives the same result as downloading via the API.
5. Update changes only the modified files and deletes removed ones.
6. A remote change since load is detected before overwriting.
7. All error cases in Section 11.7 give the documented result.
8. The token is never stored or sent anywhere except `api.github.com`.
9. All gist unit tests pass.
10. The user has approved the Gist tests **before** the HDLBoard integration plan is started.

## 12. Syncing Local Storage and a GitHub Gist

### 12.1 Purpose

Keep the **local project folder** and a **GitHub gist** in step with each other, so a project can be edited in either place (for example on two computers, or on github.com) and the changes are carried over without overwriting anything by accident.

"Local storage" here means the project folder on disk, **not** the browser's `localStorage`.

Upload and download (Section 11) are one-way and replace the other side. Sync compares both sides against the **last synced state** and only moves what changed. This is tested as part of Stage 1, **before any HDLBoard integration**.

### 12.2 Principles

- **Three-way comparison**: for every file, compare *local*, *remote* (gist) and *base* (the state at the last successful sync).
- **No silent overwrites**: a change that exists on both sides is a conflict and is never resolved automatically.
- **Preview first**: sync shows a plan of every action and applies it only after the user confirms.
- **Same scope as upload**: only the project file and files with an empty `url` are synced. Entries with a non-empty `url` stay external and are not part of sync.
- **Flat project**: all files are in one directory, matching the gist's flat file list.

### 12.3 Sync state (sidecar file)

The base state is stored in a small file in the project folder:

`.hdlboard-sync.json`

```json
{
  "version": 1,
  "gist": {
    "id": "<gist id>",
    "revision": "<gist revision at last sync>",
    "syncedAt": "2026-10-06T12:00:00Z"
  },
  "files": {
    "counter.hdlboard.json": "<sha-256>",
    "counter.vhd": "<sha-256>",
    "counter_tb.vhd": "<sha-256>"
  }
}
```

- `files` holds the SHA-256 (Web Crypto) of each synced file's content **as of the last sync**.
- `revision` is the gist's latest revision identifier from the Gist API. If it equals the current remote revision, nothing changed remotely and the remote content comparison can be skipped.
- The sidecar is **not** a project file: it is not listed in `files`, not uploaded, and not shown in the file list. It contains the gist id but never a token.
- If the project folder is in a Git repository, `.hdlboard-sync.json` should be added to `.gitignore`.
- If the sidecar is missing or invalid, the folder is treated as **not linked** (Section 12.8). Nothing is lost; the next sync is a first-time link.
- Files are compared **byte for byte as UTF-8 text**. Line endings are not converted, so a file is only "changed" if its content really differs.

### 12.4 Decision table

File names are matched case-insensitively (Section 5.1). For each file name that exists on at least one side or in the base, compute the action:

| Local | Remote | Base | Action |
|---|---|---|---|
| = Remote | = Local | any | In sync (update base) |
| changed | same as base | has base | **Push** local to gist |
| same as base | changed | has base | **Pull** remote to local |
| changed | changed (different) | has base | **Conflict** |
| exists | missing | none | **Push** (new local file) |
| missing | exists | none | **Pull** (new remote file) |
| exists, differs | exists, differs | none | **Conflict** (no common base) |
| missing | same as base | has base | **Delete remote** (deleted locally) |
| same as base | missing | has base | **Delete local** (deleted remotely) |
| missing | changed | has base | **Conflict** (deleted locally, edited remotely) |
| changed | missing | has base | **Conflict** (edited locally, deleted remotely) |
| missing | missing | has base | Drop from base |

"Changed" means the SHA-256 differs from the base hash.

### 12.5 The project file and file membership

The project file is synced like any other file, but it is handled **first**, because it decides which files take part:

1. Sync the project file using the decision table.
2. The resulting project file defines the set of synced files: its entries with an empty `url`.
3. A file added to the project on one side appears on the other as a new file (Pull or Push).
4. A file removed from the project on one side is a deletion on the other (still subject to the confirmation in 12.9).
5. If the project file is in conflict, the other files are not planned until the conflict is resolved.

The project file is never deleted by sync. If the folder or gist contains several `.hdlboard.json` files, the one chosen as in Section 6.4 is the project file; the others are not part of the project and are not synced.

### 12.6 Sync flow

1. **Read local**: read the project file and all its empty-`url` files from the folder, and compute hashes.
2. **Read remote**: `GET /gists/{id}`; fetch any truncated file from its raw URL.
3. **Read base**: load `.hdlboard-sync.json`.
4. **Plan**: compute the action for each file (Section 12.4). This is a pure function, `computePlan(base, local, remote)`.
5. **Preview**: show the plan (file, action, direction). Deletions and conflicts are marked clearly.
6. **Confirm**: the user confirms, and chooses a resolution for each conflict (Section 12.7).
7. **Apply pulls**: write the pulled files to the local folder (create, overwrite, delete).
8. **Apply pushes**: send all pushes and remote deletions in **one** `PATCH /gists/{id}`. Before sending, re-check the remote revision; if it changed since step 2, **abort and re-plan**.
9. **Update base**: write the new hashes and the gist's new revision to `.hdlboard-sync.json`. Files that failed are left out of the base, so they are planned again next time.
10. **Report**: show what was done and any failures.

If nothing needs to change, the page reports "Already in sync" and writes nothing.

### 12.7 Conflicts

A conflict is shown per file with both versions and a simple side-by-side or line diff. The user picks one of:

- **Keep local**: push local over the remote file.
- **Keep remote**: pull remote over the local file.
- **Skip**: leave both unchanged; the file stays in conflict and the base is not updated for it.

For "deleted on one side, edited on the other", the choices are keep the edited file, or accept the deletion.

There is **no automatic merge** in Stage 1. When "Keep local" or "Keep remote" is chosen, the losing version is first offered as a download (or saved as `<name>.conflict`, which is not part of the project and not synced), so it can be recovered.

### 12.8 First sync (linking a folder to a gist)

With no valid sidecar there is no base, so the page links the folder first:

- **Link to an existing gist**: the user enters a gist URL or id. Files are compared with no base: identical files are in sync, files on only one side are pushed or pulled, and files that differ on both sides are conflicts.
- **Create a new gist from this folder**: equivalent to an upload (Section 11.4), then the sidecar is written so later syncs are two-way.
- **Create a folder from a gist**: equivalent to a download (Section 11.5) into an empty folder, then the sidecar is written.

### 12.9 Safety and limits

- Deletions (local or remote) are always listed in the preview and need explicit confirmation.
- Nothing is applied before the user confirms the plan.
- The Gist API has no conditional update, so there is a small window between the revision re-check and the `PATCH`. The re-check narrows it but cannot remove it; a change in that window is detected at the next sync.
- A failed pull or push never marks the file as synced.
- The token rules from Section 11.6 apply unchanged.
- Full two-way sync needs write access to the folder (File System Access API). Without it the page can only download and upload manually (Section 11) and shows this clearly.
- Gist limits from Section 11.3 apply: text files only, no empty files, flat file names.

### 12.10 Code additions

```text
src/project/
  syncState.ts       # read/write .hdlboard-sync.json, hashing (SHA-256)
  syncPlan.ts        # computePlan(base, local, remote) -> actions (pure function)
  syncApply.ts       # apply pulls locally, push/delete via one gist PATCH, update base
src/ui/
  SyncPanel.tsx      # link, plan preview, conflict resolution, result
test/project/
  syncPlan.test.ts
  syncApply.test.ts
```

`computePlan` is a pure function with no I/O, so every row of the decision table can be unit tested directly. All of this is plain TypeScript with no React or HDLBoard dependency and is reused in Stage 2.

### 12.11 Tests

Unit tests (Vitest):

- `computePlan`: every row of the Section 12.4 decision table.
- Project file handled first; a file added or removed in the project file leads to the right actions.
- Conflict on the project file blocks planning of the other files.
- Entries with a non-empty `url` never appear in a plan.
- Names differing only by case are matched as the same file.
- Other `.hdlboard.json` files in the folder or gist are not planned.
- `syncApply` with mocked `fetch` and a mocked folder: pulls written, one `PATCH` for pushes and deletions, abort and re-plan when the remote revision changed, failed files left out of the base.
- Sidecar read/write, missing sidecar, invalid sidecar.

Manual tests (real GitHub, throwaway token and test gists, two separate local folders standing in for two computers):

| Test | Expected |
|---|---|
| Link folder A to a new gist, sync again | "Already in sync" |
| Edit a file in A, sync A, sync B | Change appears in B |
| Edit different files in A and B, sync both | Both changes end up on both sides |
| Edit the same file in A and B, sync | Conflict shown; chosen version wins; the other is recoverable |
| Delete a file in A, sync A, sync B | Deletion confirmed and propagated |
| Add a file to the project in A, sync A, sync B | File appears in B and in B's project file |
| Edit a file on github.com, sync | Pull |
| Delete the sidecar, sync | Treated as first link; identical files not reported as changes |
| Remote changes between plan and apply | Abort and re-plan, nothing overwritten |
| Mixed project with a non-empty `url` entry | External entry untouched by sync |
| Network failure during apply | Clear error; failed files not marked as synced |
| Line endings differ only | Reported as a real change (no normalization) |

### 12.12 Acceptance criteria

1. A folder can be linked to an existing gist, to a new gist, or created from a gist.
2. Edits on either side are carried to the other side by sync.
3. Edits to different files on both sides are both kept.
4. A change to the same file on both sides is always shown as a conflict and never overwritten silently.
5. Deletions propagate only after explicit confirmation.
6. The plan is shown before anything is changed, and an unchanged project reports "Already in sync".
7. Pushes and remote deletions are sent in a single gist update, and a remote change since planning aborts the sync.
8. A failed file is not marked as synced and is planned again next time.
9. Files with a non-empty `url` and the sidecar file are never synced.
10. The sidecar contains no token, and a missing sidecar is handled as a first link without data loss.
11. All sync unit tests pass.
12. The user has approved the sync tests **before** the HDLBoard integration plan is started.

## 13. Future Extensions

- Default switch/key states stored in the project.
- File roles (`design`, `testbench`, `constraints`) for automatic split-screen setup.
- Language field per file (VHDL / Verilog).
- Top-level entity name for simulation.
- Export current workspace as a project file.
- Zip-packaged projects.
- Automatic merge of non-overlapping text changes during sync.
- Automatic or periodic sync.
