<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# Configurable board I/O names — implementation spec

How to make the board's port names (`SW`, `KEY_N`, `LEDR`, `HEX0_N` …) configurable, so
HDLBoard can follow another board's naming. A board is chosen in **Settings**. When it changes,
HDLBoard offers to rename the ports in the project's files. Built-in examples open with the
chosen board's names. Expert users add boards in a JSON file. There is no board editor.

Status: **specification, not implemented.** Written against `hdl-board` 1.5.1. Revised after four
reviews. § 19 lists what was changed, and why some suggestions were not taken.

Guiding rule for every decision below: **logical and easy to implement**. A suggestion was taken when it
removes a real error or a real confusion at small cost. It was left out when it adds a mechanism
(a new UI component, a heuristic, a second code path) that the feature does not need yet.

---

## 0. Summary of changes

| Area | What changes |
|---|---|
| **Board definitions** | New `src/boards/` module (plain TypeScript, like `src/project/`). The built-in boards **Default** and **DE1-SoC** are defined in `src/boards/builtinBoards.json`. Expert users add boards in `boards/boards.json` (served next to `index.html`). Both files use the same format and the same validator (§ 4). |
| **Built-in boards** | `default` (display name *Default*): today's names (`CLOCK_50`, `CLOCK_500Hz`, `SW`, `KEY_N`, `LEDR`, `HEX0_N`…`HEX5_N`). `de1-soc` (*DE1-SoC*): Terasic's names, the same apart from `KEY` and `HEX0`…`HEX5`. |
| **Settings dialog** | New **Board** group at the top: one radio button per board, with its description. It changes the *open project's* board. The board is also remembered as the board for new projects and fresh starts (§ 3.2). |
| **Board change** | If the files use the old board's names, a **Change board?** dialog lists the renames and the files they touch. The buttons are *Update files* / *Change board only* / *Cancel*. The rename is **all or nothing**: if any file has a naming conflict, *Update files* is disabled and the conflict is named. The rename is token-aware, not plain text: identifiers are renamed, comments only where the name is also used in code, strings never, there are no partial matches. Every board change logs a console line with **Undo** (§ 3.3, § 7). |
| **Name-mismatch fix** | When the top file uses another board's names, Start logs a hint whose action opens a small dialog: *Switch board to X* or *Rename files to Y names* (§ 3.5). |
| **Board panel** | Panel headings and labels come from the active board (`Pushbuttons (KEY[3:0])`, `7-Segment Displays (HEXn[6:0])`). The pane title names the board: **Board I/O · DE1-SoC**. Polarity is no longer guessed from the `_N` suffix (§ 6.6). |
| **Examples & new files** | Built-in examples and the starter files stay written once, in Default names. They are translated with the same rename engine when they are copied in. The same goes for the New File template (§ 6.7). |
| **Help dialog** | The signal table and code samples use the active board's names. The "Moving to the real board" callout points to Settings › Board (§ 6.8). |
| **Protocol** | New client frame **`BOARD`**, sent before every `RUN` (like `WAVE`), with one line per board role. Without it the backend uses the Default names, so every existing test and client keeps working. The protocol version goes from 1 to 2 (§ 8). |
| **Backend** | `engines/boardPorts.ts` becomes a `BoardIo` value plus one binding table. This replaces the hard-coded lists in `boardPorts.ts`, `tbTemplate.ts`, `verilog/testbench.ts`, `verilog/ports.ts`, `portDetect.ts`, `extraPorts.ts`, `boardPortSuggestions.ts` and `verilog/diagnostics.ts`. The session's board reaches the engines through `PrepareRequest.board`. Port names are validated on the server, because they go into generated HDL (§ 9). |
| **Project file** | Version **2**: `board` holds a board **id** (`"default"`, `"de1-soc"`). A version-1 file (and a stored desktop workspace) migrates to `default`, because every v1 file was written with the Default names, even though it says `"DE1-SoC"` (§ 10). |
| **Simulation safety** | Changing the board stops a running simulation. A project whose board is not installed logs `Board "x" is not installed here; simulating with Default names.` on every run (§ 3.4). An invalid `BOARD` frame makes the next `RUN` fail instead of running with the wrong names (§ 8.2). |
| **Docs** | New `docs/BOARDS.md` (the file format, for experts). README, Help, `PROJECTS.md` and the changelog are updated. The example project moves to version 2 (§ 12, phase 5). |

---

## 1. The request

> Make the I/O declarations configurable to ease the transition to other boards. The built-in
> examples should show the example files using the new declarations and the UI should show the
> configured board. The board should be selectable from the config settings. If the board is
> changed in the settings dialog, ask if the project should automatically be updated using the
> new configuration; use find and replace in the source to update it. The original board config
> should be named *default*, and the board *DE1-SoC* uses the same config as the default, but
> the DE1-SoC standard UCF defines the 7-segment displays as HEX (not HEX_n) and the push
> buttons as KEY, not KEY_N.

Main requirements, in priority order: **simple to use**, **simulation always matches the names
in use**, **easy and logical to implement**, **Clean Code**, **experts can add boards with a
JSON file and no UI**.

---

## 2. Review of the request: findings and decisions

### 2.1 Findings (logical issues and gaps)

| # | Finding | Consequence for the design |
|---|---|---|
| F1 | **"UCF" is Xilinx's constraint format** (ISE). Terasic boards use a Quartus `.qsf` and the *System Builder* / golden-top HDL. The names in the request are still correct. A DE1-SoC top level from Terasic and from courses that use it declares `KEY[3:0]`, `SW[9:0]`, `LEDR[9:0]`, `HEX0`…`HEX5` as `[6:0]` each, and `CLOCK_50` (see § 18). | The docs say *"Terasic's names (System Builder top level)"*, not UCF. |
| F2 | "HEX (not HEX_n)" means **six separate 7-bit ports `HEX0`…`HEX5`**, not one `HEX` vector. | A board lists its seven-segment ports as an **array of six names**, not a pattern (§ 4.3). |
| F3 | **Renaming does not change polarity.** On the real DE1-SoC, `KEY` and `HEX0..5` are still active low. `_N` is only a naming convention. `KEY(0) = '0'` still means "pressed". | A plain identifier rename keeps the meaning of the student's code. The UI must **stop deriving `_N` from `activeLow`** (`Pushbuttons.tsx`, `SevenSegmentDisplays.tsx` do that today). |
| F4 | The board is **already a project property**: `"board"` in `.hdlboard.json`, and the *Board* dropdown on the Project page. The Settings dialog, on the other hand, holds per-browser preferences. Two independent board settings would contradict each other. | One source of truth: **`project.board`**. Settings › Board and the Project page dropdown call the same `requestBoardChange()`. The last choice is also stored as the preferred board for *new* projects (D3). |
| F5 | **Existing projects would break.** Every saved project, gist and stored desktop workspace says `"board": "DE1-SoC"` but uses `KEY_N`/`HEX0_N`. Once *DE1-SoC* means `KEY`/`HEX0`, these projects would open on the wrong board: keys tied at 0 and blank displays. | **Project file version 2** stores a board *id*. Version 1 migrates to `default` (§ 10). The bundled example project is updated. |
| F6 | **Plain-text find & replace is not safe for HDL.** It matches substrings (`HEX0_N` in `HEX0_N_reg`). It misses case variants (VHDL ignores case: `key_n`). It changes strings (`report "SW = …"`). It cascades when two renames chain or swap (A→B, B→C). It silently merges names when the target already exists (`signal key` + `KEY_N`→`KEY`). In Verilog, `KEY` and `key` are *different* names. | A **token-aware, single-pass rename** that uses the editor's own tokenizer, with a conflict check, a preview and an undo (§ 7). It is still "find and replace", applied to whole identifiers. |
| F7 | "Examples show the new declarations": writing every example once per board would multiply 14 files by N boards. | Examples stay in **one canonical form (Default)** and are translated when they are opened. This reuses the rename engine and tests it on every example (§ 6.7). |
| F8 | **Names alone do not cover most other boards.** DE10-Lite has `KEY[1:0]` (2 keys), `HEX0..5[7:0]` (decimal point) and `MAX10_CLK1_50`. DE2-115 has 18 switches, 18 + 9 LEDs and 8 displays. | v1 makes **names** configurable, and the I/O *shape* stays fixed (10 SW, 4 KEY, 10 LEDR, 6×7 HEX, both clocks). The file format has a `version` so that widths and counts can be added later without breaking files (§ 16). |
| F9 | `CLOCK_500Hz` is simulator-only, and `rst` is legacy VHDL tolerance (wired from `not KEY_N(0)`). | `clock500Hz` is a role like the others (same name on both built-ins). `rst` stays a fixed legacy name and is **reserved**, so no board may use it (§ 4.4). |
| F10 | A running simulation was built with the old names. Changing the files under it makes the board and the code disagree. | Changing the board **stops the simulation**, as Stop does. Start runs with the new names (§ 3.3). |
| F11 | Port names travel to the backend and are pasted into the generated VHDL/Verilog testbench. That is an injection path. | The server **validates every name** as a plain identifier before using it (§ 9.2). |
| F12 | The workspace's fallback project is already called the **Default project**. A **Default board** next to it can confuse. | The display name stays *Default* (as requested). Its description says what it is ("HDLBoard's names: active-low ports end in _N"), and the Settings group is headed **Board**. |

### 2.2 Decisions

| ID | Decision |
|---|---|
| D1 | Board ids are lower-case slugs (`default`, `de1-soc`). Display names are free text. Project files store the id. |
| D2 | **Roles are fixed** and named after what they are: `clock50`, `clock500Hz`, `switches`, `pushbuttons`, `leds`, `sevenSegment`. A board maps each role to port name(s). The wire protocol, the testbench signals (`sw_sig`, `key_sig` …) and the UI are keyed by role, never by name. |
| D3 | The **active board is `project.board`**. A localStorage preference (`hdlboard.board.v1`) only decides the board of a new project, of the first-start Default project, and of the starter files. |
| D4 | Settings › Board and the Project page's Board dropdown both call `requestBoardChange(id)`. |
| D5 | The rename is **token-aware**. It renames identifiers (case-insensitive match, written in the board's spelling). In comments it renames whole-word, case-sensitive mentions, but only of names the same file also uses as identifiers. Strings, numbers, keywords and escaped/extended identifiers are not touched. Renames are applied in one pass from a map. |
| D6 | The rename is **all or nothing for the whole project**. If any file has a conflict, *Update files* is disabled, the conflict is named, and no file is changed. A half-renamed project (design renamed, testbench not) can then never happen. *Change board only* and *Cancel* stay available. |
| D7 | If nothing in the files uses the old names, the board changes **without a question**. |
| D8 | Every board change logs a console line with a one-step **Undo**. It restores the files, waveform views and board exactly, and it is valid only while nothing has changed since. After that, changing the board back is the way to go back, because it renames back with the same checks. |
| D9 | Examples, starter files and the New File template are kept in Default names and translated when copied in. |
| D10 | The backend receives the board in a **`BOARD` frame before every `RUN`**. If it is missing, the Default board is used. The backend never reads board files. |
| D11 | `board` is a **required** field of `PrepareRequest` and a required parameter of every pure helper that matches port names. A missed call site is then a compile error, not a silent fallback to Default names. |
| D12 | Built-in boards are compiled in (`src/boards/builtinBoards.json`), so a broken user file can never take them away. User boards come from `boards/boards.json`. A user board whose id is already taken is skipped with a warning. |
| D13 | Testbench classification (`tbDetect`) treats the port names of **all built-in boards plus the active board** as board ports. They are passed in as a parameter, so `tbDetect` stays pure (§ 6.9). |
| D14 | No new runtime dependency (no JSON-schema library). A `board.schema.json` is shipped for editor autocompletion only. The TypeScript validator is the authority. |
| D15 | The `BOARD` setting is **sticky per session**, like `WAVE`. A session that never received one uses Default. An **invalid** `BOARD` fails closed: the next `RUN` is refused until a valid `BOARD` arrives (§ 8.2). |
| D16 | The v1 → v2 migration is **deterministic** (always `default`), with no guessing from the sources. The rare v1 project whose files already use DE1-SoC names is fixed with one click by the name-mismatch hint (§ 3.5). |
| D17 | Polarity and the I/O shape are fixed per role. Board files rename ports only, and the UI and docs say so (§ 3.2, § 16). |

---

## 3. User experience

### 3.1 Where the board is shown

- **Board pane title**: `Board I/O · DE1-SoC` (today `Board I/O`).
- **Panel headings**, from the board's names:
  - `LEDs (LEDR[9:0])`, `Switches (SW[9:0])`
  - `Pushbuttons (KEY_N[3:0])` on Default, `Pushbuttons (KEY[3:0])` on DE1-SoC
  - `7-Segment Displays (HEXn_N[6:0])` on Default, `7-Segment Displays (HEXn[6:0])` on DE1-SoC (§ 6.6 says how the pattern is built)
- **Labels under the parts** (silkscreen) stay `SW9…SW0`, `KEY3…KEY0`, `HEX5…HEX0`. They come from the board's optional `labels`.
- **Help › The board's signal names**: table and samples in the active board's names.
- **Console**: a run's first line names the board, for example `Board: DE1-SoC`. A student or teacher reading a screenshot can then see which names were expected.
  If the project's board is not installed, the line reads
  `Board "de10" is not installed here; simulating with Default names.`, with the action **Choose a board…** (it opens Settings).

### 3.2 Settings › Board

The first group in the dialog, in the same style as the existing radio groups (`SplitSetting`):

```
Board
 (•) Default    HDLBoard's original names: KEY_N and HEX0_N … HEX5_N.
 ( ) DE1-SoC    Terasic's names, as in the DE1-SoC System Builder top level: KEY and HEX0 … HEX5.
 The board of the open project, also used for new projects.
 More boards with other port names can be added in boards/boards.json (How to add a board).
 The number of switches, keys, LEDs and displays is the same on every board.
 ⚠ boards/boards.json: boards[2] "de10" was skipped: ports.sevenSegment needs exactly 6 names (found 8).
```

- The checked radio is the open project's board.
- Choosing another board closes Settings and runs the board change (§ 3.3). If that ends in **Cancel**, Settings opens again, so the user is back where they started.
- The radios are disabled while the project is loading or saving, or while a run is compiling. That leaves no overlapping state to define.
- If the project names a board that is not installed here, an extra checked, disabled row appears: `de10-lite (not installed here, using Default)`.
- *How to add a board* links to `docs/BOARDS.md` in the GitHub repository (`${REPO_URL}/blob/main/docs/BOARDS.md`, with `REPO_URL` from `project.ts`).
- Warnings from `boards.json` are listed at the bottom of the group, one line each, so the expert who edited the file sees what was wrong. They are also logged once with `console.warn`.
- The polarity of the ports is not described here, because it does not depend on the board. Help explains it.

### 3.3 Changing the board

`requestBoardChange(toId)`:

1. Same board: do nothing.
2. Build the rename plan for every HDL file in the Files panel (§ 7.3).
3. **Nothing to rename**: switch the board, stop a running simulation, and log `Board: DE1-SoC (files unchanged)` with **Undo**. Done (D7).
4. Otherwise open **Change board?** (modal; the plan is computed once, when it opens):

```
┌ Change board? ──────────────────────────────────────────────┐
│ Default → DE1-SoC                                           │
│                                                             │
│ Your files use the Default board's port names.              │
│                                                             │
│    KEY_N             →  KEY                                 │
│    HEX0_N … HEX5_N   →  HEX0 … HEX5                         │
│                                                             │
│ 3 files will change (41 names): DE1_SoC.vhdl,               │
│ keyCounter7Seg.vhdl, DE1_SoC.v                              │
│                                                             │
│ Update files   Renames these names in your files and        │
│                changes the board.                           │
│ Change board   Changes the board only; your files stay      │
│ only           as they are.                                 │
│                                                             │
│ Strings are never changed. Nothing is saved until you save  │
│ the project. The running simulation is stopped.             │
│                                                             │
│          [ Cancel ]  [ Change board only ]  [ Update files ]│
└─────────────────────────────────────────────────────────────┘
```

With a conflict (D6), the file list is replaced by the conflict and *Update files* is disabled:

```
│ ⚠ The files cannot be updated automatically:                │
│   counter_tb.vhd: KEY is already a name in this file.       │
│ Rename it by hand, or choose Change board only.             │
```

- **Update files** (default button, autofocus):
  1. Check that the files are still the ones the plan was made from (`files === plan.basis`). If they are not, make a new plan and show the dialog again. This cannot normally happen, because the dialog is modal, but the check makes the guarantee explicit.
  2. Stop the simulation.
  3. In **one** state update, set the files and the saved waveform views from the plan and `project.board` to the new id.
  4. Store the preferred board.
  5. Log `Board: DE1-SoC. Renamed 41 names in 3 files.` with an **Undo** action (an existing console `action`, like `open-waveform`).
- **Change board only**: stop the simulation, set the board, leave the files, and log `Board: DE1-SoC (files unchanged)` with **Undo**.
- **Cancel**: nothing changes. If the dialog was opened from Settings, Settings opens again.
- The file list shows at most 5 names, then `+N more`.
- The sentence about the running simulation appears only when a simulation is running.

**Undo** (pure helpers in `boardChangeUndo.ts`, so they can be unit-tested):

```ts
interface BoardChangeRecord {
  readonly before: { files: readonly VhdlFile[]; board: string; waveViews?: SavedWaveViews };
  readonly after:  { files: readonly VhdlFile[]; board: string };
}
/** Undo is possible only while nothing has changed since the board change. */
export function canUndo(record, current: { files: readonly VhdlFile[]; board: string }): boolean;
```

- `canUndo` checks that `current.files === record.after.files` **and** `current.board === record.after.board`. File state is immutable React state, and every edit, add, delete or rename creates a new array, so reference identity is exactly "nothing changed since". It is cheap and never wrong in the unsafe direction.
- Undo restores **all** of `before` in one state update (files, waveform views, board) and the preferred board. It is all or nothing, never partial.
- Only the latest board change can be undone. A new board change replaces the record.
- If `canUndo` is false, Undo logs `Nothing to undo: the project has changed since the board was changed. Choose the previous board in Settings to rename back.` Changing the board back is the general way back (D8).

### 3.4 Opening projects and examples

- Opening a project makes **its** board active. There is no question and no rename. The project decides. The preferred board is not changed.
- This also applies to the bundled example project (`adder-and-counter`, board `default`). A DE1-SoC user who opens it sees the board switch to Default, which matches its files. Only the **Examples pane** translates, because its cards are files to copy into *your* project, not projects.
- If a project names a board that is not installed: Default names are used for display and simulation, the Project page shows `Board "de10-lite" is not installed here; using Default.` with the action **Choose a board…**, every run logs the line from § 3.1, and the id is **kept** when the project is saved. The id is replaced only when the user chooses a board. That is an ordinary board change, so the files are renamed from Default names.
- Opening an example copies it in **with the active board's names**.

### 3.5 Name-mismatch fix

Before each run, the frontend compares the top unit's declared ports with the boards (§ 6.10). When the file uses
another installed board's names, the console shows a warning:

```
⚠ DE1_SoC.vhdl uses names of the DE1-SoC board (KEY, HEX0, HEX1), but the board is Default.  [Fix…]
```

**Fix…** opens a small dialog in the same component (`BoardChangeDialog`, mode `mismatch`):

```
┌ Port names do not match the board ──────────────────────────┐
│ DE1_SoC.vhdl uses the DE1-SoC names; the board is Default.  │
│                                                             │
│  [ Cancel ]  [ Rename files to Default names ]              │
│              [ Switch board to DE1-SoC ]                    │
└─────────────────────────────────────────────────────────────┘
```

- **Switch board to DE1-SoC** calls `requestBoardChange('de1-soc')`, the normal § 3.3 flow. Files that still use Default names are renamed. If none do, the board switches without a question.
- **Rename files to Default names** calls `requestRenameToBoard(source = DE1-SoC)`. It plans `planBoardChange(files, DE1-SoC, Default)` (the source is the *matching* board, not the previous board), keeps the board, and then continues like *Update files*, including the all-or-nothing rule and Undo.
- The run itself goes ahead either way. The hint only informs.

---


## 4. The board definition file

### 4.1 One format, two places

| File | Who edits it | Loaded |
|---|---|---|
| `src/boards/builtinBoards.json` | Developers | At build time (Vite JSON import). Always present. |
| `public/boards/boards.json` → served as `boards/boards.json` | Expert users, teachers | At start-up with `fetch('boards/boards.json', { cache: 'no-cache' })`, relative to the page (`vite.config.ts` has `base: './'`). |

Where an expert finds the user file in each build:

| Build | Path |
|---|---|
| Dev / GitHub Pages | `public/boards/boards.json` (rebuild/redeploy) |
| Docker (nginx) | `/usr/share/nginx/html/boards/boards.json`. Customise with a bind mount, for example `./my-boards.json:/usr/share/nginx/html/boards/boards.json:ro` in `docker-compose.yml` (exact snippet in `BOARDS.md`). |
| Windows app | `<install folder>\resources\frontend\boards\boards.json`. **A reinstall or upgrade overwrites it.** `BOARDS.md` opens with a warning box about this and a two-step backup/restore. An upgrade-safe location is future work (§ 16). |

The shipped user file is `{ "$schema": "./board.schema.json", "version": 1, "boards": [] }`.

Loading never blocks start-up and never throws (`loadUserBoards`):

| Result of the fetch | Outcome |
|---|---|
| 404 | No user boards, no warning (the file is optional). |
| Any other HTTP status, a rejected fetch (offline, `file://`), an empty body | One warning: `boards/boards.json could not be loaded: <reason>.` |
| 200 with text that is not JSON, or not a version-1 board file | One warning naming the problem. No user boards. |
| 200 with a valid file | Each invalid board is skipped with its own warning (§ 4.4). |

### 4.2 Format (version 1)

This is the full content of `builtinBoards.json`. The user file has the same shape and may also have a
`"$schema"` line. The built-in file does not, because no schema sits next to it.

```json
{
  "version": 1,
  "boards": [
    {
      "id": "default",
      "name": "Default",
      "description": "HDLBoard's original names: KEY_N and HEX0_N … HEX5_N.",
      "ports": {
        "clock50": "CLOCK_50",
        "clock500Hz": "CLOCK_500Hz",
        "switches": "SW",
        "pushbuttons": "KEY_N",
        "leds": "LEDR",
        "sevenSegment": ["HEX0_N", "HEX1_N", "HEX2_N", "HEX3_N", "HEX4_N", "HEX5_N"]
      }
    },
    {
      "id": "de1-soc",
      "name": "DE1-SoC",
      "description": "Terasic's names, as in the DE1-SoC System Builder top level: KEY and HEX0 … HEX5.",
      "ports": {
        "clock50": "CLOCK_50",
        "switches": "SW",
        "pushbuttons": "KEY",
        "leds": "LEDR",
        "sevenSegment": ["HEX0", "HEX1", "HEX2", "HEX3", "HEX4", "HEX5"]
      }
    }
  ]
}
```

Two fields have defaults, which `parseBoardFile` fills in. After parsing, every `BoardDefinition` is complete:
- `ports.clock500Hz` defaults to `CLOCK_500Hz`. It is a **simulator-provided** clock that exists on no real board, so a board file should not have to invent it. It can be given if a course wants another name.
- `labels` (below) defaults to `SW`, `KEY`, `LEDR`, `HEX`.

### 4.3 Roles (fixed in version 1)

| Role (`ports` key) | Dir | Shape (fixed in v1) | Testbench signal | Default label | Default | DE1-SoC |
|---|---|---|---|---|---|---|
| `clock50` | in | 1 bit, 50 MHz | `clk_sig` | — | `CLOCK_50` | `CLOCK_50` |
| `clock500Hz` (optional) | in | 1 bit, 500 Hz, **simulator-provided** | `clk500_sig` | — | `CLOCK_500Hz` | `CLOCK_500Hz` |
| `switches` | in | 10 bits | `sw_sig` | `SW` | `SW` | `SW` |
| `pushbuttons` | in | 4 bits, **active low** | `key_sig` | `KEY` | `KEY_N` | `KEY` |
| `leds` | out | 10 bits, active high | `ledr_sig` | `LEDR` | `LEDR` | `LEDR` |
| `sevenSegment` | out | 6 ports × 7 bits, **active low**; element 0 is the rightmost display | `hex0_sig`…`hex5_sig` | `HEX` | `HEX0_N`…`HEX5_N` | `HEX0`…`HEX5` |

The order of the six `sevenSegment` names is the order of `STATE`'s display fields
(display 0 first). `STIM` and `STATE` do not change (§ 8.3).

**Three kinds of name**, which must not be mixed up:

| Kind | Example | Where it comes from | Used for |
|---|---|---|---|
| **Port name** | `KEY`, `HEX0_N` | `ports` | The HDL identifier: matching, the testbench, renaming, panel headings |
| **Label** (silkscreen) | `KEY` → `KEY3 … KEY0`, `HEX` → `HEX5 … HEX0` | `labels` | The small text under each part and the readout prefix. For `sevenSegment` it is a prefix, and the display number is appended. |
| **Panel heading** | `Pushbuttons (KEY[3:0])` | Built from the port name and the fixed width | The card title |

### 4.4 Validation rules (one function, `parseBoardFile`)

File level:
- The file is valid JSON, an object with `version === 1` and a `boards` array. Otherwise the whole file is rejected with one warning.

Board level (an invalid board is **skipped** with a warning naming it; the other boards still load):
- `id` matches `^[a-z0-9]+(?:-[a-z0-9]+)*$`, is 1–32 characters long, and is unique (built-ins are loaded first, so they win).
- `name` is a non-empty string of at most 40 characters, unique ignoring case (two radios with the same text would be indistinguishable; the later board is skipped). `description` is an optional string of at most 140 characters.
- `ports` has the five required role keys, plus optional `clock500Hz`. Unknown keys are an error, so a misspelled role is caught.
- Every port name:
  - matches the **plain identifier rule** `^[A-Za-z](?:_?[A-Za-z0-9])*$`, which is valid both as a VHDL basic identifier (no `__`, no trailing `_`) and in Verilog, and is at most 32 characters long;
  - is **not a reserved word** in VHDL (`isReservedWord`) or Verilog (`isVerilogReservedWord`);
  - is **not `rst`** (reserved for the legacy VHDL reset, F9);
  - is **unique within the board, ignoring case**. VHDL sees `Key` and `KEY` as one port, and one board definition serves both languages, so the stricter rule applies to both. A Verilog-only board with `KEY` and `key` as two different ports is therefore not allowed, deliberately.
- `sevenSegment` is an array of exactly 6 names.
- `labels`, if present, holds only the four labelled roles. Each label is a plain identifier of at most 8 characters, so `HEX` + `5` still fits under a display.

Warnings name the file, the board's position and id, the JSON path, and what was expected versus found:
`boards/boards.json: boards[2] "de10" was skipped: ports.sevenSegment needs exactly 6 names (found 8).`

Ids are referenced by saved projects. `BOARDS.md` tells experts to **choose an id once and never change it**:
a project that names a renamed id falls back to Default (§ 3.4).

### 4.5 Editor support for experts

`public/boards/board.schema.json` (JSON Schema draft 2020-12) mirrors § 4.4 as far as JSON Schema can.
VS Code then gives autocompletion and red squiggles while the file is edited. It is not used at
run time (D14). `BOARDS.md` lists what the schema **cannot** check, so a file without squiggles is not taken
as proof that it is valid: case-insensitive uniqueness of names, reserved words, `rst`, and unique display names.
HDLBoard's own warning in Settings is the final word.

---


## 5. Architecture

```
                 builtinBoards.json ──┐
 boards/boards.json (fetch) ──────────┤
                                      ▼
                        src/boards/boardCatalog.ts ── BoardCatalog
                                      │
          ┌───────────────────────────┼───────────────────────────────┐
          ▼                           ▼                               ▼
  project.board (id) ─► activeBoard ─► UI (board panel, Help,   renamePorts.ts
                          │            Settings, Project page)  (examples, starter,
                          │                                      new file, board change)
                          ▼
                   hdlClient.run(..., board)
                          │  BOARD frame, then RUN
                          ▼
                   server: Session.board ─► PrepareRequest.board ─► engines
                                                     (boardBindings(board) → testbenches,
                                                      port matching, messages)
```

Principles:
- **One definition, many readers.** A board is a value (`BoardDefinition` in the frontend,
  `BoardIo` in the backend). Nothing else hard-codes port names. The two packages share no code (as today), so the *format* of the `BOARD` frame is the contract between them, and both sides have tests for it.
- **Roles, not names, inside the system.** Bits, testbench signals and UI panels are keyed by role. Names exist only at the edges: the student's source and the board file.
- **Pure core, thin React shell.** Parsing, validation, renaming and frame encoding are pure functions with unit tests. React hooks only hold state and call them.

---

## 6. Frontend implementation

### 6.1 Module layout

```
src/boards/                       plain TypeScript, no React (like src/project/)
  types.ts                        BoardRole, BoardPorts, BoardLabels, BoardDefinition, BoardCatalog
  builtinBoards.json              § 4.2
  parseBoards.ts                  parseBoardFile(json, origin) → { boards, warnings }
  boardNames.ts                   isPlainIdentifier, nameProblem(name) — the § 4.4 name rules
  boardCatalog.ts                 BUILT_IN_BOARDS, DEFAULT_BOARD_ID, mergeCatalog, findBoard, loadUserBoards
  boardPorts.ts                   portList(board), inputNames, outputNames, renamesBetween(from, to),
                                  sevenSegmentHeading(names), BUILT_IN_PORT_NAMES
  renamePorts.ts                  renameInSource(...), planBoardChange(...), applyBoardChange(...),
                                  translateFromDefault(...)
  boardMatch.ts                   foreignBoardNames(ports, catalog, active) — § 6.10
  boardChangeUndo.ts              BoardChangeRecord, canUndo — § 3.3
  boardFrame.ts                   encodeBoardFrame(board) — keep in step with server/src/protocol.ts
  preferredBoard.ts               loadPreferredBoard / savePreferredBoard (localStorage, never throws)
src/components/workbench/
  useBoards.ts                    NEW  catalog state: built-ins at once, user boards when fetched
  useBoardChange.ts               NEW  requestBoardChange, requestRenameToBoard, pending plan, confirm/cancel, undo
  BoardChangeDialog.tsx           NEW  § 3.3 (mode 'change') and § 3.5 (mode 'mismatch')
  BoardIoPanel.tsx                NEW  the four panels for one BoardDefinition (moved out of Workbench)
  boardText.ts                    NEW  every string of § 3, in one place for UI tests (house style)
```

`preferredBoard.ts` stores **only the board id**, as a JSON string, under `hdlboard.board.v1`. Anything else
(missing, unparseable, an id that is not installed) reads as `default`. A future change of shape gets a new key
(`.v2`) that falls back to reading `.v1`. The rule is written in the file's doc comment.

### 6.2 Types (`src/boards/types.ts`)

```ts
export const BOARD_ROLES = ['clock50', 'clock500Hz', 'switches', 'pushbuttons', 'leds', 'sevenSegment'] as const;
export type BoardRole = (typeof BOARD_ROLES)[number];

export interface BoardPorts {
  readonly clock50: string;
  readonly clock500Hz: string;
  readonly switches: string;
  readonly pushbuttons: string;
  readonly leds: string;
  /** Display 0 (rightmost) first; exactly SEVEN_SEGMENT_COUNT names. */
  readonly sevenSegment: readonly string[];
}

export type LabelledRole = 'switches' | 'pushbuttons' | 'leds' | 'sevenSegment';
export type BoardLabels = Readonly<Record<LabelledRole, string>>;

export interface BoardDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly ports: BoardPorts;
  /** Always complete: parseBoardFile fills in DEFAULT_LABELS. */
  readonly labels: BoardLabels;
  readonly origin: 'built-in' | 'user';
}

export interface BoardCatalog {
  readonly boards: readonly BoardDefinition[];
  /** For the Settings dialog (§ 3.2). */
  readonly warnings: readonly string[];
}
```

The fixed shape lives in **one** place, `boardPorts.ts`: `SWITCH_COUNT = 10`, `PUSHBUTTON_COUNT = 4`,
`LED_COUNT = 10`, `SEVEN_SEGMENT_COUNT = 6`. The Workbench's literal `10`, `4` and `6` for the
initial board state are replaced by these constants.

### 6.3 Catalog (`boardCatalog.ts`, `useBoards.ts`)

```ts
export const DEFAULT_BOARD_ID = 'default';
export const BUILT_IN_BOARDS: readonly BoardDefinition[];        // parsed from builtinBoards.json; throws on error (a bug)
export function mergeCatalog(builtIn, user: ParsedBoards): BoardCatalog;   // duplicate id → warning, built-in wins
export function findBoard(catalog, id): { board: BoardDefinition; installed: boolean }; // unknown → Default, installed: false
export async function loadUserBoards(fetchText: (url: string) => Promise<string | undefined>): Promise<ParsedBoards>;
```

`useBoards()` starts with the built-ins, so the first render never waits for a fetch, and adds the user boards when they arrive. A project opened before the fetch has finished just resolves its board again on the next render. Because the project stores the **id** (D1), no information is lost (§ 3.4).

### 6.4 Active board in the Workbench

```ts
const { catalog } = useBoards();
const { board: activeBoard, installed } = findBoard(catalog, project.board);
```

- `defaultProject(...)` and `newProject(...)` take the preferred board id (`loadPreferredBoard()`, falling back to `default`) instead of `DEFAULT_KNOWN_BOARDS[0]`.
- **The preferred board, precisely**:
  - First visit ever (nothing stored): `default`.
  - Written when the user changes a board (§ 3.3 or § 3.5), and when an Undo restores one.
  - **Not** written when a project is opened. Opening a shared project does not change what *your* new projects get.
  - Read for: a new project, the first-start Default project and its starter files, and the starter files after "clear workspace".
- `KNOWN_BOARDS` and `DEFAULT_KNOWN_BOARDS` are removed. The Project page lists `catalog.boards`, with each board's description as the option's `title` tooltip.
- `useBoardChange({ files, setFiles, project, setProject, waveViews, stopSimulation, appendLog, catalog, busy })` returns
  `{ requestBoardChange, requestRenameToBoard, pendingChange, confirmUpdate, confirmBoardOnly, cancel, undo }`. All of § 3.3 and § 3.5 lives in this hook. The Workbench only renders `BoardChangeDialog` from `pendingChange`. While `busy` (project loading/saving, run compiling) both requests are ignored; the selectors are disabled anyway.

### 6.5 Sending the board

- `hdlClient.run(files, topFileName, runTarget, recordWave, board: BoardPorts)`. The new parameter is required.
- `send()` sends `WAVE …` (as today), then `encodeBoardFrame(board)`, then `RUN …`.
- Before the RUN, `startRun` logs `Board: ${activeBoard.name}`, or the not-installed line of § 3.1.
- Old backend (§ 8.2): when `ERROR protocol` arrives with the text `Unknown verb: "BOARD"`, the client marks the
  connection `backendKnowsBoard = false`. It then logs **once per connection**:
  `This simulation backend is older than this page and simulates with the Default names only. Update HDLBoard (Windows: install the new version; Docker: pull the new backend image).`
  and sends no more `BOARD` frames on that connection. Any other `ERROR protocol` is shown as it is today.

### 6.6 Board panel (`BoardIoPanel.tsx`) and the panel components

`BoardIoPanel({ board, ledState, hexState, sw, key, onSwChange, onKeyChange })` renders the four panels
that the Workbench renders inline today:

```tsx
<Leds name={board.labels.leds} title={`LEDs (${board.ports.leds}[${LED_COUNT - 1}:0])`} … />
<SevenSegmentDisplays name={board.labels.sevenSegment}
                      title={`7-Segment Displays (${sevenSegmentHeading(board.ports.sevenSegment)})`} … />
<Switches name={board.labels.switches} title={`Switches (${board.ports.switches}[${SWITCH_COUNT - 1}:0])`} … />
<Pushbuttons name={board.labels.pushbuttons}
             title={`Pushbuttons (${board.ports.pushbuttons}[${PUSHBUTTON_COUNT - 1}:0])`} … />
```

Component changes (small, but they fix F3):
- `Pushbuttons.tsx`: the default heading no longer appends `_N` because of `activeLow`. A new prop `port?: string` (the entity port name, default `name`) builds the heading `Pushbuttons (${port}[n:0])`. `activeLow` keeps its single job, which is the rest level and the hint.
- `SevenSegmentDisplays.tsx`: the same, with `port?: string` for the heading pattern. `activeLow` only decides which level lights a segment.
- `Leds`, `Switches`: already take `name` and `title`, so they need no change.

`sevenSegmentHeading(names)`, pure:
- If all six names are `prefix + index + suffix` with one common prefix and suffix and indices 0…5 in order, it returns `${prefix}n${suffix}[6:0]` (`HEXn_N[6:0]`, `HEXn[6:0]`). This keeps today's look.
- Otherwise it returns the compact `${names[0]}…${names[5]}[6:0]`. The heading element also gets
  `text-overflow: ellipsis`, so an unusual name never breaks the panel layout.

The pane title becomes `${BOARD_PANE_TITLE} · ${activeBoard.name}`. The collapsed rail label keeps the short `Board I/O`.

### 6.7 Examples, starter files and new files

All three are written once in Default names (`files.ts`, `newFile.ts` unchanged as text) and translated
with **one** helper:

```ts
/**
 * A built-in source written in the Default board's names, as it reads on `board`. A thin wrapper around
 * renameInSource(text, language, renamesBetween(DEFAULT_BOARD, board)); it has nothing to do with the
 * interactive board change. Built-ins never conflict (tested), so a conflict here throws: it is a bug.
 */
export function translateFromDefault(text: string, language: Language, board: BoardDefinition): string;
```

- `copyExample(example, files, newId, board)`: each added copy is `{ ...source, content: translateFromDefault(source.content, language, board) }`.
- `STARTER_FILES` stays the canonical constant. The Workbench's initial `files` state is `starterFilesFor(preferredBoard)`.
- `newFileContent(input, language, board)` translates its template.
- The example card title `DE1-SoC Top Level` becomes `Board Top Level` (it is no longer DE1-SoC-specific). The file and entity names `DE1_SoC.vhdl` / `DE1_SoC` stay, since renaming files is out of scope (§ 16).
- `files.ts` header comment: "Written in the Default board's names; translated by `translateFromDefault` when copied in. Do not write board-specific variants."

### 6.8 Help dialog

`HelpDialog({ open, onClose, board })`:
- `SIGNALS` becomes `signalRows(board)`: port column `${ports.switches}[9:0]`, `${ports.pushbuttons}[3:0]`, `sevenSegmentHeading(...)`, and so on. The "meaning" texts keep their wording, because polarity is fixed.
- *Reading the names*: the `_N` entry is shown only if a port name of the board ends in `_N` or `_n`. The `HEXn` entry and the samples (`HEX0_N <= "1111001";`) use the board's names.
- The *Moving to the real board* callout: on Default it reads "… choose **DE1-SoC** in Settings › Board, and HDLBoard renames the ports for you. Remove `CLOCK_500Hz` …". On a board without `_N` names it only keeps the `CLOCK_500Hz` sentence.
- The subtitle and lead text say "the board's own names" instead of "the DE1-SoC's own names".

### 6.9 Testbench detection (`tbDetect/boardPorts.ts`)

The constant `BOARD_PORTS` is replaced by a **parameter**: `analyzeProject(files, boardPorts, previous?)` hands a
`ReadonlySet<string>` of lower-case board port names down to `designUnits`, which uses it in place of `isBoardPort`.
`tbDetect` stays pure, with no fetch and no global.

- The set is `BUILT_IN_PORT_NAMES ∪ portNamesOf(activeBoard) ∪ {'rst'}`. `BUILT_IN_PORT_NAMES` comes from
  `src/boards/boardPorts.ts`. A file that declares `KEY_N` *or* `KEY` is a board design whichever built-in is active,
  and a file in a user board's names is recognised while that board is active (D13).
- `useTestbenchAnalysis` builds the set with `useMemo` from the active board. When the set changes (another board),
  it calls `analyzeProject` without `previous`, so nothing cached under the old names is reused.
- Tests keep a one-line helper `analyzeProject(files, BUILT_IN_PORT_NAMES)`.
- The "keep in step with the server" comment is replaced by "derived from the board definitions". The texts
  `'vhdl-board-ports'` and `'vlog-board-ports'` in `testbenchText.ts` drop "DE1-SoC": "The entity has board ports (SW, LEDR, KEY…), so …".
- Classification is still a heuristic. The manual role override stays the way to correct it.

### 6.10 Board-mismatch hint before a run

`startRun` checks the top unit before sending. It uses `designUnits()` (the port extractor, not the testbench
classification) to get the top unit's **declared ports**, and calls one pure function:

```ts
/** Ports the top declares that the active board does not have but another installed board does, per board. */
export function foreignBoardNames(
  declaredPorts: readonly string[], catalog: BoardCatalog, active: BoardDefinition,
): { board: BoardDefinition; names: readonly string[] } | undefined;
```

Rule, chosen so that it cannot fire by coincidence:
- Only declared ports of the top unit count. Identifiers in the body and other files do not.
- A port counts only if it is **not** a port of the active board **and** is a port of the other board. Names shared by
  both boards (`SW`, `LEDR`, `CLOCK_50`) never count, so a design with only `SW` and `LEDR` never gets a hint.
- If more than one board has such names, the one with the most wins; on a tie, no hint.
- No hint for a unit without ports (a standalone testbench).
- The hint names the ports that triggered it (§ 3.5). It never changes anything by itself.

Without this, the backend's "did you mean `KEY`?" warning is the only clue, and a Verilog top whose ports all have
the other board's names would quietly run as a standalone testbench.

---

## 7. The rename (`src/boards/renamePorts.ts`)

### 7.0 Contract and non-goals

> **Contract:** rename whole identifiers whose name equals one of the old board's port names, in every HDL file,
> consistently. Rename the same names in comments where the file also uses them in code. Change nothing else.
> If a file cannot be renamed safely, change no file at all and say why.

Non-goals (stated so nobody builds them by accident):
- It is **not** a semantic refactoring. It does not know whether `KEY_N` is a port, a signal, a record field or a macro.
  Because every occurrence in every file is renamed the same way, the meaning of the code is kept anyway: a consistent
  rename of an identifier across all files cannot change what the design does, unless it merges two names. The
  conflict check prevents that.
- No parser beyond the editor's tokenizer. If the tokenizer cannot handle a file, the file is treated as a conflict
  ("could not be read safely"), never renamed by guesswork.
- It does not rename files, entities or modules.

### 7.1 Inputs

```ts
export interface PortRename { readonly from: string; readonly to: string }

/** The renames from one board to another: every role whose name differs; sevenSegment element-wise. */
export function renamesBetween(from: BoardDefinition, to: BoardDefinition): PortRename[];
```

For Default → DE1-SoC this gives `KEY_N→KEY` and `HEX0_N→HEX0` … `HEX5_N→HEX5`.

### 7.2 One file: `renameInSource`

```ts
export type SourceRename =
  | { readonly ok: true; readonly text: string; readonly count: number }
  | { readonly ok: false; readonly reasons: readonly string[] };

export function renameInSource(text: string, language: Language, renames: readonly PortRename[]): SourceRename;
```

Algorithm:

1. **Tokenize** with the editor's own `tokenizeSource(language, lines)`, so the rename treats as comments,
   strings and identifiers exactly what the editor colours as such. Lines are split on `\n` and `\r` is kept,
   so line endings are preserved byte for byte. A leading BOM stays untouched. If tokenizing throws, return
   `{ ok: false, reasons: ['could not be read safely'] }` (fail closed).
2. **Look-up**: `byKey = Map(lower(from) → rename)`. Matching ignores case in both languages, because the backend matches board ports
   that way (VHDL by language rule, Verilog by HDLBoard's own rule in `verilog/ports.ts`).
3. **Conflict check** (any failure makes the whole project change impossible, D6):
   - *Target taken*: an identifier `lower(to)` already occurs in the file, the file also uses `from`, and `lower(to)` is not
     itself renamed away (not a key of `byKey`). Reason: ``KEY is already a name in this file``.
   - *Verilog case variants*: the file spells one renamed name in two different ways (`KEY` and `key`). Those are two
     different Verilog names, and renaming both would merge them. Reason: ``KEY and key are different names in Verilog``.
4. **Edits**, in one pass over the tokens (so swaps and chains cannot cascade):
   - An `identifier` token (or any non-comment, non-string token that is a plain identifier, since the VHDL tokenizer may
     colour a name as `type`) whose lower-case text is in `byKey` is replaced by `to`, **spelled as the board spells it**.
     This covers attributes (`KEY_N'range`), indexing (`KEY_N(0)`, `KEY_N[1:0]`), named association, VHDL selected
     names (`rec.KEY_N`), aliases (`alias k is KEY_N`), Verilog hierarchical names (`uut.KEY_N`) and macro names
     (`` `define KEY_N `` … `` `KEY_N ``), all consistently, by the contract in § 7.0.
   - A `comment` token: inside its text, whole-word **case-sensitive** occurrences of `from` are replaced by `to`,
     **but only for a `from` that the same file also uses as an identifier**. A word boundary is any character outside
     `[A-Za-z0-9_$]`. So the English word "key" is never touched, and a comment that says "hold KEY pressed" in a
     file that has no `KEY` identifier is not touched either.
   - `string`, `number`, `keyword`, VHDL extended identifiers (`\KEY_N\`) and Verilog escaped identifiers (`\KEY_N `)
     are left alone.
5. **Column alignment** (a separate small function, `keepColumn`, with its own tests): when a renamed identifier is
   followed on the same line by a whitespace token of **two or more spaces and no tab**, that whitespace grows or shrinks
   by `from.length − to.length` (at least one space). Aligned port lists stay aligned (`KEY_N    : in` ↔ `KEY      : in`).
   A single space (`HEX0_N <= x`) and any whitespace that contains a tab are never changed: with tabs, the visual column
   depends on the editor's tab width, so guessing would make things worse.
   This step exists for one reason: the starter file and the examples are the first code a student sees, and they
   should look tidy on every board.
6. Return `{ ok: true, text, count }`, where `count` is the number of replaced tokens and comment words.

Notes:
- The line structure never changes, so diagnostics, folds and split views keep their line numbers.
- **Comment forms**: VHDL has `--` line comments, and VHDL-2008 also has `/* … */` delimited comments (IEEE 1076-2008,
  § 15.9). Verilog has `//` and `/* … */`. The editor's Verilog tokenizer knows both of its forms. The VHDL tokenizer knows
  `--` only (its header says `/* … */` is not coloured). A name inside a VHDL-2008 delimited comment is therefore seen as
  an identifier and renamed. That is harmless (it is a comment) and accepted. It is pinned by a test, so a later tokenizer
  improvement changes the test on purpose, not by accident.

### 7.3 All files: `planBoardChange` / `applyBoardChange`

```ts
export interface FileChange   { readonly fileId: string; readonly fileName: string; readonly text: string; readonly count: number }
export interface FileConflict { readonly fileName: string; readonly reasons: readonly string[] }
export interface BoardChangePlan {
  readonly from: BoardDefinition;
  readonly to: BoardDefinition;
  readonly renames: readonly PortRename[];
  /** The files array the plan was made from (checked again on confirm, § 3.3). */
  readonly basis: readonly VhdlFile[];
  readonly changes: readonly FileChange[];      // only files with count > 0
  readonly conflicts: readonly FileConflict[];  // non-empty → the plan cannot be applied (D6)
  readonly totalCount: number;
}

export function planBoardChange(files: readonly VhdlFile[], from: BoardDefinition, to: BoardDefinition): BoardChangePlan;
/** Precondition: plan.conflicts is empty. Returns a new array; the input is not changed. */
export function applyBoardChange<T extends { id: string; content: string }>(files: readonly T[], plan: BoardChangePlan): T[];
export function renameWaveViews(views: SavedWaveViews | undefined, renames: readonly PortRename[]): SavedWaveViews | undefined;
```

- **Scope**: every file in the Files panel whose language `languageOfName` knows (`vhdl/`, `verilog/` and `work/`
  folders alike). Testbenches are renamed together with their designs, so a named association (`KEY_N => key_tb`)
  stays consistent. That is also why a conflict in one file blocks all files (D6).
- `planBoardChange` is a **query** (no side effects) and `applyBoardChange` is the **command**. The dialog shows the plan,
  and *Update files* applies exactly that plan, so what the user approved is what happens. Applying is a pure
  function that returns a new array, set in one state update, so there is no "failed half-way" state.
- `renameWaveViews` renames each hierarchy segment of a saved signal `path` that equals a `from` name (ignoring case),
  so a testbench's saved waveform view still finds `uut.KEY`.

### 7.4 Why not a regex Replace All

The existing Find bar (`find/findMatches.ts`) is literal and case-insensitive, and it finds matches *inside* words
and strings. That is right for a search box and wrong for renaming code (F6). The board rename reuses the editor's
**tokenizer**, not the Find bar's matcher. This is the same thing an IDE's *Rename symbol* does, kept to names the
board file declares.

---

## 8. Protocol (`BOARD` frame)

### 8.1 Grammar

```
frame   = "BOARD" LF role-line *(LF role-line)
role-line = role SP name *(SP name)
role    = "clock50" | "clock500Hz" | "switches" | "pushbuttons" | "leds" | "sevenSegment"
```

Example (DE1-SoC):

```
BOARD
clock50 CLOCK_50
clock500Hz CLOCK_500Hz
switches SW
pushbuttons KEY
leds LEDR
sevenSegment HEX0 HEX1 HEX2 HEX3 HEX4 HEX5
```

Rules (decoder `decodeBoardBody`, in `protocol.ts`):
- Every role appears exactly once, including `clock500Hz`. The client always sends a complete board: defaults are filled
  in when the board file is parsed (§ 4.2), never on the wire. `sevenSegment` has exactly 6 names and every other role has 1.
- Every name passes `isPlainIdentifier` (§ 4.4), is at most 32 characters, is not `rst`, and is unique ignoring case.
  Ignoring case is deliberate: one board serves both VHDL, where case does not matter, and Verilog, so the stricter rule applies (§ 4.4).
- On any violation: `ERROR protocol` with a one-line reason, and the session's board becomes **rejected** (§ 8.2).

### 8.2 Order and lifetime

- The client sends `BOARD` **before every `RUN`**, after `WAVE` (the established "settings for the next run" pattern).
  Reconnects and backend restarts then need no extra state.
The session's board is a small state machine. All of it is in `Session` (D15):

| Session board state | How it is reached | What the next `RUN` does |
|---|---|---|
| **Default** | A new session that has received no `BOARD` | Runs with `DEFAULT_BOARD_IO` |
| **Set** (`board`) | A valid `BOARD` | Runs with that board. The board is **sticky**: later `RUN`s without a new `BOARD` use it too, exactly as `WAVE` is sticky. |
| **Rejected** | An invalid `BOARD` (`ERROR protocol` already sent) | Is refused: `ERROR protocol` `RUN refused: the last BOARD frame was not valid.` Nothing is compiled. A later valid `BOARD` leaves this state. |

Why this way: an old client that never sends `BOARD` always gets Default, which is the compatibility promise.
A current client sends `BOARD` before every `RUN` (`WAVE`, then `BOARD`, then `RUN`), so the sticky state is never stale for it.
A client that sent a broken board never gets a simulation with names it did not ask for: the run fails closed.
All existing clients and tests (`WsTestClient`, scenarios) are unchanged.

Versions and old backends:
- `PROTOCOL_VERSION` becomes `'2'` in `server.ts` and `hdlClient.ts`. HELLO's version is informational today: the
  backend checks only that one is present and answers with its own. That stays: a new backend accepts `HELLO 1` and
  `HELLO 2` (and any other value, as before), and an old backend accepts `HELLO 2` (verified in `server.ts` 1.5.1).
  So the connection never fails at HELLO.
- Frontend and backend ship together (desktop app, Docker). If a newer page still meets an older backend, the old backend
  answers `ERROR protocol Unknown verb: "BOARD"` and then runs the `RUN` with Default names. `hdlClient` handles this
  once per connection (§ 6.5): one clear message, no more `BOARD` frames, no repeated errors.
- Reserved words are **not** checked on the server (§ 9.2).

### 8.3 What does not change

`STIM` (14 bits: `switches` 9..0, then `pushbuttons` 3..0) and `STATE` (52 bits: `leds`, then `sevenSegment[0]`…`[5]`) are
keyed by role and stay byte-for-byte identical. So do the testbench's file protocol, pacing and timing.

---

## 9. Backend implementation

### 9.1 `engines/boardPorts.ts` rewritten: the board vocabulary

```ts
export interface BoardIo {
  readonly clock50: string;
  readonly clock500Hz: string;
  readonly switches: string;
  readonly pushbuttons: string;
  readonly leds: string;
  readonly sevenSegment: readonly string[];  // 6
}

export const DEFAULT_BOARD_IO: BoardIo = {
  clock50: 'CLOCK_50', clock500Hz: 'CLOCK_500Hz', switches: 'SW', pushbuttons: 'KEY_N', leds: 'LEDR',
  sevenSegment: ['HEX0_N', 'HEX1_N', 'HEX2_N', 'HEX3_N', 'HEX4_N', 'HEX5_N'],
};

/** Legacy VHDL tolerance (§ 3.2 of the GHDL plan): not a board role, never a board name. */
export const LEGACY_RESET_PORT = 'rst';

export type BoardDirection = 'in' | 'out';
export interface BoardBinding {
  readonly role: string;            // 'switches', 'sevenSegment0', …
  readonly name: string;            // as the board spells it, e.g. 'KEY'
  readonly key: string;             // lower case, for matching
  readonly signal: string;          // testbench signal: 'key_sig'
  readonly direction: BoardDirection;
}

/** THE table: in port-map order, the order both testbench generators connect and STATE is assembled in. */
export function boardBindings(board: BoardIo): readonly BoardBinding[];

export function boardPortKeys(board: BoardIo, options?: { legacyReset?: boolean }): ReadonlySet<string>;
export function boardInputNames(board: BoardIo): string[];   // ['CLOCK_50', 'CLOCK_500Hz', 'SW', 'KEY']
export function boardOutputNames(board: BoardIo): string[];  // ['LEDR', 'HEX0', …]
export function declaresPort(ports: ReadonlySet<string>, name: string): boolean; // ports are lower case
export function describeBoardPorts(board: BoardIo): string;  // 'CLOCK_50, CLOCK_500Hz, SW, KEY, LEDR, HEX0…HEX5'
```

`BOARD_PORTS`, `BOARD_INPUT_NAMES` and `BOARD_OUTPUT_NAMES` are removed. Every reader gets the board as a parameter (D11).

### 9.2 Validation

`protocol.ts` gets `decodeBoardBody(body): BoardIo | ProtocolError`, using the § 8.1 rules. The identifier rule is the
**security boundary**: the names are pasted into generated HDL. Only `^[A-Za-z](?:_?[A-Za-z0-9])*$` gets through, so no
quote, parenthesis, semicolon, newline or comment marker ever reaches a testbench. The server never relies on the
frontend having validated anything: every rule of § 8.1 is checked here again.

**Defined behaviour for reserved words**: the server does *not* check them. A name such as `signal` or `wire` passes
the identifier rule, and the generated testbench then fails to compile with the simulator's own error under stage
`internal`. That is safe (no injection) and visible. The alternative, a second copy of the VHDL and Verilog
reserved-word lists in the backend package, would duplicate about 250 words in order to improve an error message
that HDLBoard's own frontend can never trigger, because it rejects these names when the board file is loaded (§ 4.4).
A test sends such a frame directly and pins this behaviour.

### 9.3 Call sites (all take `board: BoardIo` explicitly)

| File | Change |
|---|---|
| `protocol.ts` | `ClientFrame` gets `{ verb: 'BOARD'; board: BoardIo \| ProtocolError }`. A `BOARD` frame always decodes to this verb, so the session learns about an invalid board too (instead of the generic decode-error path). Plus `encodeClientFrame` for `WsTestClient`. |
| `server.ts` | `case 'BOARD'`: if `frame.board` is an error, send `ERROR protocol` with its message; in both cases call `session.handleBoard(frame.board)`. `PROTOCOL_VERSION = '2'`. |
| `session.ts` | `private board: BoardIo \| 'rejected' = DEFAULT_BOARD_IO`, `handleBoard(result)` (a valid board sets it; an invalid one sets `'rejected'`), and in `handleRun`: refuse when `'rejected'` (§ 8.2), else `engine.prepare({ …, board: this.board })`. |
| `engines/types.ts` | `PrepareRequest.board: BoardIo` (required). |
| `tbTemplate.ts` | `generateTestbench(entity, ports, board, options)`. `buildPortMap` builds `known` from `boardBindings(board)` (formal = binding name, actual = binding signal). `buildRstDrive` checks `declaresPort(ports, board.pushbuttons)`. `hasClock50 = declaresPort(ports, board.clock50)`. The formal is the binding's lower-case `key` (`key => key_sig`), exactly as today's map writes `key_n => key_sig`. VHDL ignores case, so this is valid for any board, and with `DEFAULT_BOARD_IO` the generated text stays byte-identical, so the golden files do not change. |
| `verilog/testbench.ts` | `BOARD_SIGNALS` becomes `boardBindings(board)` plus an off-value per role (`leds` → `10'b0`, `sevenSegment*` → `7'h7F`). `instantiation`, `tieOffs` and `buildBoardTestbench` take `board`. The clock check uses `board.clock50`. |
| `verilog/ports.ts` | `boardPortSpellings(ports, board)` and `isBoardDesign(ports, board)`, from `boardPortKeys(board)` (no legacy `rst`). |
| `portDetect.ts` | `findTopEntity(files, board, preferredFileName?, runTarget?)`. The score uses `boardPortKeys(board, { legacyReset: true })`. The "None of the declared entities…" message lists `describeBoardPorts(board)`. |
| `engines/extraPorts.ts` | `planExtraPorts(top, board)`, `explainUnconnectedPorts(text, top, board)`. `isBoardPort` and the remedy text use the board. |
| `engines/boardPortSuggestions.ts` | `suggestBoardInput(name, declared, board)`, `suggestBoardOutput(…)`, from `boardInputNames` / `boardOutputNames`. Combined with the hint in § 6.10, a student on DE1-SoC who wrote `KEY_N` gets "did you mean `KEY`?". |
| `engines/ghdlEngine.ts` | Passes `request.board` through. The elaboration error lists `describeBoardPorts(board)`. Timing uses `declaresPort(top.ports, board.clock50)`. |
| `engines/verilogEngine.ts` | `CLOCK_BOARD_NAME` is removed and `board.clock50` used instead. `standaloneHint(top, board)`. |
| `verilog/diagnostics.ts` | `standaloneHint(top, board)` lists `describeBoardPorts(board)`. |
| `testSupport/*` | `WsTestClient.board(io)` helper. Scenario builders take an optional board, defaulting to Default. |

`boardTiming.ts` is unchanged: it already takes a boolean. Only its comments mention `CLOCK_50`, and they now say "the 50 MHz clock".

---

## 10. Project file version 2

| | Version 1 (today) | Version 2 |
|---|---|---|
| `version` | `1` | `2` |
| `board` | a display name, always `"DE1-SoC"` in practice | a board **id**: `"default"`, `"de1-soc"`, or a user board's id |

- `src/project/types.ts`: `SUPPORTED_PROJECT_VERSIONS = [1, 2]`, `CURRENT_PROJECT_VERSION = 2`.
- `parseProject`: version 1 → `board = 'default'`, **whatever the text says**, because v1 files were all written with the
  Default names (F5). This needs no warning: the project opens exactly as it did before. Version 2 → `board` kept as written (validated as a string only).
  `resolveBoard` and the `knownBoards` option are removed. Whether a board is installed is decided at render time (§ 6.3).
- No guessing from the sources (D16). A v1 project whose files happen to use `KEY`/`HEX0` opens on Default, and the
  name-mismatch hint (§ 3.5) offers *Switch board to DE1-SoC* on the first Start.
- `serializeProject` always writes `version: 2`, with the board **id**.
- `parseStoredProject` (the desktop workspace) applies the same migration: `version 1` → board `default`.
- `public/projects/adder-and-counter/adder-and-counter.hdlboard.json` becomes `"version": 2, "board": "default"`.
  Its description no longer says "DE1-SoC exercises" but "board exercises".
- Compatibility: HDLBoard ≤ 1.5 refuses a version-2 file with its existing "Unsupported project file version 2" message.
  That is acceptable for a newer file. It goes in the changelog.

---

## 11. Clean Code rules for this work

1. **Single source of truth, with one deliberate exception.** Port names appear in `builtinBoards.json` and nowhere else in frontend production code. The backend's `DEFAULT_BOARD_IO` is the one deliberate copy: the two packages share no code, and it is the compatibility default for clients that send no `BOARD`. Both sides have a test that encodes or decodes **the same literal Default `BOARD` frame text**, so the two can never drift apart unnoticed. A shared package to remove six names is not worth a build-system change.
   A test (§ 14.1, T-grep) fails if `KEY_N`, `HEX0_N` or `'key_n'` appear in `src/**/*.ts(x)` or `server/src/**/*.ts`
   outside `builtinBoards.json`, `boardPorts.ts` (`DEFAULT_BOARD_IO`), the canonical `files.ts` / `newFile.ts` texts,
   tests and fixtures.
2. **Roles, not names.** Code that needs "the clock" asks for `board.clock50`. It never compares with a literal.
3. **Pure functions do the work.** Parsing, validating, renaming, planning and encoding are pure and unit-tested. Hooks
   and components hold state and render. `Workbench.tsx` gets *smaller*: the board panel and the board-change logic move out (§ 6.1).
4. **Command–query separation.** `planBoardChange` only computes. `applyBoardChange` only applies the plan it is given.
5. **Failures are values.** `SourceRename`, `ParsedBoards` and `BoardIo | ProtocolError` follow the codebase's
   `PrepareResult` style. Exceptions are only for bugs (an invalid built-in board).
6. **Explicit dependencies.** `board` is a required parameter (D11). There are no module-level "current board" variables
   and no defaults in production paths. Defaults exist only in test helpers.
7. **Intention-revealing names.** `renamesBetween`, `translateFromDefault`, `foreignBoardNames`, `canUndo`, `describeBoardPorts`. Constants
   such as `SEVEN_SEGMENT_COUNT` replace bare `6`.
8. **Small units.** Each new function does one thing. If a function needs an "and" in its doc comment, split it.
9. **Keep the house style.** The SPDX header, doc comments that say *why*, text constants gathered for UI tests (as
   `testbenchText.ts` / `findText.ts` do: a `boardText.ts` for § 3 strings), and `node:test` on the server / vitest in the frontend.

---

## 12. Implementation order and release strategy

**Release strategy:** the whole feature ships as **one release, 1.6.0**. The phases below are **review gates** on one
feature branch. Each phase is merged only when every test passes and the app works. Phases 1–3 change nothing a user can
see except the board name in the console and pane title. So if the work has to pause, the branch can be released after any
gate without half a feature in the UI.

**Gate 1: board definitions and the rename engine (frontend, pure, no visible change)**
1. `src/boards/types.ts`, `builtinBoards.json`, `boardNames.ts`, `parseBoards.ts`, `boardCatalog.ts`, `boardPorts.ts` with tests.
2. `renamePorts.ts` (with `keepColumn`, `translateFromDefault`), `boardMatch.ts`, `boardChangeUndo.ts` with tests (§ 14.1), including the round trip over every built-in example.
3. `boardFrame.ts` with tests.

**Gate 2: backend (default behaviour unchanged)**
4. `BoardIo`, `boardBindings`, `decodeBoardBody` with tests.
5. Thread `board` through `PrepareRequest`, engines, `tbTemplate.ts`, `verilog/testbench.ts`, `portDetect.ts`, `extraPorts.ts`,
   suggestions and diagnostics. All golden and characterization tests must pass **unchanged** with `DEFAULT_BOARD_IO`.
6. `BOARD` frame and the session board states (§ 8.2) in `server.ts` / `session.ts`, plus the GHDL and Icarus integration matrix (§ 14.2).

**Gate 3: project persistence and display**
7. Project file v2 and migration (`src/project/`, `projectFile.ts`, the bundled example project).
8. `useBoards`, active board from `project.board`, preferred board, `hdlClient.run(…, board)` with the old-backend handling, the `Board:` console line.
9. `BoardIoPanel`, component heading props, pane title.
10. `translateFromDefault` for examples, starter files and the New File template. Help dialog. `tbDetect` parameter. `testbenchText.ts`.

**Gate 4: changing the board**
11. `useBoardChange`, `BoardChangeDialog` (both modes), Undo.
12. Settings › Board group. Project page dropdown on `requestBoardChange` and `catalog`. "Not installed" actions.
13. Name-mismatch hint (§ 3.5, § 6.10).

**Gate 5: documentation and release**
14. `docs/BOARDS.md`, task-oriented (below), plus `public/boards/boards.json` and `public/boards/board.schema.json`.
15. README ("Real board pin names" bullet: the Default and DE1-SoC naming), `PROJECTS.md` (version 2), the wire-protocol
    chapter of `docs/ghdl_implementation_plan.md` (§ 6: the `BOARD` frame, version 2), `docs/changelog.txt`,
    `src/components/workbench/README.md`. Version bump to 1.6.0 (`npm run version:bump`).
16. The T-grep test (§ 11.1) is added **last**, when no old call site is left, so the branch stays green while it is being built.
17. Manual check `tests/e2e/board-config.md` (§ 14.3) in the browser build and the Windows app.

`docs/BOARDS.md` outline (tasks first, reference after):
1. ⚠ **Box at the top**: the Windows app overwrites `boards.json` on reinstall/upgrade. Back it up first (two steps).
2. Choose a board (Settings › Board), and what *Update files* does.
3. Add a board: a complete, copy-pasteable example of a supported board (a course variant with renamed ports), and an
   example of an **unsupported** one (DE10-Lite: 2 keys, 8-bit displays) with the reason.
4. Where the file is: dev / GitHub Pages / Docker (bind-mount snippet) / Windows (path).
5. Check a board: what Settings shows, and what the schema can and cannot check (§ 4.5).
6. Share a project that uses your board: the recipient needs the same board in their `boards.json`, or sees the "not installed" note.
7. Known limitations: names only, the counts and widths are fixed, polarity is fixed per role, keep ids stable, upgrades overwrite the file (Windows).
8. Reference: roles (§ 4.3), validation rules (§ 4.4), glossary (*board definition* = one entry in a board file;
   *catalog* = all boards available here; *active board* = the open project's board; *`BoardIo`* = the backend's port-name mapping).

---

## 13. Affected files

| File | Change |
|---|---|
| `src/boards/*` | **New** (§ 6.1) |
| `public/boards/boards.json`, `public/boards/board.schema.json` | **New** (§ 4) |
| `src/components/workbench/useBoards.ts`, `useBoardChange.ts`, `BoardChangeDialog.tsx`, `BoardIoPanel.tsx`, `boardText.ts` | **New** |
| `src/components/workbench/Workbench.tsx` | Active board, panel moved out, `run` with board, starter files per board, hooks wired, run-time board console lines |
| `src/components/workbench/SettingsDialog.tsx` (+ `.css`) | `BoardSetting` group (§ 3.2) |
| `src/components/workbench/ProjectPage.tsx` | Dropdown from the catalog with description tooltips, `requestBoardChange`, "not installed" note with action |
| `src/components/workbench/hdlClient.ts` | `BOARD` frame, protocol version 2, old-backend handling once per connection |
| `src/components/workbench/examples.ts` | `copyExample(…, board)`, card title |
| `src/components/workbench/files.ts` | Header comment only (canonical Default form) |
| `src/components/workbench/newFile.ts` | `newFileContent(input, language, board)` |
| `src/components/workbench/HelpDialog.tsx` | `board` prop, `signalRows(board)`, conditional `_N` text |
| `src/components/workbench/tbDetect/boardPorts.ts`, `designUnits.ts`, `analyzeProject.ts`, `useTestbenchAnalysis.ts` | Board port names as a parameter (§ 6.9) |
| `src/components/workbench/testbenchText.ts` | Board-neutral wording |
| `src/components/workbench/projectFile.ts` | No `KNOWN_BOARDS`. Preferred board for new and default projects. v1 migration in `parseStoredProject` |
| `src/components/Pushbuttons/Pushbuttons.tsx`, `src/components/SevenSegment/SevenSegmentDisplays.tsx` | `port` prop. `_N` no longer derived from `activeLow`. Heading ellipsis |
| `src/project/types.ts`, `src/project/parseProject.ts` | Version 2, migration, no `resolveBoard` |
| `public/projects/adder-and-counter/adder-and-counter.hdlboard.json` | Version 2, `board: "default"` |
| `server/src/engines/boardPorts.ts` | Rewritten (§ 9.1) |
| `server/src/protocol.ts`, `server.ts`, `session.ts`, `engines/types.ts` | `BOARD` frame, session board states, `PrepareRequest.board` |
| `server/src/tbTemplate.ts`, `verilog/testbench.ts`, `verilog/ports.ts`, `portDetect.ts`, `engines/extraPorts.ts`, `engines/boardPortSuggestions.ts`, `engines/ghdlEngine.ts`, `engines/verilogEngine.ts`, `verilog/diagnostics.ts` | Board as a parameter (§ 9.3) |
| `server/src/testSupport/WsTestClient.ts`, `scenarios.ts` | Board helper |
| `docs/BOARDS.md` | **New** |
| `README.md`, `docs/PROJECTS.md`, `docs/ghdl_implementation_plan.md` (§ 6), `docs/changelog.txt`, `src/components/workbench/README.md` | Docs |
| `tests/e2e/board-config.md` | **New** manual check |

Not changed: `STIM`/`STATE`, `boardBits.ts`, `boardTiming.ts` (code), the waveform viewer, GitHub storage (it stores the project file text it is given).

---

## 14. Tests

### 14.1 Frontend unit tests (vitest)

`parseBoards.test.ts`
- Both built-ins parse. Labels and `clock500Hz` get their defaults when missing.
- Each rule of § 4.4 rejects with its own message, which includes the JSON path: bad id, duplicate id, duplicate display name, missing role, extra role, 5 or 7 seven-segment names, `KEY__N`, `KEY_`, `1KEY`, `signal` (VHDL reserved), `wire` (Verilog reserved), `rst`, `Key`/`KEY` in one board, a 9-character label.
- An invalid board is skipped and the others still load. `loadUserBoards` follows each row of the § 4.1 table: 404 → no warning; 500, a rejected fetch, an empty body, non-JSON → one warning each; nothing throws.
- Both built-ins also validate against `board.schema.json` (a tiny structural check, without a library).
- The shipped `public/boards/boards.json` parses with **zero** warnings, so a broken example file can never ship.

`renamePorts.test.ts`
- VHDL: a declaration, `KEY_N(0)`, `KEY_N'range`, `key_n` (lower case) → `KEY`, named association `KEY_N => k`, a selected name `rec.KEY_N`, `alias k is KEY_N`, `HEX0_N_reg` untouched, `report "KEY_N"` untouched, `-- KEY_N(1): reset` → `-- KEY(1): reset`, `-- the key is` untouched, `\KEY_N\` untouched, a VHDL-2008 `/* KEY_N */` comment renamed (pinned, § 7.2).
- Verilog: `input wire [3:0] KEY_N`, `KEY_N[1:0]`, `uut.KEY_N`, `` `define KEY_N 4 `` with `` `KEY_N `` (both renamed), `$display("KEY_N=%b", KEY_N)` (only the argument changes), an escaped identifier untouched, `/* … KEY_N … */` across lines, a `KEY`/`key` pair → conflict.
- Comments: a comment word is renamed only when the file also uses the name as an identifier ("hold KEY pressed" in a file without a `KEY` identifier stays).
- A conflict when `signal key` exists. No conflict when the file already uses only the new names (count 0). A file whose name appears only in comments → count 0 (nothing renamed, by the comment rule).
- A tokenizer exception → `{ ok: false }` (fail closed).
- Swap safety: renames `A→B, B→A` swap correctly in one pass.
- `keepColumn`: `KEY_N    : in` ↔ `KEY      : in`. A single space is never changed. Whitespace with a tab is never changed.
- Bytes: CRLF files keep CRLF, a BOM stays.
- **Round trip**: for every `EXAMPLE_FILES` entry and every built-in board X: `translateFromDefault` Default→X→Default gives back the original text, and Default→X has no conflicts.
- **Examples declare the board's names**: after translation to `de1-soc`, the VHDL and Verilog examples' top-level ports (from `designUnits`) contain `KEY` and `HEX0`…, and none of `KEY_N` and `HEX0_N`….
- `planBoardChange`: one conflicting file → `conflicts` non-empty, and the plan reports that nothing is applied. `applyBoardChange` returns a new array and does not change its input. `renameWaveViews` renames a `uut.KEY_N` path, and a Default→DE1→Default round trip gives back the views.

`boardChangeUndo.test.ts`: `canUndo` true right after a change; false after an edit, add, delete or rename of any file; false after another board change. Restoring gives byte-identical files, waveform views and board. A board-only change undoes the board only.
`boardMatch.test.ts`: `SW`/`LEDR`-only designs → no hint. `KEY_N` on DE1-SoC → Default with `[KEY_N]`. A tie between two boards → no hint. A unit without ports → no hint.
`boardPorts.test.ts`: `renamesBetween`, `sevenSegmentHeading` (both patterns plus the compact fallback).
`boardFrame.test.ts`: exact text for both built-ins. The **same literal Default frame text** appears in the server's `protocol.test.ts` (the shared contract, § 11.1).
`parseProject.test.ts`: v1 `"DE1-SoC"` → `default`, and opening it raises no rename question; v2 kept; an unknown v2 id is kept through parse → serialize → parse; a project saved on `de1-soc` reopens as `de1-soc` (the id, never the display name, is written).
`preferredBoard.test.ts`: nothing stored → `default`; garbage → `default`; opening a project does not write it.
`boardText.test.ts`: the dialog, hint, warning and console strings of § 3, exactly (house style).
`examples.test.ts` / `newFile.test.ts`: the copy uses the active board's names.
T-grep (§ 11.1, added in gate 5): scans the source tree for stray hard-coded port names.

### 14.2 Backend tests (node:test)

- `protocol.test.ts`: `BOARD` decode/encode. Each rejection, **sent directly as protocol text and bypassing the frontend**: missing role, duplicate role, 5 names, `KEY;`, `KEY)`, a newline inside a name, `rst`, `Key`+`KEY`. A reserved word (`signal`) passes decoding (the defined behaviour of § 9.2).
- `tbTemplate.test.ts`, `verilog/testbench.test.ts`: all existing goldens unchanged with `DEFAULT_BOARD_IO`. New goldens `hdl_board_tb.de1-soc.vhdl` / `.v`.
- `portDetect.test.ts`, `extraPorts.test.ts`, `boardPortSuggestions.test.ts`: with DE1-SoC, `KEY_N` is an extra input and gets "did you mean `KEY`?". `KEY` is a board port.
- `session.test.ts`, **several runs per session**: no `BOARD` → Default; `BOARD`(DE1) + `RUN` + `RUN` → both runs DE1 (sticky); `BOARD`(DE1) + `BOARD`(Default) + `RUN` → Default; invalid `BOARD` + `RUN` → `RUN refused`, nothing compiled; then a valid `BOARD` + `RUN` → runs.
- A reserved-word board name gives a compile error under stage `internal` and nothing else.
- **Integration matrix (GHDL and Icarus)**, each asserting simulated I/O through the scenario harness, not only that something compiles:

  | Design | Board sent | Expect |
  |---|---|---|
  | key-counter-7seg, VHDL, Default names | Default (no frame) | KEY0 ×2 → `HEX0` shows 2 |
  | key-counter-7seg, VHDL, DE1-SoC names | DE1-SoC | KEY0 ×2 → `HEX0` shows 2 |
  | key-counter-7seg, Verilog, Default names | Default | same |
  | key-counter-7seg, Verilog, DE1-SoC names | DE1-SoC | same |
  | key-counter-7seg, VHDL, Default names | DE1-SoC | "did you mean `KEY`?" warning; keys held at 0 |
  | AND-gate testbench (no board ports) | DE1-SoC | runs as a batch run, unchanged |

  Together these are the proof that "the simulation works when the names change".

### 14.3 Manual check (`tests/e2e/board-config.md`)

1. **First visit** (clear site data): the board is Default. Settings › Board → DE1-SoC → the dialog lists `KEY_N→KEY`, `HEX0_N…→HEX0…` → *Update files* → the starter file reads `KEY`/`HEX0` with aligned ports. The pane says *Board I/O · DE1-SoC*.
2. Start → the console shows `Board: DE1-SoC`. Switches light LEDs. Open *Key Counter to 7-Segment* → it opens with `KEY`/`HEX0` → Start → KEY0 counts.
3. Undo → names and board come back. Change again, edit a file, then Undo → "Nothing to undo …"; Settings › Board → Default renames back.
4. **Returning visit**: reload after choosing DE1-SoC and clearing the workspace → the new starter files use `KEY`/`HEX0` (the preferred board).
5. *Change board only* → Start → the mismatch hint names the ports → *Fix…* → *Rename files to DE1-SoC names* → Start runs clean. Repeat with *Switch board to Default*.
6. Board change while a simulation runs → it stops; Start runs with the new names.
7. Add `signal key : std_logic;` to a file → board change → *Update files* is disabled and the file is named; *Change board only* still works; Cancel from Settings returns to Settings.
8. Open an old (v1) project → board Default, runs as before, no question. Save → `version: 2`, `board: "default"`.
9. Open a project whose board is not installed → the Project page note and the console line on Start, both with *Choose a board…*; save → the id is kept.
10. Add a broken board to `boards.json` → Settings shows the warning with its JSON path. Add a valid one → it is listed and works.
11. Desktop app (Windows): 1–2, and an edit of `resources\frontend\boards\boards.json` is picked up after a restart.

---

## 15. Acceptance criteria

Each criterion is checked by the test named after it.

- Default and DE1-SoC are selectable in Settings. The open project's board is the one shown and simulated. *(14.3-1, 14.3-2)*
- For each of VHDL and Verilog on GHDL and Icarus, a design in a board's names simulates its I/O correctly on that board. *(14.2 integration matrix)*
- With no `BOARD` frame the backend behaves byte-for-byte as before: every existing golden and protocol test passes unchanged. *(14.2)*
- An invalid `BOARD` never leads to a simulation. *(14.2 session tests)*
- The rename follows § 7.0 and § 7.2 exactly. A plan with a conflict changes no file. *(renamePorts / planBoardChange tests)*
- Undo restores the complete earlier state when `canUndo` holds, and refuses otherwise. *(boardChangeUndo tests, 14.3-3)*
- Every v1 fixture opens on Default without a question and simulates as before. *(parseProject tests, 14.3-8)*
- A project with an unknown board id stays openable, editable and saveable, and the id is preserved. *(parseProject tests, 14.3-9)*
- Built-in examples, the starter files and New File use the active board's names. *(round-trip and examples tests)*
- Panel headings, the pane title and Help show the active board's names. A DE1-SoC heading has no `_N`. *(14.3-1)*
- An expert can add a board by editing `boards/boards.json` alone, and gets a message with the JSON path if it is wrong. *(parseBoards tests, 14.3-10)*

---

## 16. Out of scope (possible later work)

- **Different I/O shapes**: other counts and widths (DE10-Lite: 2 keys, 8-bit `HEX` with decimal point, `MAX10_CLK1_50`), active-high
  buttons, extra LED banks. This needs a variable-length `STIM`/`STATE`, testbench signal widths from the board, and panels built
  from counts. Board file `version: 2` would add `width`/`count`/`activeLow` per role. The v1 format was chosen so this is an
  extension, not a break. Do it only when a concrete board needs it.
- An **upgrade-safe user board location** for the Windows app (for example `%APPDATA%\HDLBoard\boards.json`, merged with the
  shipped file through the desktop bridge).
- A board editor or an *Import board…* button (not wanted, per the request: a file is enough).
- A before/after diff in the Change-board dialog.
- Renaming the top-level file and entity (`DE1_SoC.vhdl`) per board.
- Pin-assignment export (`.qsf`) from a board file.

---

## 17. Rejected alternatives

| Alternative | Why not |
|---|---|
| Plain-text Replace All (the Find bar's matcher) | Partial-word, string and case errors, cascades, silent merges (F6). |
| One copy of every example per board | Duplication grows with every board. The rename engine already exists and is tested by the round trip. |
| Board choice only in Settings (localStorage) | Conflicts with the project file's `board` (F4). A shared project would open on whichever board the receiver happened to pick. |
| Server reads the board files | In Docker the frontend (nginx) and the backend are separate containers, and the server would need a second copy and its own validator. The client already has the definition. |
| Board id in the `RUN` head line | `RUN`'s inline args already carry file and unit with a careful regex. A separate frame follows the `WAVE` precedent and keeps each decoder simple. |
| Keeping project version 1 and reinterpreting `"DE1-SoC"` | Ambiguous forever: the same text would mean two different namings depending on when the file was saved (F5). |
| Guessing a v1 project's board from its sources | A heuristic in the loader makes opening a project depend on its content, and it is hard to test exhaustively. HDLBoard ≤ 1.5 did not run `KEY`/`HEX0` designs at all, so such projects are rare, and the name-mismatch hint fixes them with one click (D16). |
| Partial rename (update the files without conflicts, skip the others) | It can leave the design renamed and its testbench not: a project that no longer compiles, made by HDLBoard. All or nothing is simpler and safe (D6). |
| Whole-project rename preview as a diff | Every change is one of the listed `old → new` pairs, so the mapping *is* the change. Undo makes trying it safe. A diff view is a new component for little gain (§ 16). |
| A toast/banner for Undo | HDLBoard has no toast system, and the console is already where run messages and actions (`open-waveform`) live. One mechanism is simpler. |
| Undo that survives later edits | It would overwrite those edits, or need a merge. Changing the board back does the safe version of this (D8). |
| Reserved-word lists in the backend | A second copy of about 250 words, to improve an error that HDLBoard's own frontend cannot cause (§ 9.2). |
| A `capabilities` object in the v1 board format | Describes features that do not exist yet. The `version` field is the extension point (§ 16). |
| An optional heading string per board | More configuration for a cosmetic case. The compact fallback plus ellipsis is enough. |
| Placeholder templates (`{{KEY}}`) for examples | Examples would no longer be valid HDL in the repository (no syntax check, no golden test), and it would be a second translation mechanism next to the rename. |
| A JSON-schema library at run time | A new dependency for six fixed keys. A small hand-written validator gives better messages. |

---

## 18. Research notes

- **DE1-SoC names.** Terasic's System Builder / golden top and course material for the DE1-SoC declare
  `input [3:0] KEY`, `input [9:0] SW`, `output [9:0] LEDR`, and `output [6:0] HEX0 … HEX5` (separate 7-bit ports, active low).
  Example: the University of Washington CSE 369 lab top level for the DE1-SoC.
- **Other Terasic boards differ in shape**, not only in name. The DE10-Lite has `KEY[1:0]`, 8-bit `HEX0…HEX5` with a
  decimal point, and `MAX10_CLK1_50`. That is why widths are left for a later format version.
- **One JSON file per board definition, validated against a schema** is common practice for board catalogues (for example the
  FPGA Developer board repository: one JSON per board, checked against a `schema.json`). HDLBoard keeps this
  idea (JSON plus a schema for editor help) but uses one user file, because a static web server cannot list a folder,
  and one file is the simplest thing for a teacher to edit.
- **Renaming code safely** is done by IDEs as *Rename symbol* on tokens, not on text. HDLBoard already has the tokenizer the
  editor uses (`highlight.ts`), so the rename uses exactly the editor's notion of identifiers, comments and strings.

---

## 19. Review log

Four reviews of the first version of this spec were weighed against the guiding rule (logical, easy to implement).
Where reviewers disagreed, the simpler safe option was chosen.

### 19.1 Taken

| Point (reviews) | Change in this spec |
|---|---|
| `BOARD` semantics: "Default when none" vs "keep the last" were not the same; an invalid frame kept the old board silently | Explicit session state machine: Default / Set (sticky) / Rejected; an invalid frame fails the next run closed. Multi-run tests (§ 8.2, § 14.2, D15) |
| A partial rename can leave the project inconsistent (design renamed, testbench not) | **All or nothing**: any conflict disables *Update files* (D6, § 3.3) |
| Undo needed an exact validity rule and full restore | `boardChangeUndo.ts`: a record, a `canUndo` rule (reference identity of immutable state, plus the board), all-or-nothing restore, unit tests. Every board change, including *board only*, gets Undo. Changing the board back is the general way back (D8, § 3.3) |
| The mismatch hint's action pointed at `requestBoardChange(active)`, which is a no-op | New `requestRenameToBoard` and a two-choice dialog: *Switch board* / *Rename files* (§ 3.5) |
| The mismatch heuristic could fire by coincidence | Only declared top ports that are **not** on the active board but **are** on another; shared names never count; ties and portless units give no hint; the names are shown (§ 6.10) |
| `tbDetect` ignored user boards; "pure" was no reason | Port names passed in as a parameter: built-ins ∪ active board (D13, § 6.9) |
| A project on a board that is not installed was confusing | A console line on every run and a *Choose a board…* action; the id is kept until the user picks a board (§ 3.1, § 3.4) |
| The protocol version and old-backend behaviour were half-specified; the error would repeat on every run | HELLO stays informational (both directions verified); old backend detected once per connection, with one actionable message (§ 8.2, § 6.5) |
| Preferred board vs "fresh start shows Default" contradiction | Precise rule: first visit Default; written on a user board change; not written on project open (§ 6.4, § 14.3) |
| Comment renames on the reverse direction could hit prose ("hold KEY pressed") | Comments are renamed only for names the file also uses as identifiers (D5, § 7.2) |
| Alignment rule unclear for tabs | Kept as one small tested function; never touches whitespace with a tab or a single space (§ 7.2) |
| Rename contract and non-goals were implicit | § 7.0, plus tests for aliases, selected and hierarchical names, macros, BOM, and a fail-closed tokenizer |
| `clock500Hz` had to be invented for every user board | Optional in the file, default `CLOCK_500Hz`, marked simulator-provided. The wire frame stays complete (§ 4.2, § 8.1) |
| `labels` vs port names vs headings were blurred | A "three kinds of name" table and label rules (§ 4.3, § 4.4) |
| Load errors and warning detail were under-specified | A load-outcome table; warnings carry file, index, id, JSON path, expected vs found; duplicate display names are skipped (§ 4.1, § 4.4) |
| Case-insensitive uniqueness rationale, reserved words on the server | Rationale stated; the server deliberately skips reserved words, with defined compile-error behaviour and a test (§ 4.4, § 9.2) |
| Concurrency and lifecycle of the dialog | Modal; plan computed once and re-checked on confirm; selectors disabled while busy; applied in one state update; Cancel returns to Settings (§ 3.2, § 3.3) |
| Limitations must be visible | Settings says counts are fixed and links to `BOARDS.md`; `BOARDS.md` is task-oriented with a warning box, a supported and an unsupported example, and the schema's limits (§ 3.2, § 4.5, § 12) |
| Default description conflated naming and polarity | "HDLBoard's original names: KEY_N and HEX0_N … HEX5_N." Polarity is explained in Help only (§ 3.2, § 4.2) |
| `onBoard` was a vague name, and template translation looked coupled to the board-change workflow | `translateFromDefault`, documented as a thin wrapper around `renameInSource` (§ 6.7) |
| Bundled example project vs Examples pane behaved differently, without saying so | Stated: projects open on their own board, the Examples pane translates (§ 3.4) |
| Release strategy, review gates, T-grep timing, measurable criteria, more tests | § 12 (one release, five gates, T-grep last), § 14 (integration matrix, undo/match/text/preference tests), § 15 (each criterion linked to its test) |
| `$schema` in the built-in file would not resolve; the protocol doc was missing from affected files | Removed from the built-in file; `docs/ghdl_implementation_plan.md` § 6 added (§ 4.2, § 13) |
| Small UX polish | File list capped at 5; compact seven-segment fallback with ellipsis; description tooltips on the Project page; storage-key rule in `preferredBoard.ts` |

### 19.2 Not taken (with the reason)

| Suggestion | Reason |
|---|---|
| Guess a v1 project's board from its sources | Non-deterministic loading; such projects could not run in ≤ 1.5 anyway; the mismatch hint fixes them in one click (§ 17, D16) |
| Toast/banner for Undo; Undo that survives later edits | No toast system exists and the console already carries actions; surviving edits would overwrite them. Changing the board back is the safe general undo (§ 17) |
| Diff preview in the dialog | The mapping is the whole change, and Undo exists (§ 16, § 17) |
| *Import board JSON* in Settings, or an upgrade-safe location now | The request asks for a file, not a UI. The upgrade-safe location needs desktop-bridge work and is listed as future work. The Windows overwrite is documented prominently (§ 16) |
| Reserved-word validation on the server | It would duplicate the word lists for an error the frontend cannot cause. The behaviour is defined and tested instead (§ 9.2) |
| Remove column alignment | Kept, but narrowed to one small tested function, so the first code a student sees looks tidy on every board (§ 7.2) |
| Mismatch check over all files | The simulation only depends on the top unit's ports, and the all-or-nothing rename prevents mixed projects being created by HDLBoard (§ 6.10) |
| A `capabilities` field, a per-board heading string | Not needed yet. The format `version` is the extension point (§ 17) |
| "Correct" the VHDL block-comment statement | VHDL-2008 does have `/* … */` delimited comments (IEEE 1076-2008 § 15.9). The text now states both comment forms precisely, and that the editor's VHDL tokenizer does not colour them (§ 7.2) |
| Split the feature over several releases | One release with review gates gives the same isolation without shipping half a feature (§ 12) |
