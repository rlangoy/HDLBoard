<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# Boards: port names and shapes for your course

A **board** decides which parts the Board pane shows — how many switches, pushbuttons, LEDs and 7-segment
displays, and their polarity — and the **names** your top-level entity (VHDL) or module (Verilog) uses for them.
Five boards are built in:

| Board | Clock | Switches / LEDs | Pushbuttons | Displays |
|---|---|---|---|---|
| **Default** | `CLOCK_50`, 50 MHz | `SW[9:0]` / `LEDR[9:0]` | `KEY_N[3:0]`, active low | `HEX0_N` … `HEX5_N`, 7 bits |
| **DE1-SoC** | `CLOCK_50`, 50 MHz | `SW[9:0]` / `LEDR[9:0]` | `KEY[3:0]`, active low | `HEX0` … `HEX5`, 7 bits |
| **DE10-Lite** | `MAX10_CLK1_50`, 50 MHz | `SW[9:0]` / `LEDR[9:0]` | `KEY[1:0]`, active low | `HEX0` … `HEX5`, 8 bits (bit 7 = decimal point) |
| **Basys 3** | `clk`, 100 MHz | `sw[15:0]` / `led[15:0]` | `btnC`, `btnU`, `btnL`, `btnR`, `btnD` in a cross, active high | 4 digits, multiplexed: `seg[6:0]`, `dp`, `an[3:0]` |
| **Nexys A7** | `CLK100MHZ`, 100 MHz | `SW[15:0]` / `LED[15:0]` | `BTNC` … `BTND` in a cross, active high; reset button `CPU_RESETN`, active low | 8 digits, multiplexed: `CA` … `CG`, `DP`, `AN[7:0]` |

Every board also has `CLOCK_500Hz`, a simulator-only 500 Hz clock. The Terasic and Digilent boards use the
vendors' own names, so a design can go to Quartus or Vivado unchanged (apart from deleting `CLOCK_500Hz`).
More boards are added in a JSON file, with no programming. This page tells you how.

> **⚠ Windows app: a reinstall or an upgrade overwrites `boards.json`.**
> Before you install a new version of HDLBoard:
> 1. Copy `<install folder>\resources\frontend\boards\boards.json` somewhere safe.
> 2. After the installation, copy it back.

## Choose a board

Open **Settings** (top right) and pick a board under **Board**. The choice belongs to the open project (it is
saved in its project file) and is also remembered for your new projects. The Project page's **Board** list does
the same. Settings shows each board's description and, for Basys 3 and Nexys A7, links to its design resources.

When you change the board, HDLBoard asks first if your files use the old board's names or the boards have
different parts:

- **Update files** renames ports in all your files and changes the board. It is offered between **Default,
  DE1-SoC and DE10-Lite** (and user boards built like them: the buttons as one vector, one port per display).
  A port is renamed only when nothing else about it has to change: the same width, the same polarity, the same
  kind of port. Only whole names in code are renamed (and the same names in comments); strings and longer names
  such as `HEX0_N_reg` are left alone. If a file cannot be renamed safely, nothing is renamed and the dialog says
  which file and why.
- **Change board only** changes the board and leaves your files as they are.
- **Change by hand** lists everything that is not renamed: a different clock frequency, number of switches,
  buttons, LEDs or displays, a polarity, a reset button, a multiplexed display.

Renaming to or from **Basys 3 and Nexys A7** is not done yet: their buttons are single ports in a cross and their
display is multiplexed, so such a change renames nothing and the dialog only lists what to change by hand,
starting with the port names to use (Help lists them for the active board).

Example, Default → Basys 3:

```
Change by hand:
  • Port names: use the Basys 3 board's names (Help lists them); they are not renamed for you.
  • Clock frequency: 50 MHz → 100 MHz (divider and counter constants change).
  • Switches: 10 → 16 (sw[15:0]).
  • Pushbuttons: 4 active-low (KEY_N[3:0]) → 5 active-high in a cross (btnC, btnU, btnL, btnR, btnD).
  • LEDs: 10 → 16 (led[15:0]).
  • 7-segment: 6 separate displays → a 4-digit multiplexed display (seg[6:0], dp, an[3:0]).
```

Example, DE1-SoC → DE10-Lite: `CLOCK_50` is renamed to `MAX10_CLK1_50`; the keys (4 → 2) and the displays (7 → 8
bits) are listed by hand.

Either way the console shows what happened, with an **Undo**. Undo works until you change something else;
after that, choose the previous board again to rename back.

If you start a design that uses another board's names, the console says so before the run, and **Fix…** offers
to switch the board or to rename the files. If a board port has the wrong width — `SW` with 10 bits on a
Basys 3 — the run stops before the simulator starts and says what to declare instead:

```
SW is declared as std_logic_vector(9 downto 0) (10 bits), but the Basys 3 board has 16 switches.
Expected: sw : in std_logic_vector(15 downto 0);
```

(In Verilog this is a warning and the run goes on: Icarus connects the low bits.)

### Examples, starter files and New File

The built-in examples are written for boards with 10 switches, 4 keys and 6 displays (Default, DE1-SoC). Basys 3,
Nexys A7 and DE10-Lite have examples of their own, stored in `src/components/workbench/boardExamples/<board id>/`
and written in the board's names with only the ports each one uses; the list is the same without the example that
drives the 7-segment displays. On any other board the Examples pane says so and offers **New
starter file** instead: a top file with every port of the board in its own names, the LEDs following the switches
and the displays off.

**New File** (the **+** in Files) asks for a name, a language (VHDL or Verilog) and a **Board**; the new file
declares that board's ports. Ticking **Create project** (`.hdlboard.json`) makes the name the project's and gives
it one top file for the chosen board, named after the board like the entity or module inside it: `Nexys_A7.vhdl`
with `entity Nexys_A7`, `Basys_3.v` with `module Basys_3` (`DE1_SoC` for Default). If Files already holds files,
HDLBoard asks:

- **Keep files**: the project lists them and a new top file in *their* board's names; when you chose another
  board, the usual Change board question follows.
- **Remove files**: Files holds only the new top file. Copies saved on disk or on GitHub are not touched; changes
  not saved are lost.
- **Cancel** creates nothing.

On a board whose seven segments are separate ports (Nexys A7: `CA` … `CG`) the generated file drives them through
one vector, so a segment pattern is written as a vector: `HEX(0)` is segment a (`CA`).

```vhdl
signal HEX : std_logic_vector(6 downto 0);
...
(CG, CF, CE, CD, CC, CB, CA) <= HEX;  -- single segments as one vector
HEX <= (others => '1');               -- display segments off
AN  <= (others => '1');               -- all digits off
```

In the code editor **Tab** indents (the selected lines, if several), **Shift+Tab** takes one level off, and **Esc**
then **Tab** moves on to the next control.

## Polarity

Your design sees the level on the pin; the board decides what that level means.

| Part | Active low (Terasic) | Active high (Digilent buttons) |
|---|---|---|
| A pushbutton | released `'1'`, pressed `'0'` | released `'0'`, pressed `'1'` |
| A segment or digit enable | `'0'` lights it | `'1'` lights it |

The Board pane draws each part with its own polarity, and inputs start at their released level. A name never
changes the polarity: `KEY(0) = '0'` means "pressed" exactly as `KEY_N(0) = '0'` did, and renaming `KEY_N` to
`btnC` would not change what the code means — which is why a change of polarity is always a hand edit.

## Multiplexed displays

Digilent boards have one set of segments shared by all digits, and a digit-enable bit per digit. A digit shows
the segments driven while its enable is active. A design lights the digits one after another, fast enough that
all of them seem lit.

HDLBoard decodes this inside the simulation, so the Board pane shows steady digits:

- an enabled digit shows the segments driven now;
- a digit that was enabled recently keeps the segments it last showed;
- a digit **not refreshed for 75 ms goes dark**, as on the board;
- a digit enable that is undefined (`'U'`, `X`, `Z`) shows that display as undefined.

So refresh every digit at least 20 times a second — 4 digits from `CLOCK_500Hz` gives 125 times a second. A
design that holds an enable on (no multiplexing at all) shows its digit steadily too.

## Clocks and speed

A faster board clock simulates more slowly: 100 MHz means twice as many clock events per second of simulated
time as 50 MHz, so a design clocked from `clk` runs slower than real time, as `CLOCK_50` designs already do.
For refresh counters, blinkers and other human-speed logic use `CLOCK_500Hz`, which every board has.

## The legacy `rst` port

Older VHDL files may declare `rst`. HDLBoard still drives it: from the reset button on a board that has one
(Nexys A7: `CPU_RESETN`), else from pushbutton 0. Declare the board's own port instead in new code.

## Add a board

Edit `boards/boards.json` (where it is: see the next section). A complete example, a course board with three
separate pushbuttons and its own display names:

```json
{
  "$schema": "./board.schema.json",
  "version": 2,
  "boards": [
    {
      "id": "course",
      "name": "Course board",
      "description": "Our lab: three scalar buttons and SEG0 … SEG5.",
      "ports": {
        "clock": "CLOCK_50",
        "switches": { "port": "SW", "count": 10 },
        "pushbuttons": { "ports": ["BTN0", "BTN1", "BTN2"], "activeLow": true },
        "leds": { "port": "LEDR", "count": 10 },
        "sevenSegment": {
          "kind": "independent",
          "ports": ["SEG0", "SEG1", "SEG2", "SEG3", "SEG4", "SEG5"],
          "width": 7,
          "activeLow": true
        }
      },
      "labels": { "pushbuttons": "BTN", "sevenSegment": "SEG" },
      "resources": [{ "label": "Lab manual", "url": "https://example.edu/lab-manual.pdf" }]
    }
  ]
}
```

Reload HDLBoard: **Course board** is listed in Settings › Board.

- `id` is what project files store. **Choose it once and never change it**: a project that names an id that
  is no longer there opens with the Default board.
- `name` is shown in Settings; `description` (optional) beside it.
- `ports` names and sizes each part; see [Roles](#roles).
- `labels` (optional) is the small text under the parts: `BTN` gives `BTN2 … BTN0`. Left out: `SW`, `KEY`,
  `LEDR`, `HEX`. Buttons given as separate ports or a cross are labelled with their port names.
- `resources` (optional): up to 4 links, shown under the description in Settings. `https://` only.

A version-1 file (`"version": 1`, the 1.6 format with `clock50` and plain names) still loads: its boards get the
Default shape.

### Pushbuttons in a cross

A cross is written with position keys, so the order cannot be wrong:

```
                up (1)
   left (2)   centre (0)   right (3)
               down (4)
```

```json
"pushbuttons": { "cross": { "centre": "btnC", "up": "btnU", "left": "btnL", "right": "btnR", "down": "btnD" }, "activeLow": false }
```

The numbers are each button's bit: `centre` is bit 0.

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
says what is wrong, with the board's place in the file and its first problem:

```
⚠ boards/boards.json: boards[0] "course" was skipped: ports.switches.count: 20 is above the limit of 18.
```

The other boards in the file still load. The same lines are in the browser's console.

`board.schema.json`, next to `boards.json`, gives VS Code (and other editors that read JSON Schema)
autocompletion and red squiggles while you edit. The schema cannot check everything, so a file without
squiggles can still be rejected. It does not check that names differ **ignoring case**, reserved words
(`signal`, `wire`, …) and the reserved name `rst`, or that board names are unique. HDLBoard's own message in
Settings is the final word.

## Share a project that uses your board

A project file stores the board's id. Whoever opens it needs the same board in their `boards.json`. Without it,
the project still opens and runs on the Default board, and HDLBoard says so on the Project page and before every
run (**Choose a board…**). The id is kept when the project is saved.

## Known limitations

- Every board has switches, LEDs, pushbuttons and 7-segment displays; only the reset button is optional.
- Other parts (VGA, Pmod, RGB LEDs, a second clock) are not simulated.
- Keep ids stable: a project refers to its board by id.
- The Windows app overwrites `boards.json` when it is reinstalled or upgraded.

## Reference

### Roles

| `ports` key | Form | Notes |
|---|---|---|
| `clock` | `"CLK100MHZ"` | The board clock (1 bit). |
| `clockMHz` (optional) | `100` | 1 to 1000, at most 3 decimals. 50 when left out. |
| `clock500Hz` (optional) | `"CLOCK_500Hz"` | Simulator only. Set it only when the default name is taken by another port. |
| `switches` | `{ "port": "sw", "count": 16 }` | 1 to 18. |
| `pushbuttons` | `{ "port": "KEY", "count": 2 }`, `{ "ports": ["BTN0", …] }` or `{ "cross": { … } }` | 1 to 8 (a cross is 5). `"activeLow"`, default `true`. |
| `resetButton` (optional) | `{ "port": "CPU_RESETN", "activeLow": true }` | One input. |
| `leds` | `{ "port": "LED", "count": 16 }` | 1 to 18, active high. |
| `sevenSegment`, independent | `{ "kind": "independent", "ports": ["HEX0", …], "width": 8 }` | 1 to 8 displays, the rightmost first. `width` 7, or 8 when bit 7 is the decimal point. `"activeLow"`, default `true`. |
| `sevenSegment`, multiplexed | `{ "kind": "multiplexed", "segments": "seg", "decimalPoint": "dp", "digitEnables": "an", "digits": 4 }` | `segments`: a 7-bit vector, or 7 names in the order a … g. `decimalPoint` optional. 1 to 8 digits; enable bit 0 is the rightmost digit. `"activeLow"` and `"digitEnablesActiveLow"`, default `true`. |

Segment bits are the same everywhere: bit 0 = a (top), then clockwise to bit 5 = f, bit 6 = g (middle), and
bit 7 = the decimal point on a board that has one.

### Rules

The file is a JSON object with `"version": 2` (or `1`) and a `boards` array. Each board:

- `id`: lower-case letters and digits joined by single hyphens (`de1-soc`), at most 32 characters, unique.
  A board whose id is taken (the built-ins come first) is skipped.
- `name`: not empty, at most 40 characters, unique ignoring case. `description`: at most 140 characters.
- `ports`: the roles above, nothing else.
- Every port name: a letter, then letters, digits and single underscores (no `__`, no `_` at the end), at most
  32 characters; not a VHDL or Verilog reserved word; not `rst`; all names of a board differ ignoring case,
  `CLOCK_500Hz` included.
- `labels`: only `switches`, `pushbuttons`, `leds`, `sevenSegment`; each a name of at most 8 characters.
- `resources`: at most 4 `{ "label", "url" }`; a label of 1 to 32 characters, unique; an `https://` address of at
  most 512 characters.

### Sources of the built-in boards

Checked on 2026-10-25:

| Board | Source |
|---|---|
| DE10-Lite | Terasic System Builder top level `DE10_LITE_Golden_Top.v` (as published at github.com/janaite/fpga-de10lite-golden-top): `MAX10_CLK1_50`, `KEY[1:0]`, `SW[9:0]`, `LEDR[9:0]`, `HEX0` … `HEX5` as `[7:0]`. |
| Basys 3 | Digilent `Basys3_Master.xdc` (rev B), github.com/Digilent/Basys3, `Resources/XDC`: `clk`, `sw[15:0]`, `btnC/U/L/R/D`, `led[15:0]`, `seg[6:0]`, `dp`, `an[3:0]`. |
| Nexys A7 | Digilent `Nexys-A7-100T-Master.xdc`, github.com/Digilent/digilent-xdc: `CLK100MHZ`, `SW[15:0]`, `BTNC/U/L/R/D`, `CPU_RESETN`, `LED[15:0]`, `CA` … `CG`, `DP`, `AN[7:0]`. |

### Glossary

- **Board definition**: one entry of a board file.
- **Shape**: the counts, widths, polarities, button layout and display kind of a board.
- **Catalog**: all boards available here (the built-in ones, then those of `boards.json`).
- **Active board**: the open project's board; the board panel shows it and the simulation uses it.
- **`BoardIo`**: the backend's copy of the board, sent to it in a `BOARD` frame before every run.
