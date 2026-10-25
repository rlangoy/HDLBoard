<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# Board shapes (board file version 2) — implementation spec

Lets a board define its I/O **shape** as well as its port names, and adds DE10-Lite, Basys 3 and Nexys A7.

A board file can now say how many switches, buttons, LEDs and displays a board has, their polarity, a decimal point,
scalar ports, a reset button, the clock frequency, and multiplexed seven-segment displays. The Board pane draws the
active board's parts, and Settings › Board shows links to the board's design resources.

- Issue: [https://github.com/rlangoy/HDLBoard/issues/27](https://github.com/rlangoy/HDLBoard/issues/27)
- Builds on `docs/board_io_config_spec.md` (board file version 1, implemented in 1.6.0), which listed this work in its § 16.
- Written against npm package `hdl-board` 1.6.0. **Target release: 1.7.0.**
- Revised after four reviews; § 16 lists what was changed and what was not taken, with the reason.

Guiding rule, as in the version 1 spec: **logical and easy to implement**. A mechanism is added only when a concrete
board in the issue needs it, or when it removes a real error at small cost.

---

## 0. Summary of changes

| Area | What changes |
|---|---|
| **Board file** | Version **2**. Each role in `ports` becomes an object with its count and polarity (§ 3). Version 1 files are still read and upgraded on load. New optional `clockMHz` and `resources`. |
| **Built-in boards** | Five boards: `default`, `de1-soc` (behaviour unchanged), and new `de10-lite`, `basys3`, `nexys-a7` (§ 3.6). |
| **One internal model** | The parser turns every board into one normalized `BoardPorts` value with exactly one representation per thing (§ 4). UI, wire encoding and testbenches read only that value. |
| **Board pane** | Built from the board: N switches, N LEDs, a row or a cross of buttons, an optional reset button, 1–8 displays with an optional decimal point, headings for multiplexed displays (§ 5.1). |
| **Board info** | Settings › Board shows each board's resource links under its description; Help shows the active board's links. Default has none (§ 5.2). |
| **Change board** | Renames only what needs no further edit; lists every other difference as a hand edit (§ 5.3, § 9). |
| **Examples / new files** | Built-in examples only on boards with the Default shape; other boards get a generated starter top file (§ 5.4, § 5.5). |
| **Protocol** | Version **3**. The `BOARD` body is one line of versioned JSON. `STIM` and `STATE` lengths follow the board (§ 6). |
| **Compatibility** | Default and DE1-SoC `STIM`/`STATE` frames and generated testbenches stay byte-identical. A new backend accepts an old client's v1 `BOARD` body. A new client meeting an old backend still runs Default-shaped boards and refuses other shapes with a clear message (§ 6.3). |
| **Testbenches** | Widths, rest levels, clock period and port associations come from the board. Scalar ports connect to indexed testbench signals. Multiplexed displays are decoded **inside the testbench**, so the wire and the UI never see multiplexing (§ 7). |
| **Width check** | A declared board port whose width does not match the board gets a plain message, with the expected declaration, before elaboration (§ 8). |

---

## 1. The request

From issue #27: add board support for **DE10-Lite**, **Basys 3** and **Nexys A7**. The issue lists, per board, the
clock, switches, pushbuttons, reset button, LEDs, seven-segment ports, decimal point, digit enables, number of digits,
display implementation, polarity and button layout, and proposes a version 2 board file (§ 3 uses it as the base).

From the request in chat:

- The UI must change the **number of UI elements** to match the board.
- The board info must show links to **design resources**:
  - Basys 3: [Board definitions](https://github.com/Digilent/Basys3/blob/master/Resources/XDC/Basys3_Master.xdc),
    [I/O examples](https://github.com/Digilent/Basys3/blob/master/Projects/GPIO/src/hdl/GPIO_Demo.vhd)
  - Nexys A7: [Board definitions](https://github.com/Digilent/digilent-xdc/blob/master/Nexys-A7-100T-Master.xdc),
    [I/O top file](https://github.com/Digilent/Nexys-A7-100T-GPIO/blob/master/src/hdl/top.vhd)
  - **Not** for the Default (HDLBoard) board.

### 1.1 Glossary

| Term | Meaning |
|---|---|
| **Role** | What a port is for: `clock`, `switches`, `pushbuttons`, … |
| **Shape** | Counts, widths, polarities, button layout and display kind of a board. Port names and clock frequency are not part of the shape. |
| **Display** | One seven-segment digit position. "Display 0" is the rightmost. |
| **Independent displays** | One port per display (Terasic). |
| **Multiplexed display** | Shared segment ports plus one digit-enable bit per display (Digilent). |
| **Pin level** | The bit value on the FPGA pin, before polarity is applied. |

---

## 2. Findings and decisions

### 2.1 Findings

| # | Finding | Consequence |
|---|---|---|
| F1 | The proposed config gives the clock by **name only**, but Basys 3 and Nexys A7 run at **100 MHz**. A testbench that always generates 50 MHz makes every student divider run at half speed compared with the real board. | Optional `clockMHz` next to `clock` (default 50). Rules in § 3.2. |
| F2 | Digilent's master XDC uses **scalar** ports (`btnC`, `CA`…`CG`), Terasic uses vectors. | One internal type, `PortGroup`: a vector (`port` + `count`) or a list of scalars. Scalars connect to an **indexed** testbench signal (`btnc => key_sig(0)`). Testbench internals stay vectors. |
| F3 | A five-name list for a **cross** can be in the wrong order, and a parser cannot see that. | A cross is written with **position keys** (`centre`, `up`, `left`, `right`, `down`), never as a list. A wrong order cannot be expressed. |
| F4 | **Multiplexed displays** change state every refresh period (≈ 1 ms per digit). Sending that over `STATE` would flood the socket, and the 20 ms UI could never show a stable digit. | The testbench decodes the multiplexing into stable digits (§ 7.4). |
| F5 | A **100 MHz clock** doubles the event count of a 50 MHz one. A design clocked from `clk` runs slower than real time, as `CLOCK_50` designs already do. | No change to pacing. `CLOCK_500Hz` is available on every board; Help and `BOARDS.md` recommend it for refresh counters and blinkers. |
| F6 | Basys 3 and Nexys A7 buttons are **active high**. Renaming `KEY_N` → `btnC` would keep the code but invert its meaning. | A polarity change is **never** a rename; it is always a hand edit (§ 9). Rest levels follow the board. |
| F7 | `renamesBetween` maps role to role by position. Between shapes (6 independent `HEXn` → `seg`/`an`), or between widths (`SW[9:0]` → `sw[15:0]`), a rename leaves code that still does not compile. | Rename only when the renamed port needs no further edit (§ 9). |
| F8 | `BUILT_IN_PORT_NAMES` (testbench detection) would grow with `clk`, `led`, `seg`, `an`, `dp`, which are common **sub-module** port names. | Testbench detection uses **Default + DE1-SoC + the active board** only (§ 5.6). |
| F9 | Resource links come from a user-editable JSON file and are rendered as links. A `javascript:` URL would run in the app's origin. | Only `https://` URLs are accepted. |
| F10 | **DE10-Lite names** in the issue are not checked against a Terasic source. | Gate 0 is a **merge blocker** (§ 11). |
| F11 | The built-in examples use Default names **and widths** (`KEY_N(3 downto 0)`, `HEX0_N(6 downto 0)`). A rename cannot fix widths or turn six displays into a multiplexed one. | Examples only on Default-shaped boards; others get a generated starter (§ 5.4). |
| F12 | After switching to Basys 3, `SW : in std_logic_vector(9 downto 0)` makes GHDL fail at elaboration with a message about the testbench. | Width check before elaboration (§ 8). |
| F13 | `clock500Hz` defaults to `CLOCK_500Hz`, which a user board could also use for another role. | The default takes part in the uniqueness check; a collision rejects the board with a warning that says to set `clock500Hz` (§ 3.4). |
| F14 | A digit that is **continuously enabled** produces no events after the first one, so an expiry based on the last event would blank a statically driven display. | An enabled digit always shows the live segments; the latch is used only while the digit is disabled (§ 7.4). |

### 2.2 Decisions

| ID | Decision |
|---|---|
| D1 | Board file `version: 2`. Version 1 files are upgraded on load into the same normalized model. Built-in (v2) and user (v1 or v2) files may differ in version. |
| D2 | Only the parser knows the file's alternatives (vector vs scalars vs cross, `segments` as string vs array, optional fields). After parsing, everything is **normalized** (§ 4). |
| D3 | Roles: `clock`, `clock500Hz`, `switches`, `pushbuttons`, `resetButton` (optional), `leds`, `sevenSegment`. The v1 key `clock50` is read as `clock`. |
| D4 | **Polarity model.** Wire bits are pin levels, as today. The UI applies polarity when it draws a part and when it sets the rest level of an input. The testbench uses polarity only for rest and off levels. |
| D5 | Bit layout (normative). `STIM` = switches (bit N−1 first), buttons (bit N−1 first), reset (1 bit, if present). `STATE` = LEDs (bit N−1 first), then display 0 … D−1, each W bits, bit W−1 first. W = 8 when the board has a decimal point, else 7. For scalar buttons and segments, **group index 0 is the first scalar in the file (or `centre` for a cross), bit 0, sent last** in its field. |
| D6 | The backend receives the normalized board as versioned JSON in the `BOARD` body, validates every field itself, and keeps the identifier rule as the security boundary (v1 § 9.2). A v1 line body is still accepted and upgraded. |
| D7 | Multiplexed displays are decoded in the generated testbench (VHDL and Verilog), never in the frontend. |
| D8 | `resources`: optional, at most 4 (one line in a Settings row), `{ label, url }`, label 1–32 characters of plain text, unique per board, url `https://` only and at most 512 characters. Display-only; never sent to the backend. |
| D9 | Limits are implementation constants in **one** module per package (`boardLimits.ts`): switches and LEDs 1–18, buttons 1–8, displays 1–8. The wire maxima are derived from them: `MAX_STIM_BITS = 18 + 8 + 1 = 27`, `MAX_STATE_BITS = 18 + 8 × 8 = 82`. Raising a limit later is a code change, not a format change. |
| D10 | Board ids are stable; adding boards needs **no project file version change**. |
| D11 | Changing the board stops a running simulation (as in v1). The next `RUN` is preceded by the new `BOARD`, so a session never runs one board's testbench with another board's `STIM`. |

---

## 3. Board file version 2

### 3.1 Board fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Lower-case slug, saved in project files (as in v1). |
| `name` | yes | Shown in Settings › Board and the pane title. |
| `description` | no | Shown beside the name. |
| `ports` | yes | The roles (§ 3.2). |
| `labels` | no | Silkscreen labels, as in v1: `switches`, `pushbuttons`, `leds`, `sevenSegment`. Scalar and cross buttons show their port names instead. |
| `resources` | no | Up to 4 links, D8. Example: `{ "label": "Board definitions", "url": "https://…" }`. |

### 3.2 Roles

| Role | Form | Rules |
|---|---|---|
| `clock` | `"CLK100MHZ"` | A port name. |
| `clockMHz` | `100` | Optional, default `50`. A number with at most 3 decimals, `1 ≤ clockMHz ≤ 1000` (so `74.25` is valid). |
| `clock500Hz` | `"CLOCK_500Hz"` | Optional, default `CLOCK_500Hz`. Simulator-only, on every board. Set it only when the default collides with another port of the board. |
| `switches` | `{ "port": "sw", "count": 16 }` | Vector input. |
| `pushbuttons` — vector row | `{ "port": "KEY", "count": 2, "activeLow": true }` | Drawn as a row. |
| `pushbuttons` — scalar row | `{ "ports": ["BTN0", "BTN1", "BTN2"], "activeLow": false }` | Drawn as a row; first name = index 0. |
| `pushbuttons` — cross | `{ "cross": { "centre": "btnC", "up": "btnU", "left": "btnL", "right": "btnR", "down": "btnD" }, "activeLow": false }` | All five keys required. Group index: centre 0, up 1, left 2, right 3, down 4. |
| `resetButton` | `{ "port": "CPU_RESETN", "activeLow": true }` | Optional. One scalar input. |
| `leds` | `{ "port": "LED", "count": 16 }` | Vector output, active high. |
| `sevenSegment` — independent | `{ "kind": "independent", "ports": ["HEX0", …], "width": 8, "activeLow": true }` | One port per display, display 0 first. `width` 7 or 8. |
| `sevenSegment` — multiplexed | `{ "kind": "multiplexed", "segments": "seg", "decimalPoint": "dp", "digitEnables": "an", "digits": 4, "activeLow": true, "digitEnablesActiveLow": true }` | `segments`: a 7-bit vector name, **or** an array of 7 scalar names in the order a, b, c, d, e, f, g. `decimalPoint` optional scalar. `digitEnables`: a vector of `digits` bits, bit 0 = display 0. |

`activeLow` (buttons, displays) and `digitEnablesActiveLow` default to `true`. Counts are bounded by D9.

### 3.3 Segment bit order

The same on every board, in the file, on the wire and in the UI:

| Bit | 7 | 6 | 5 | 4 | 3 | 2 | 1 | 0 |
|---|---|---|---|---|---|---|---|---|
| Segment | dp (only when W = 8) | g | f | e | d | c | b | a |

For scalar segments, the first array entry is bit 0 (a). `CA`…`CG` therefore map to bits 0…6.

### 3.4 Validation (one function, `parseBoardFile`)

Every v1 rule still applies (identifier rule, max 32 characters, not a reserved word, not `rst`, unique id). Port names
are ASCII by the identifier rule, so "ignoring case" means ASCII lower case (`toLowerCase()` on ASCII is exact). New rules:

- All port names of one board are unique ignoring case, across all roles, scalar lists, cross keys and the effective
  `clock500Hz` (the default included). A collision names both roles:
  `boards[3] "lab": ports.clock500Hz: "CLOCK_500Hz" is also ports.clock; set clock500Hz to another name.`
- Counts within D9; the message states the limit: `ports.switches.count: 20 is above the limit of 18.`
- `clockMHz`: `ports.clockMHz: 0.5 is not valid; use a number from 1 to 1000 with at most 3 decimals.`
- A cross needs all five keys and no others: `ports.pushbuttons.cross: "down" is missing.`
- `resources`: https URL (parsed with `new URL()`, protocol `https:`, no whitespace or control characters), ≤ 512
  characters, label 1–32 characters, labels unique, at most 4.
- Unknown keys are an error, as in v1. The file `version` is how the format grows.
- An invalid board is skipped with one warning (its first problem); valid boards in the same file still load.

### 3.5 Version 1 upgrade

`upgradeV1Board(raw)` converts a v1 board before the v2 checks run:

| v1 | v2 |
|---|---|
| `clock50` | `clock`, with `clockMHz` 50 (a v1 board is always 50 MHz) |
| `switches: "SW"` | `{ "port": "SW", "count": 10 }` |
| `pushbuttons: "KEY_N"` | `{ "port": "KEY_N", "count": 4, "activeLow": true }` |
| `leds: "LEDR"` | `{ "port": "LEDR", "count": 10 }` |
| `sevenSegment` (6 names) | `{ "kind": "independent", "ports": <the 6 names>, "width": 7, "activeLow": true }` |

The file's `version` decides the path; a file is either all v1 or all v2.

### 3.6 Built-in boards (`src/boards/builtinBoards.json`)

```json
{
  "version": 2,
  "boards": [
    {
      "id": "default",
      "name": "Default",
      "description": "HDLBoard's original names: KEY_N and HEX0_N … HEX5_N.",
      "ports": {
        "clock": "CLOCK_50",
        "switches": { "port": "SW", "count": 10 },
        "pushbuttons": { "port": "KEY_N", "count": 4, "activeLow": true },
        "leds": { "port": "LEDR", "count": 10 },
        "sevenSegment": {
          "kind": "independent",
          "ports": ["HEX0_N", "HEX1_N", "HEX2_N", "HEX3_N", "HEX4_N", "HEX5_N"],
          "width": 7,
          "activeLow": true
        }
      }
    },
    {
      "id": "de1-soc",
      "name": "DE1-SoC",
      "description": "Terasic DE1-SoC, System Builder names: KEY and HEX0 … HEX5.",
      "ports": {
        "clock": "CLOCK_50",
        "switches": { "port": "SW", "count": 10 },
        "pushbuttons": { "port": "KEY", "count": 4, "activeLow": true },
        "leds": { "port": "LEDR", "count": 10 },
        "sevenSegment": {
          "kind": "independent",
          "ports": ["HEX0", "HEX1", "HEX2", "HEX3", "HEX4", "HEX5"],
          "width": 7,
          "activeLow": true
        }
      }
    },
    {
      "id": "de10-lite",
      "name": "DE10-Lite",
      "description": "Terasic DE10-Lite: 2 keys, 6 displays with decimal point, MAX10_CLK1_50.",
      "ports": {
        "clock": "MAX10_CLK1_50",
        "switches": { "port": "SW", "count": 10 },
        "pushbuttons": { "port": "KEY", "count": 2, "activeLow": true },
        "leds": { "port": "LEDR", "count": 10 },
        "sevenSegment": {
          "kind": "independent",
          "ports": ["HEX0", "HEX1", "HEX2", "HEX3", "HEX4", "HEX5"],
          "width": 8,
          "activeLow": true
        }
      }
    },
    {
      "id": "basys3",
      "name": "Basys 3",
      "description": "Digilent Basys 3, master XDC names: 16 sw/led, 5 buttons, 4-digit multiplexed display, 100 MHz.",
      "ports": {
        "clock": "clk",
        "clockMHz": 100,
        "switches": { "port": "sw", "count": 16 },
        "pushbuttons": {
          "cross": { "centre": "btnC", "up": "btnU", "left": "btnL", "right": "btnR", "down": "btnD" },
          "activeLow": false
        },
        "leds": { "port": "led", "count": 16 },
        "sevenSegment": {
          "kind": "multiplexed",
          "segments": "seg",
          "decimalPoint": "dp",
          "digitEnables": "an",
          "digits": 4,
          "activeLow": true,
          "digitEnablesActiveLow": true
        }
      },
      "resources": [
        { "label": "Board definitions", "url": "https://github.com/Digilent/Basys3/blob/master/Resources/XDC/Basys3_Master.xdc" },
        { "label": "I/O examples", "url": "https://github.com/Digilent/Basys3/blob/master/Projects/GPIO/src/hdl/GPIO_Demo.vhd" }
      ]
    },
    {
      "id": "nexys-a7",
      "name": "Nexys A7",
      "description": "Digilent Nexys A7, master XDC names: 16 SW/LED, 5 buttons + CPU_RESETN, 8-digit multiplexed display, 100 MHz.",
      "ports": {
        "clock": "CLK100MHZ",
        "clockMHz": 100,
        "switches": { "port": "SW", "count": 16 },
        "pushbuttons": {
          "cross": { "centre": "BTNC", "up": "BTNU", "left": "BTNL", "right": "BTNR", "down": "BTND" },
          "activeLow": false
        },
        "resetButton": { "port": "CPU_RESETN", "activeLow": true },
        "leds": { "port": "LED", "count": 16 },
        "sevenSegment": {
          "kind": "multiplexed",
          "segments": ["CA", "CB", "CC", "CD", "CE", "CF", "CG"],
          "decimalPoint": "DP",
          "digitEnables": "AN",
          "digits": 8,
          "activeLow": true,
          "digitEnablesActiveLow": true
        }
      },
      "resources": [
        { "label": "Board definitions", "url": "https://github.com/Digilent/digilent-xdc/blob/master/Nexys-A7-100T-Master.xdc" },
        { "label": "I/O top file", "url": "https://github.com/Digilent/Nexys-A7-100T-GPIO/blob/master/src/hdl/top.vhd" }
      ]
    }
  ]
}
```

Port name case is exactly as in each vendor's file (`btnC` on Basys 3, `BTNC` on Nexys A7). The issue's "Course board"
(`BTN`, `SEG0` … `SEG5`) is the worked example of a **user** board in `docs/BOARDS.md`. The sources each built-in was
checked against are recorded in `BOARDS.md` § "Sources of the built-in boards" (filled in at Gate 0).

---

## 4. Internal model (`src/boards/types.ts`, mirrored in `server/src/engines/boardPorts.ts`)

```ts
/** A vector port, or scalar ports read as one vector (index 0 = first scalar = bit 0). */
export type PortGroup =
  | { readonly kind: 'vector'; readonly port: string; readonly count: number }
  | { readonly kind: 'scalars'; readonly ports: readonly string[] };

export interface VectorPort { readonly port: string; readonly count: number }

export interface ButtonGroup {
  readonly group: PortGroup;      // a cross becomes scalars in order centre, up, left, right, down
  readonly activeLow: boolean;
  readonly layout: 'row' | 'cross';   // UI only; never sent to the backend
}

export interface ResetButton { readonly port: string; readonly activeLow: boolean }

export interface IndependentDisplays {
  readonly kind: 'independent';
  readonly ports: readonly string[];  // display 0 (rightmost) first
  readonly width: 7 | 8;
  readonly activeLow: boolean;
}

export interface MultiplexedDisplays {
  readonly kind: 'multiplexed';
  readonly segments: PortGroup;       // 7 bits, a … g
  readonly decimalPoint?: string;
  readonly digitEnables: string;      // vector of `digits` bits, bit 0 = display 0
  readonly digits: number;
  readonly activeLow: boolean;
  readonly digitEnablesActiveLow: boolean;
}

export type SevenSegment = IndependentDisplays | MultiplexedDisplays;

export interface BoardPorts {
  readonly clock: { readonly port: string; readonly mhz: number };  // mhz always set after parsing
  readonly clock500Hz: string;                                      // always set after parsing
  readonly switches: VectorPort;
  readonly pushbuttons: ButtonGroup;
  readonly resetButton?: ResetButton;
  readonly leds: VectorPort;
  readonly sevenSegment: SevenSegment;
}

export interface BoardResource { readonly label: string; readonly url: string }

export interface BoardDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly ports: BoardPorts;
  readonly labels: BoardLabels;
  readonly resources: readonly BoardResource[];   // [] when none
  readonly origin: 'built-in' | 'user';
}
```

`BOARD_ROLES` and the fixed `SWITCH_COUNT` … `SEGMENTS_PER_DISPLAY` constants are removed. Anything that needs a count
asks the shape helpers.

### 4.1 Shape helpers (`src/boards/boardShape.ts`, pure)

| Function / constant | Returns |
|---|---|
| `groupWidth(group)` | `count`, or the number of scalars. |
| `buttonCount(ports)` | `groupWidth(ports.pushbuttons.group)`. |
| `displayCount(ports)` | Number of ports (independent) or `digits` (multiplexed). |
| `displayWordWidth(ports)` | 8 when the board has a decimal point (`width: 8`, or `decimalPoint` set), else 7. |
| `stimFields(ports)` / `stateFields(ports)` | **The** bit layout of D5 as an ordered list of `{ role, width }`. Every encoder, decoder and length below reads it. |
| `stimLength(ports)` / `stateLength(ports)` | Sum of the field widths. |
| `restInputs(ports)` | Switches all `0`; buttons and reset at their **released** level. |
| `sameInputShape(a, b)` | Same `stimFields` and same button and reset polarity. |
| `encodeStim(ports, inputs)` | The `STIM` payload. |
| `decodeState(ports, bits)` | `{ leds, displays }`, or `undefined` when the length is wrong. |
| `portList(ports)` | Every port name of the board, in role order (scalars expanded, `clock500Hz` included). |
| `DEFAULT_SHAPE` | The shape of the Default board, read from the built-in file. |
| `isDefaultShape(ports)` | The board's shape equals `DEFAULT_SHAPE`. Names and clock frequency are not compared. |
| `describeShapeChange(from, to)` | `ShapeDifference[]` (below), in role order. Empty when shapes and frequency match. |
| `formatShapeDifference(diff)` | The sentence shown in the dialog. |

```ts
export type ShapeDifference =
  | { readonly role: 'clock'; readonly fromMHz: number; readonly toMHz: number }
  | { readonly role: 'switches' | 'leds'; readonly from: VectorPort; readonly to: VectorPort }
  | { readonly role: 'pushbuttons'; readonly from: ButtonGroup; readonly to: ButtonGroup }
  | { readonly role: 'resetButton'; readonly from?: ResetButton; readonly to?: ResetButton }
  | { readonly role: 'sevenSegment'; readonly from: SevenSegment; readonly to: SevenSegment };
```

Default → Basys 3, formatted:

```
Clock frequency: 50 MHz → 100 MHz (divider and counter constants change).
Switches: 10 → 16 (sw[15:0]).
Pushbuttons: 4 active-low (KEY_N[3:0]) → 5 active-high in a cross (btnC, btnU, btnL, btnR, btnD).
LEDs: 10 → 16 (led[15:0]).
7-segment: 6 separate displays → a 4-digit multiplexed display (seg[6:0], dp, an[3:0]).
```

---

## 5. User interface

### 5.1 Board pane (`BoardIoPanel.tsx`)

The panel reads only `board.ports` and `board.labels`. The part components already take `count` and `activeLow`.

| Part | Change |
|---|---|
| `Leds` | `count = leds.count`. Heading `LEDs (led[15:0])`. |
| `Switches` | `count = switches.count`. |
| `Pushbuttons` (row) | `count = buttonCount`, `activeLow` from the board. Heading `Pushbuttons (KEY[1:0])`, or `Pushbuttons (BTN0, BTN1, BTN2)` for scalars. Labels: `KEY0` … for a vector, port names for scalars. |
| `PushbuttonCross` (new) | 3 × 3 grid: centre, up, left, right, down. Same `Pushbutton` part and press logic as the row. Each button is labelled with its port name; its `aria-label` and tooltip add the position (`btnU (up)`). |
| `ResetButton` (new) | One `Pushbutton` in the reset accent colour, label = port name, placed **to the right of the buttons** inside the Pushbuttons panel. |
| `SevenSegmentDisplays` | `count = displayCount`. New prop `decimalPoint: boolean`: with it, each word is 8 bits and bit 7 drives the dot (`SevenSegmentDisplay` gets a `dp` bit; today the dot never lights). |
| Seven-segment heading | Independent: `7-Segment Displays (HEXn[7:0])`, width from the board. Multiplexed: `7-Segment Display (seg[6:0], dp, an[3:0])`, or `(CA…CG, DP, AN[7:0])` for scalars, with one line under the row: *Multiplexed: a digit shows the segments driven while its `an` bit is active.* |
| Scale | `boardScale(ports)` in `boardScale.ts`: the widest row in **switch pitches**, with each part weighted by its own pitch (`DISPLAY_PITCH` and `KEY_PITCH` mirrored from `tokens.css`, one constant each). `size = clamp(MIN_SIZE = 12, 24, floor(240 / widestRowPitches))`. Today's boards keep 24. If the row is still wider than the pane at size 12, the pane scrolls horizontally. |

Inputs: the Workbench keeps one `BoardInputs = { switches, buttons, reset }`. On a board change it is kept when
`sameInputShape(old, new)` (Default ↔ DE1-SoC), otherwise set to `restInputs(new)`, so a released active-high button
reads `0` from the start.

### 5.2 Board info and resource links

Settings › Board, per row:

```
 ( ) Basys 3   Digilent Basys 3, master XDC names: 16 sw/led, 5 buttons, 4-digit multiplexed display, 100 MHz.
               Board definitions ↗ · I/O examples ↗
```

- The links line appears only when `resources` is not empty (Default, DE1-SoC and DE10-Lite show none).
- `BoardResourceLinks` renders each link through the app's existing external-link helper (the one Help already uses for
  `docs/BOARDS.md`), so browser and desktop behave the same; the anchor carries `target="_blank" rel="noopener noreferrer"`.
  Labels are plain text (React escapes them).
- The v1 note *"The number of switches, keys, LEDs and displays is the same on every board."* is removed.
- Help › "Moving to the real board" shows the active board's `BoardResourceLinks`. With no resources it is as today.

### 5.3 Change-board dialog

`BoardChangeDialog` shows the renames (§ 9) and the shape differences, grouped by role:

```
┌ Change board? ──────────────────────────────────────────────┐
│ Default → Basys 3                                           │
│ These boards have different I/O. Your design will not run   │
│ on Basys 3 until the changes listed below are made.         │
│                                                             │
│ Renamed in your files:                                      │
│    CLOCK_50 → clk                                           │
│                                                             │
│ Change by hand:                                             │
│  • Clock frequency: 50 MHz → 100 MHz (divider and counter   │
│    constants change).                                       │
│  • Switches: 10 → 16 (sw[15:0]).                            │
│  • Pushbuttons: 4 active-low (KEY_N[3:0]) → 5 active-high   │
│    in a cross (btnC, btnU, btnL, btnR, btnD).               │
│  • LEDs: 10 → 16 (led[15:0]).                               │
│  • 7-segment: 6 separate displays → a 4-digit multiplexed   │
│    display (seg[6:0], dp, an[3:0]).                         │
│  Board resources: Board definitions ↗ · I/O examples ↗      │
│                                                             │
│          [ Cancel ]  [ Change board only ]  [ Update files ]│
└─────────────────────────────────────────────────────────────┘
```

- The rename engine, the all-or-nothing conflict rule and Undo are unchanged (v1 § 3.3).
- Multiplexed display renames, when there are any, are shown together under one "7-segment" line.
- When shapes and frequency match (Default ↔ DE1-SoC), the dialog is exactly as today.
- When nothing can be renamed but the boards differ, the dialog still opens with *Change board only* and *Cancel*, so the
  student sees the hand-edit list first. This replaces v1 D7 ("no question") for that case only.

### 5.4 Examples and starter files

| Active board | Examples pane | New project / New File template |
|---|---|---|
| `isDefaultShape` (Default, DE1-SoC, user boards with that shape) | As today: translated from Default names. | As today. |
| Any other shape | A notice instead of the cards, its counts generated from `DEFAULT_SHAPE`: *The built-in examples are written for boards with 10 switches, 4 keys and 6 displays (Default, DE1-SoC).* Below it: a **New starter file** button (adds `generateBoardTop` output to the project, as New File does) and `BoardResourceLinks`. | `generateBoardTop(board, language)` (§ 5.5). |

### 5.5 Generated top file (`src/boards/boardTop.ts`, pure)

`generateBoardTop(board, 'vhdl' | 'verilog')` writes an entity/module named after the existing starter file, declaring
every board port in the board's names and widths, and a body that compiles and runs for **every valid shape**:

- **LEDs follow the switches**, one driver for the whole vector. With S switches and L LEDs:

  | Case | VHDL | Verilog |
  |---|---|---|
  | L ≤ S | `led <= sw(L-1 downto 0);` | `assign led = sw[L-1:0];` |
  | L > S | `led <= (L-1 downto S => '0') & sw;` | `assign led = {{(L-S){1'b0}}, sw};` |

  (Numbers are written out, not as `L`/`S`.)
- **Displays off**: every segment and the decimal point at its *inactive* level (`'1'` when `activeLow`, else `'0'`);
  multiplexed digit enables at their inactive level.
- Buttons and reset are declared and unused.
- `clock500Hz` is declared with the comment `-- Simulator only (HDLBoard): delete this port before synthesis.`
  (`//` in Verilog), so the file does not hit an unconstrained-pin error in Vivado or Quartus.
- A header comment names the board, its button and display polarity, and its resource URLs.

### 5.6 Testbench detection

`BUILT_IN_PORT_NAMES` becomes the names of **Default and DE1-SoC** only (`LEGACY_DETECTION_BOARDS`), and
`boardDesignPortNames(active)` adds the active board's names as today (F8).

### 5.7 Help dialog

The signal table (`helpSignals.ts`) is generated from `board.ports`: one row per role, with direction, width, polarity
and, for multiplexed displays, the decoding note. The clock row gives the frequency and the note that a faster clock
simulates more slowly. A short polarity section states D4. The legacy `rst` note says it is a compatibility alias and
recommends the board's own reset or button port.

---

## 6. Protocol version 3

### 6.1 `BOARD` frame

```
BOARD
{"version":2,"clock":{"port":"clk","mhz":100},"clock500Hz":"CLOCK_500Hz","switches":{"port":"sw","count":16},"pushbuttons":{"group":{"kind":"scalars","ports":["btnC","btnU","btnL","btnR","btnD"]},"activeLow":false},"leds":{"port":"led","count":16},"sevenSegment":{"kind":"multiplexed","segments":{"kind":"vector","port":"seg","count":7},"decimalPoint":"dp","digitEnables":"an","digits":4,"activeLow":true,"digitEnablesActiveLow":true}}
```

- The body is `{ "version": 2, …BoardPorts }` minus `layout`, on one line. `encodeBoardFrame(ports)` writes every
  object, nested ones included, with a **fixed key order** taken from one key list per object type, so fixtures stay
  stable. Optional keys (`resetButton`, `decimalPoint`) are left out when absent.
- `decodeBoardBody(body)` in `server/src/boardFrame.ts`:
  - body starting with `{` → `JSON.parse`, require `version: 2`, then `validateBoardIo(value)`: every field present with
    the right type, no unknown keys, limits from D9, every name passes `isPlainIdentifier` (≤ 32, not `rst`), all names
    unique ignoring case, `mhz` as in § 3.2.
  - any other body → the v1 line decoder, upgraded with the § 3.5 table.
- On any violation the session board becomes **rejected**, exactly as in v1 § 8.2: the next `RUN` is refused with the reason.

### 6.2 `STIM` and `STATE`

- `protocol.ts` decodes `STIM` as `^[01]{1,MAX_STIM_BITS}$` (27, from `boardLimits.ts`). The **session** then checks the
  exact length against `stimLength(board)` and answers with the fields that make up the length. On Basys 3:
  `ERROR protocol STIM needs 21 bits for this board (switches 16 + buttons 5), got 14.`
  The backend never receives board display names (§ 6.1), so the frontend adds the name when it shows the error:
  `Basys 3: STIM needs 21 bits …`.
- The testbench writes `STATE` with `stateLength(board)` bits (≤ `MAX_STATE_BITS`). The frontend decodes with
  `decodeState(activeBoard.ports, bits)`. A frame of the wrong length is dropped; the first drop per run writes one
  `console.warn` in the browser's developer console (not the user console), because after a board change it is normal.
- `hdlClient.stim(bits: string)` and `handlers.onState(bits: string)` carry raw payloads; encoding and decoding live in
  `boardShape.ts` only.

Field order (D5), Nexys A7:

```
STIM  (16 + 5 + 1 = 22 bits):  SW15 … SW0 | BTND BTNR BTNL BTNU BTNC | CPU_RESETN
STATE (16 + 8 × 8 = 80 bits):  LED15 … LED0 | display 0: dp g f e d c b a | … | display 7
```

Default and DE1-SoC: `STIM` = `SW9 … SW0 KEY3 … KEY0` (14), `STATE` = `LEDR` + 6 × 7 (52). Unchanged.

### 6.3 Version compatibility

`PROTOCOL_VERSION = '3'` in `server.ts` and `hdlClient.ts`. Frontend and backend ship together (desktop app, Docker),
so 3 ↔ 3 is the supported pair. The other pairs behave like this:

| Client | Backend | Behaviour |
|---|---|---|
| 3 | 3 | Full support. |
| 2 (1.6.x) | 3 | The client sends a v1 line body; the backend upgrades it (Default shape). Works as in 1.6. |
| 3 | 2 (1.6.x) | The client reads the version in `WELCOME`. Below 3: for a Default-shaped board it sends the v1 line body (the 1.6 encoder, kept for this); for any other shape it does **not** send `RUN` and logs `The simulator backend is older than this page and supports only boards with 10 switches, 4 keys and 6 displays. Update HDLBoard, or choose Default or DE1-SoC.` |
| 3 | 1 (≤ 1.5) | As today: the old backend answers `Unknown verb: "BOARD"` and the existing old-backend handling runs Default names. Other shapes are refused as in the row above. |

`WELCOME` already carries the backend's version; the client starts reading it instead of ignoring it.

---

## 7. Testbench generation

### 7.1 Bindings (`server/src/engines/boardPorts.ts`)

```ts
export interface BoardBinding {
  readonly role: BindingRole;
  readonly name: string;          // as the board spells it: 'btnC'
  readonly key: string;           // lower case, for matching
  readonly signal: string;        // testbench signal: 'key_sig'
  readonly index?: number;        // scalar port of a vector signal: key_sig(0)
  readonly direction: 'in' | 'out';
}
```

`boardBindings(board)` lists, in this order, with these `role` values:

| Role values | Signal |
|---|---|
| `clock`, `clock500Hz` | `clk_sig`, `clk500_sig` |
| `switches` | `sw_sig` |
| `pushbuttons` (vector) or `pushbutton0` … `pushbuttonN-1` (scalars, with `index`) | `key_sig` |
| `resetButton` | `rstbtn_sig` |
| `leds` | `ledr_sig` |
| independent: `sevenSegment0` … `sevenSegmentD-1` | `hex0_sig` … |
| multiplexed: `segments` (vector) or `segment0` … `segment6` (scalars, with `index`), `decimalPoint`, `digitEnables` | `seg_sig`, `dp_sig`, `an_sig` |

Both generators render the actual as `signal`, or `signal(index)` / `signal[index]`. `boardPortKeys`,
`boardInputNames`, `boardOutputNames` and `describeBoardPorts` keep their meaning.

### 7.2 VHDL (`tbTemplate.ts`)

| Item | Generated from the board |
|---|---|
| `sw_sig` | `std_logic_vector(S-1 downto 0) := (others => '0')` |
| `key_sig` | `std_logic_vector(K-1 downto 0) := (others => REST)`, REST = `'1'` when active low, else `'0'` |
| `rstbtn_sig` | Only with a reset button: `std_logic := REST` |
| `ledr_sig` | `std_logic_vector(L-1 downto 0) := (others => '0')` |
| `hexD_sig` | D = 0 … displays−1: `std_logic_vector(W-1 downto 0) := (others => SEG_OFF)` |
| multiplexed | `seg_sig(6 downto 0) := (others => SEG_OFF)`, `dp_sig := SEG_OFF` (only with a decimal point), `an_sig(D-1 downto 0) := (others => AN_OFF)`, plus the decoder (§ 7.4) |
| Port map | `sw => sw_sig`, `btnc => key_sig(0)`, `ca => seg_sig(0)`, `an => an_sig` … (formal in lower case, as today) |
| Legacy `rst` | Asserted while the **reset button** is pressed when the board has one (Nexys A7: from `CPU_RESETN`), else while **button 0** is pressed (`not key_sig(0)` when active low, `key_sig(0)` when active high). The generated line carries a comment saying so. |
| Clock | `clkgen` only when the entity declares the clock (as today). Half period = `500 / mhz` ns, rounded to 1 ps. Written as `wait for N ns;` when it is a whole number of ns (Default stays `10 ns`), else `wait for N ps;`. |
| `io` process | `rec : string(1 to stimLength)`, `last`/`now_bits : string(1 to stateLength)`. The parse loop and the `now_bits` concatenation are generated field by field from `stimFields` / `stateFields`. `now_bits` is computed on **every poll** (every `poll_interval_ns`), as today; `STATE` is written when it differs from the last one written. |

S, K, L, D, W, REST, SEG_OFF and AN_OFF are written out as literals by the generator. With `DEFAULT_BOARD_IO` the
generated text stays **byte-identical**; the golden files must not change.

### 7.3 Verilog (`verilog/testbench.ts`)

The same table: `reg [S-1:0] sw_sig = S'b0;`, `reg [K-1:0] key_sig = …`, `.btnC(key_sig[0])`, `board_bits` from
`stateFields`, `$fscanf(fin, "%d %b", seq, rec)` with `rec` sized `stimLength`, slices from `stimFields`. Off values for
tie-offs come from the board's polarities. The file keeps its own `` `timescale 1ns/1ps ``; the clock half period is
written with up to 3 decimals in ns (`#5`, `#41.667`). Default output byte-identical.

### 7.4 Multiplexed display decoder

Behaviour, per display d, evaluated on every poll of the `io` process:

| `an_sig(d)` | Word in `STATE` |
|---|---|
| active (`AN_ON`) | The **live** segments (and dp). |
| inactive, and the digit was enabled within `DISPLAY_PERSIST` | The latched word: the segments last seen while it was enabled. |
| inactive, never enabled or enabled longer ago than `DISPLAY_PERSIST` | All segments off. |
| `'X'`, `'U'`, `'Z'`, … (not `'0'` or `'1'`) | All bits `X`; the UI draws an undefined display as it draws an undriven LED. |

`DISPLAY_PERSIST = 75 ms`: one named constant in `server/src/engines/boardTiming.ts`, written into both generators.
75 ms gives a margin over the 50 ms period of a 20 Hz refresh. It is documented in `BOARDS.md` and Help ("a digit not
refreshed for 75 ms goes dark") and is not configurable in v2.

What this gives:

- Correct multiplexing shows stable digits; `STATE` changes only when a digit's content changes.
- Static drive (one or all enables held on) shows the live segments on every enabled digit, from time 0, in both
  languages, with no expiry.
- Two digits enabled at once both show the segments, as on the board.
- Segments that change in the same delta or one clock after the enable end on the right value: the latch keeps updating
  while the digit is enabled.

Generated VHDL for a board **with** a decimal point (Basys 3: D = 4, W = 8, both polarities active low):

```vhdl
  constant DISPLAY_PERSIST : time := 75 ms;
  constant AN_ON   : std_logic := '0';
  constant SEG_OFF : std_logic := '1';
  type digit_words_t is array (0 to 3) of std_logic_vector(7 downto 0);
  type digit_times_t is array (0 to 3) of time;
  signal digit_word : digit_words_t := (others => (others => SEG_OFF));
  signal digit_last : digit_times_t := (others => 0 ns);
  signal digit_seen : std_logic_vector(3 downto 0) := (others => '0');

  mux_capture : process (seg_sig, dp_sig, an_sig)
  begin
    for d in 0 to 3 loop
      if an_sig(d) = AN_ON then
        digit_word(d) <= dp_sig & seg_sig;
        digit_last(d) <= now;
        digit_seen(d) <= '1';
      end if;
    end loop;
  end process;
```

Without a decimal point (W = 7) the generator writes `std_logic_vector(6 downto 0)`, `process (seg_sig, an_sig)` and
`digit_word(d) <= seg_sig;`. `dp_sig` does not exist then. The sensitivity list is complete, so no VHDL-2008 `all` is needed.

The word per display is computed inside the `io` process, in the loop that builds `now_bits` (`word` is a local
variable of the process):

```vhdl
      for d in 0 to 3 loop
        if an_sig(d) = AN_ON then
          word := dp_sig & seg_sig;                       -- seg_sig alone when W = 7
        elsif an_sig(d) /= not AN_ON then
          word := (others => 'X');                        -- unknown enable
        elsif digit_seen(d) = '1' and now - digit_last(d) <= DISPLAY_PERSIST then
          word := digit_word(d);
        else
          word := (others => SEG_OFF);
        end if;
        -- append slv2str(word) to now_bits for display d
      end loop;
```

Verilog: the same rules, with `always @(seg_sig or dp_sig or an_sig)` for the capture, `$time` (64-bit, in the 1 ns
timescale unit) and `localparam [63:0] DISPLAY_PERSIST = 64'd75_000_000;`. An unknown enable is tested with `=== 1'bx`
or `=== 1'bz`. The live path makes Verilog and VHDL agree at time 0 even though a Verilog `always` block does not run
until its first event.

---

## 8. Width check before elaboration

`server/src/engines/boardShapeCheck.ts`: `checkBoardPortShapes(top, board): ShapeCheck[]`.

- The port parsers (`vhdlPorts.ts`, `verilog/ports.ts`) gain `width?: number` and `declaration: string` (the type as
  written) per port:
  - VHDL: `std_logic`, `std_ulogic`, `bit` → 1; `std_logic_vector`, `std_ulogic_vector`, `bit_vector`, `unsigned`,
    `signed` with a literal `(N downto M)` or `(M to N)` range → its width.
  - Verilog: no range → 1; a literal `[N:M]` → its width; `wire`, `reg` and `logic` are treated alike.
  - Anything else (generics, expressions) → `width` undefined.
- For every board port the top declares, compare with the board width (vector count, 1 for scalars, W for independent
  displays, 7 for a `seg` vector, `digits` for the digit enables).
- A mismatch is an **error**, and the run stops before elaboration. The message quotes the declaration and the
  expected one:

  ```
  SW is declared as std_logic_vector(9 downto 0) (10 bits), but Basys 3 has 16 switches.
  Expected: sw : in std_logic_vector(15 downto 0);
  ```

- A board port whose width cannot be read is an **info** line, and the run goes ahead:
  `SW has a width HDLBoard cannot read (std_logic_vector(N-1 downto 0)); Basys 3 expects 16 bits.`
- VHDL and Verilog engines call it right after `findTopEntity`.

---

## 9. Rename between boards (`renamesBetween`)

One rule for every role: **a port is renamed only when, after the rename, that port needs no further edit.** That
means the same structure (vector/scalars/cross, independent/multiplexed), the same width, and the same polarity.
`roleRenames(role, from, to)` implements it once per role; the table lists what that means:

| Role | Renamed when |
|---|---|
| clock | Always (one name). A frequency change is listed separately as a hand edit. |
| clock500Hz | Always. |
| switches, leds | Same count. |
| pushbuttons | Same structure and count and same polarity: vector → the name; scalars or cross → name by name in group order. |
| resetButton | Both boards have one, with the same polarity. |
| sevenSegment | Both independent with the same count, width and polarity → name by name. Both multiplexed with the same `digits` and polarities → `segments` only when both are vectors or both scalars, `decimalPoint` when both have one, `digitEnables`. Anything else → not renamed. |

Everything not renamed is covered by a `ShapeDifference`. The token-aware engine, conflict check and Undo are unchanged.

---

## 10. Clean Code rules for this work

- **One layout table.** `stimFields` / `stateFields` describe the bit layout once per package; encoders, decoders,
  lengths and both testbench generators read them. The protocol bound comes from `boardLimits.ts`.
- **One normalized model.** Only `parseBoards.ts` (frontend) and `boardFrame.ts` (backend) know the file and wire
  alternatives. No component checks `'cross' in pushbuttons`.
- **One rename rule** (§ 9) in `roleRenames`; **one persistence constant**; **one external-link helper**.
- **Board as a parameter**, as in v1 (D11 of v1): no "current board" in any pure helper.
- New UI parts (`PushbuttonCross`, `ResetButton`, `BoardResourceLinks`) have no board logic; `BoardIoPanel` maps the
  board to their props.
- Names say what things are: `buttonCount`, `displayWordWidth`, `restInputs` — no `n`, `len`, `cfg`.

---

## 11. Implementation order

Review gates on one branch, as in v1. Each gate keeps every existing test green; Default and DE1-SoC behave exactly as
before until gate 4.

**Gate 0: verify names — merge blocker for gate 1**
1. Check the DE10-Lite names (`MAX10_CLK1_50`, `KEY[1:0]`, `SW[9:0]`, `LEDR[9:0]`, `HEX0`…`HEX5` as `[7:0]`) against the
   DE10-Lite user manual or a System Builder project, and the Basys 3 and Nexys A7 names against the linked XDC files.
   Fix `builtinBoards.json`, and record each source (document, version, date) in `BOARDS.md` § "Sources of the built-in boards".

**Gate 1: model (frontend, pure, no visible change)**
2. `types.ts` v2, `boardLimits.ts`, `parseBoards.ts` (v2 + `upgradeV1Board`), `builtinBoards.json` v2, `board.schema.json`
   v2, `boardShape.ts` (§ 4.1), `boardFrame.ts` JSON encoder. Tests (§ 12.1).
3. Replace the fixed count constants with the shape helpers in `boardPorts.ts`, `renamePorts.ts` callers, `helpSignals.ts`.

**Gate 2: backend shapes (independent displays, scalars, polarity, clock)**
4. `BoardIo` v2, `boardLimits.ts`, `decodeBoardBody` (JSON + v1), `validateBoardIo`, bindings with `index`.
5. Session: `STIM` length per board; `stimFields` / `stateFields`.
6. `tbTemplate.ts` and `verilog/testbench.ts` from the board. Golden files unchanged for Default.
7. Integration matrix: every built-in board × {VHDL, Verilog} × {board run, testbench run}, except multiplexed displays.

**Gate 3: multiplexed decoder**
8. Decoder in both generators (§ 7.4) with the tests of § 12.2.

**Gate 4: board pane and wire in the frontend**
9. `hdlClient`: raw `STIM`/`STATE`, protocol version 3, `WELCOME` version handling (§ 6.3). `BoardInputs`,
   `restInputs`, `sameInputShape` in the Workbench.
10. `BoardIoPanel` from the shape: counts, `PushbuttonCross`, `ResetButton`, decimal point, multiplexed heading, `boardScale`.

**Gate 5: board info, change dialog, examples**
11. `BoardResourceLinks` in Settings › Board and Help.
12. `ShapeDifference`, `roleRenames`, the dialog sections (§ 5.3).
13. Examples notice with **New starter file**, `generateBoardTop`, testbench-detection set (§ 5.6).

**Gate 6: width check and docs**
14. `width` and `declaration` in both port parsers, `checkBoardPortShapes` (§ 8).
15. `docs/BOARDS.md` v2: the format; a cross diagram (`up` above, `left centre right`, `down` below, with indices 1, 2 0 3,
    4); the polarity model; the multiplexing behaviour and `DISPLAY_PERSIST`; why a 100 MHz clock simulates more slowly;
    the Course board example; sources of the built-in boards. README board list, `docs/changelog.txt`, Help text.

---

## 12. Tests

### 12.1 Frontend (vitest)

- `parseBoards`: every built-in parses. A v1 file upgrades to the same `BoardPorts` as the v2 Default. A v1 file with
  one valid and one invalid board loads the valid one and warns once. One failing case, with its exact warning, for each
  § 3.4 rule: cross missing `down`, cross with an extra key, `clockMHz: 0.5`, `clockMHz: 1001`, 19 switches,
  duplicate name across roles, `clock500Hz` default colliding with `clock`, duplicate resource labels, and resource URLs
  `http://…`, `javascript:alert(1)`, `data:text/html,x`, `not a url`, a URL with a space, a URL with a control
  character, a 513-character URL.
- `boardShape`: `stimLength`/`stateLength` per built-in (14/52, 14/52, 12/58, 21/48, 22/80), plus a test-only
  **multiplexed board without a decimal point** (4 digits → state = LEDs + 4 × 7) for the 7-bit path.
  `encodeStim`/`decodeState` round trip. Default payloads identical to the 1.6.0 encoder for 100 inputs from a seeded
  generator (seed `0x27`, written in the test).
- Round trip: for every built-in and the test-only board, `BoardPorts` → `encodeBoardFrame` → (backend fixture) →
  `decodeBoardBody` deep-equals the original minus `layout`.
- `encodeBoardFrame`: fixed text per built-in, shared as fixtures with the backend tests. A guard test fails if the
  Default frame text or `DEFAULT_BOARD_IO` changes.
- `describeShapeChange`: Default ↔ DE1-SoC empty; Default → Basys 3 the five differences of § 4.1, in role order; a
  board equal to Default except 100 MHz gives only the clock difference and is still `isDefaultShape`.
- `roleRenames`: each row of § 9, including Basys 3 → Nexys A7 (no segment rename: vector vs scalars; no `an` rename:
  4 vs 8 digits) and a polarity change (never renamed).
- `generateBoardTop`: output per built-in × language (snapshot); a test-only board with 16 switches and 8 LEDs, and one
  with 8 switches and 16 LEDs; each passes `checkBoardPortShapes`.
- `BoardIoPanel` (component test): part counts per built-in; cross positions and aria labels; reset button only on
  Nexys A7; decimal point lights on DE10-Lite; inputs kept on Default → DE1-SoC and reset on Default → Basys 3.

### 12.2 Backend (node:test)

- `decodeBoardBody`: the shared fixtures decode; a v1 line body still decodes; `version` missing or `3` is rejected;
  injection attempts in names (`"x;y"`, a newline, a quote) and out-of-range counts are rejected.
- Session: `STIM` of the wrong length → `ERROR protocol` with the board-specific count; correct length accepted.
- Golden testbenches for Default unchanged (VHDL and Verilog); new golden files per new built-in.
- Integration (GHDL and Icarus), per board:
  - a design that copies switches to LEDs and a button to an LED, through `STIM` → `STATE`, including active-high buttons;
  - a design that clears a counter with the **reset button**, checking its rest level and polarity (Nexys A7);
  - a 100 MHz clock counter checked against simulated time; a 74.25 MHz test-only board checked for its ps half period.
- Decoder (gate 3), both languages:
  - 4- and 8-digit refresh designs driven from `CLOCK_500Hz` → stable digits;
  - static drive of all digits from time 0 → digits shown at once and still shown after 200 ms;
  - a digit never enabled → off; a digit whose refresh stops → off after 75 ms;
  - enables switching faster than the persistence window;
  - segments changing in the same delta as the enable, and one clock later → final value shown;
  - an undriven (`'U'`/`x`) enable → that display all `X`;
  - the test-only board without a decimal point.
- Protocol compatibility: a v1 `BOARD` body against the v3 backend runs; the client logic of § 6.3 against a recorded
  `WELCOME 2` refuses a Basys 3 run with the message and runs a Default run with the v1 body.
- `checkBoardPortShapes`: 10-bit `SW` on Basys 3 → the § 8 message; `std_ulogic` scalar → width 1; a generic range →
  the info line.

### 12.3 Manual check (`tests/e2e/board-shapes.md`)

1. Select each board in Settings; the pane shows the right parts and fits; Basys 3 and Nexys A7 show their links; Default shows none.
2. On Basys 3, press **New starter file**, run it, flip `sw15`: `led15` lights.
3. Run a 4-digit refresh counter on Basys 3 driven from `CLOCK_500Hz`: four stable digits.
4. Change Default → Nexys A7 with the bundled example open: the dialog lists the clock rename and the hand edits.

---

## 13. Acceptance criteria

1. Default and DE1-SoC look and simulate exactly as in 1.6.0; all existing tests pass unchanged.
2. DE10-Lite, Basys 3 and Nexys A7 are selectable; the Board pane shows their counts, layouts, reset button and
   decimal points; inputs rest at the correct levels.
3. A design written in the board's master names simulates on each board in VHDL and Verilog.
4. Multiplexed displays show stable digits for a design refreshing at 20 Hz per digit or faster, and for static drive.
5. Settings › Board shows the resource links for Basys 3 and Nexys A7 and none for Default.
6. A v1 user board file still loads; a v2 user board (the Course board) loads.
7. Changing to a board of another shape lists the hand edits; nothing is half-renamed.
8. A wrong port width gives the § 8 message, not a GHDL elaboration error.
9. A project whose board id is not installed opens with the Default board (names **and** shape) and the v1 warning
   `Board "x" is not installed here; simulating with Default names.` with **Choose a board…**.

---

## 14. Out of scope

- Resource links for DE1-SoC and DE10-Lite (the format supports them; add when the URLs are chosen).
- Boards without a seven-segment display, or without LEDs or switches: every role except `resetButton` is required in v2.
- Translating the built-in examples to other shapes.
- Ghosting or brightness simulation of multiplexed displays; a configurable `DISPLAY_PERSIST`.
- Other Digilent/Terasic I/O (VGA, PS/2, Pmod, RGB LEDs, the DE10-Lite second clock and ADC clock).
- Constraint-file export (`.xdc`, `.qsf`) from a board.
- Digilent's GPIO-demo vector names (`BTN(4 downto 0)`, `SSEG_CA`, `SSEG_AN`, see
  [GPIO_Demo.vhd](https://github.com/Digilent/Basys3/blob/master/Projects/GPIO/src/hdl/GPIO_Demo.vhd)): a user can add them as a
  user board, because v2 supports vector buttons and vector segments.

---

## 15. Research notes

- Basys 3 and Nexys A7 names, polarities and digit counts: the master XDC files linked in § 1 and the issue's tables.
- DE10-Lite: names from the issue (Terasic System Builder top level, unverified); Gate 0 records the checked source.
- The current Verilog testbench declares `` `timescale 1ns/1ps `` (`verilog/testbench.ts`), which § 7.3 and § 7.4 rely on.

---

## 16. Review log

### 16.1 Taken

| Comment | Change |
|---|---|
| Cross order is checked by count only. | A cross is written with position keys (§ 3.2, F3). `layout` is no longer in the file: the form of `pushbuttons` decides it, so "5 scalars with `layout: row`" and "cross with 4 ports" cannot be inconsistent. |
| `STIM` regex (64) disagrees with D9 (27). | Bound from `MAX_STIM_BITS` in `boardLimits.ts` (§ 6.2). |
| Example error used 27 bits, the maximum. | Board-specific example: 21 bits for Basys 3 (§ 6.2). |
| `clock500Hz` default can collide. | It takes part in uniqueness; collision rejects the board with a fix-it message (§ 3.4, F13). |
| Clock rename hides the frequency change. | Name and frequency split: the name is renamed, the frequency is a hand edit (§ 4.1, § 5.3, § 9). |
| Starter with fewer LEDs than switches. | One assignment per case, VHDL and Verilog (§ 5.5). |
| Protocol version skew undefined. | Compatibility table; the client reads `WELCOME` (§ 6.3). JSON body carries `version` (§ 6.1). |
| Expiry checked only when state is emitted; static drive goes blank after 50 ms. | `now_bits` is evaluated on every poll; an enabled digit shows live segments, so static drive never expires and VHDL/Verilog agree at time 0 (§ 7.4, F14). |
| Unknown enable values. | Display shown as all `X`; tested (§ 7.4, § 12.2). |
| Decoder snippet did not compile as written. | Constants declared; W = 7 and W = 8 variants spelled out (§ 7.4). |
| Verilog timescale unstated. | `1ns/1ps`, 64-bit `$time`, `DISPLAY_PERSIST` in ns (§ 7.4). |
| 50 ms sits on the 20 Hz boundary. | `DISPLAY_PERSIST = 75 ms`, one named constant, documented (§ 7.4). |
| Width-error example quoted the expected, not the actual declaration. | Message quotes both (§ 8). Info line when a width cannot be read; `std_ulogic`, `bit`, `signed`, `unsigned`, `logic` handled. |
| Multiplexed rename compatibility vague; renames with width changes are not clean. | One rule: rename only when no further edit is needed (§ 9). Polarity changes are never renames. |
| Basys 3 test; 7-bit multiplexed path untested. | Test-only multiplexed board without a decimal point (§ 12.1, § 12.2). |
| Board change mid-run; deleted user board id. | D11; acceptance criterion 9. |
| `clock500Hz` in the generated top file. | Declared with a "simulator only, delete before synthesis" comment (§ 5.5). |
| Legacy `rst` source on Nexys A7. | Reset button when present, else button 0; commented in the generated code, explained in Help (§ 7.2, § 5.7). |
| Multiplexed binding roles not enumerated. | Table in § 7.1. |
| `clockMHz` must divide 500 is too strict. | Any value 1–1000 MHz with up to 3 decimals; half period rounded to 1 ps, `ns` kept when whole so Default stays byte-identical (§ 3.2, § 7.2). |
| `isDefaultShape` includes the clock. | Frequency removed from the shape (§ 1.1, § 4.1). |
| Scale counts parts as equal width; can get too small. | Weighted by part pitch, minimum size 12, horizontal scroll below that (§ 5.1). |
| Inputs reset even when nothing changes. | Kept when `sameInputShape` (§ 5.1). |
| URL length, duplicate labels, label rendering, the "4" limit. | D8. |
| Notice text hardcoded. | Generated from `DEFAULT_SHAPE` (§ 5.4). |
| No-display boards. | Listed in § 14. |
| Limits as implementation constants. | `boardLimits.ts`, D9. |
| Decimal-point bit order. | Table in § 3.3. |
| Shape differences as structured data. | `ShapeDifference` + `formatShapeDifference` (§ 4.1), stable role order. |
| Gate 0 as merge blocker; record what was checked. | § 11 gate 0; `BOARDS.md` sources section. |
| Round-trip test; guard for `DEFAULT_BOARD_IO`. | § 12.1. |
| Scalar bit order normative. | D5 (first scalar = bit 0, sent last). |
| Two digits enabled at once. | Stated in § 7.4. |
| Static enable from reset test, fast enable changes, same-delta changes, reset-button test, seeded random test, URL attack tests, mixed-version tests, v1 multi-board test. | § 12. |
| Fixed key order inside nested objects. | § 6.1. |
| Dropped `STATE` frames are silent. | One developer-console warning per run (§ 6.2). |
| Cross positions not visible. | Port-name labels plus position in aria label and tooltip (§ 5.1). |
| Reset button placement. | Right of the buttons, in the same panel (§ 5.1). |
| Dialog summary line; group multiplexed renames. | § 5.3. |
| One-click starter from the Examples notice. | **New starter file** button (§ 5.4). |
| One external-link path. | `BoardResourceLinks` uses the existing helper (§ 5.2). |
| Docs: cross diagram, polarity model, 100 MHz explanation, glossary, legacy `rst`. | § 1.1, § 5.7, § 11 gate 6. |
| `DEFAULT_SHAPE` constant. | § 4.1. |
| ASCII case folding. | § 3.4. |
| Short abstract, target release, package name, full issue URL, link to GPIO demo. | Header, § 14. |

### 16.2 Not taken (with the reason)

| Comment | Reason |
|---|---|
| Stray `...` after headings and malformed tables (§ 2.2, § 3.5, § 4.1, § 7.4, § 8, § 13). | Not in the source file; the only `...` was intended (now removed from § 3.5 as well). Likely a rendering artefact on the reviewer's side. |
| Use `process (all)`. | Needs VHDL-2008; the sensitivity list is complete and is generated from the same data as the body. |
| Collect all validation errors per board. | v1 reports the first problem per board; an expert fixes and reloads. Collecting all errors would restructure every parser function for little gain. |
| Unknown keys as warnings in user files. | Typos would then be silently ignored, which is the error the strict rule prevents. The file `version` is the forward-compatibility mechanism. |
| Board categories (Educational / Physical / Custom). | Five radio buttons with descriptions do not need grouping; the Default description already says what it is. Revisit if the list grows. |
| `boardShapeSignature` helper. | `isDefaultShape`, `sameInputShape` and `ShapeDifference` already cover every comparison; a string signature would be a second representation of the same data. |
| Make `clock500Hz` a simulator detail, not a board field. | The name must be changeable when it collides with a board port (F13). It stays optional and defaults to `CLOCK_500Hz`. |
| `verifiedFrom` field in the board file. | Provenance belongs in documentation, not in data every board must carry; recorded in `BOARDS.md` instead (§ 11 gate 0). |
| Board id or hash in the `BOARD` frame. | The backend never needs the id; the frontend already logs `Board: <name>` per run. |
| A button in the Change-board dialog to open a starter file. | The dialog already states that the design will not run until changed, and lists the resources; the Examples notice has the starter button. One place is enough. |
| Link each acceptance criterion to its tests. | The criteria are short and numbered; a cross-reference table would need upkeep with every test rename. |
| Require `layout: "cross"` when there are 5 scalars. | A row of five scalar buttons is a valid board. The position-key form makes the cross explicit instead. |
| Deep-freeze the board model. | `readonly` types already prevent mutation at compile time; runtime freezing adds no safety for this code. |
| Remove the limits from the file rules entirely. | The UI and the wire need bounds, so the parser still enforces them; they are now implementation constants (D9), so raising one is a one-line change. |
