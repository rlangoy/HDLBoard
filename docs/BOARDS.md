<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# Boards: port names for your course

HDLBoard's board has fixed parts: 10 switches, 4 pushbuttons, 10 red LEDs, six 7-segment displays, a 50 MHz
clock and the simulator's 500 Hz clock. What a **board** decides is the **names** your top-level entity
(VHDL) or module (Verilog) uses for them. Two boards are built in:

| Board | Pushbuttons | Displays | Other ports |
|---|---|---|---|
| **Default** | `KEY_N[3:0]` | `HEX0_N` … `HEX5_N` | `CLOCK_50`, `CLOCK_500Hz`, `SW[9:0]`, `LEDR[9:0]` |
| **DE1-SoC** | `KEY[3:0]` | `HEX0` … `HEX5` | the same |

DE1-SoC uses Terasic's names, as in the DE1-SoC System Builder top level, so a design can go to Quartus
unchanged. More boards are added in a JSON file, with no programming. This page tells you how.

> **⚠ Windows app: a reinstall or an upgrade overwrites `boards.json`.**
> Before you install a new version of HDLBoard:
> 1. Copy `<install folder>\resources\frontend\boards\boards.json` somewhere safe.
> 2. After the installation, copy it back.

## Choose a board

Open **Settings** (top right) and pick a board under **Board**. The choice belongs to the open project (it is
saved in its project file) and is also remembered for your new projects. The Project page's **Board** list does
the same.

When your files use the old board's names, HDLBoard asks:

- **Update files** renames the ports in all your files and changes the board. Only whole names in code are
  renamed (and the same names in comments); strings and longer names such as `HEX0_N_reg` are left alone.
  If a file cannot be renamed safely, for example because it already has a signal called `key`, nothing is
  renamed and the dialog says which file and why.
- **Change board only** changes the board and leaves your files as they are.

Either way the console shows what happened, with an **Undo**. Undo works until you change something else;
after that, choose the previous board again to rename back.

If you start a design that uses another board's names, the console says so before the run, and **Fix…** offers
to switch the board or to rename the files.

The polarity never changes with the names: the pushbuttons and the displays are active low on every board.
`KEY(0) = '0'` means "pressed" exactly as `KEY_N(0) = '0'` did.

## Add a board

Edit `boards/boards.json` (where it is: see the next section). A complete example, a course that calls the
pushbuttons `BTN` and the displays `SEG0` … `SEG5`:

```json
{
  "$schema": "./board.schema.json",
  "version": 1,
  "boards": [
    {
      "id": "course",
      "name": "Course board",
      "description": "Our lab's names: BTN and SEG0 … SEG5.",
      "ports": {
        "clock50": "CLOCK_50",
        "switches": "SW",
        "pushbuttons": "BTN",
        "leds": "LEDR",
        "sevenSegment": ["SEG0", "SEG1", "SEG2", "SEG3", "SEG4", "SEG5"]
      },
      "labels": { "pushbuttons": "BTN", "sevenSegment": "SEG" }
    }
  ]
}
```

Reload HDLBoard: **Course board** is listed in Settings › Board.

- `id` is what project files store. **Choose it once and never change it**: a project that names an id that
  is no longer there opens with the Default names.
- `name` is shown in Settings; `description` (optional) beside it.
- `ports` names each part. `clock500Hz` is optional (`CLOCK_500Hz` when left out): it is a simulator-only
  clock that no real board has.
- `sevenSegment` lists the six displays, **the rightmost display first**.
- `labels` (optional) is the small text under the parts on the board picture: `BTN` gives `BTN3 … BTN0`.
  Left out: `SW`, `KEY`, `LEDR`, `HEX`.

### A board that cannot be added (yet)

The DE10-Lite has 2 pushbuttons, 8-bit displays with a decimal point and a clock called `MAX10_CLK1_50`.
A board file can rename the ports, but not change how many there are or how wide they are, so this board is
rejected:

```
boards/boards.json: boards[1] "de10" was skipped: ports.sevenSegment needs exactly 6 names (found 8).
```

## Where the file is

| HDLBoard | The file |
|---|---|
| Development (`npm run dev`) and GitHub Pages | `public/boards/boards.json` in the repository (rebuild or redeploy) |
| Docker | `/usr/share/nginx/html/boards/boards.json` in the `web` container |
| Windows app | `<install folder>\resources\frontend\boards\boards.json` (see the warning at the top) |

In Docker, keep your own file outside the container with a bind mount, in `docker-compose.yml`:

```yaml
services:
  web:
    volumes:
      - ./my-boards.json:/usr/share/nginx/html/boards/boards.json:ro
```

The file is read every time HDLBoard starts, so a reload picks up a change.

## Check a board

Open **Settings** after a reload. A board that breaks a rule is not listed; instead a red line under **Board**
says what is wrong, with the board's place in the file and the JSON path:

```
⚠ boards/boards.json: boards[0] "course" was skipped: ports.pushbuttons "BTN_" is not a plain identifier …
```

The other boards in the file still load. The same lines are in the browser's console.

`board.schema.json`, next to `boards.json`, gives VS Code (and other editors that read JSON Schema)
autocompletion and red squiggles while you edit. The schema cannot check everything, so a file without
squiggles can still be rejected. It does not check:

- that names differ **ignoring case** (`Key` and `KEY` would be one port in VHDL);
- reserved words (`signal`, `wire`, …) and the reserved name `rst`;
- that display names (`name`) are unique, ignoring case.

HDLBoard's own message in Settings is the final word.

## Share a project that uses your board

A project file stores the board's id. Whoever opens it needs the same board in their `boards.json`. Without it,
the project still opens and runs, with the Default names, and HDLBoard says so on the Project page and before
every run (**Choose a board…**). The id is kept when the project is saved.

## Known limitations

- A board file renames ports only. The number of switches, keys, LEDs and displays, their widths and the clocks
  are the same on every board. A later version of the board format can add them.
- Polarity is fixed per part: the pushbuttons and the displays are active low.
- Keep ids stable: a project refers to its board by id.
- The Windows app overwrites `boards.json` when it is reinstalled or upgraded.
- Starter files, examples and New File are translated from the Default names. A file name such as
  `DE1_SoC.vhdl` stays as it is on every board.

## Reference

### Roles

| `ports` key | Direction | Width | Default | DE1-SoC |
|---|---|---|---|---|
| `clock50` | in | 1 bit, 50 MHz | `CLOCK_50` | `CLOCK_50` |
| `clock500Hz` (optional) | in | 1 bit, 500 Hz, simulator only | `CLOCK_500Hz` | `CLOCK_500Hz` |
| `switches` | in | 10 bits | `SW` | `SW` |
| `pushbuttons` | in | 4 bits, active low | `KEY_N` | `KEY` |
| `leds` | out | 10 bits, active high | `LEDR` | `LEDR` |
| `sevenSegment` | out | 6 ports × 7 bits, active low, rightmost first | `HEX0_N` … `HEX5_N` | `HEX0` … `HEX5` |

### Rules

The file is a JSON object with `"version": 1` and a `boards` array. Each board:

- `id`: lower-case letters and digits joined by single hyphens (`de1-soc`), at most 32 characters, unique.
  A board whose id is taken (the built-ins come first) is skipped.
- `name`: not empty, at most 40 characters, unique ignoring case. `description`: at most 140 characters.
- `ports`: the five roles above (and optionally `clock500Hz`), nothing else; `sevenSegment` exactly 6 names.
- Every port name: a letter, then letters, digits and single underscores (no `__`, no `_` at the end), at most
  32 characters; not a VHDL or Verilog reserved word; not `rst`; all names of a board differ ignoring case.
- `labels`: only `switches`, `pushbuttons`, `leds`, `sevenSegment`; each a name of at most 8 characters.

### Glossary

- **Board definition**: one entry of a board file.
- **Catalog**: all boards available here (the built-in ones, then those of `boards.json`).
- **Active board**: the open project's board; the board panel shows it and the simulation uses it.
- **`BoardIo`**: the backend's port-name mapping, sent to it in a `BOARD` frame before every run.
