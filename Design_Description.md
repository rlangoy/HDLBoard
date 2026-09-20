# HDLBoard — Design Description

> Licensed under the [GNU General Public License v2.0](LICENSE).

Working notes for the browser-side board components used in **PB1180
Programmerbare logiske kretser**. Read this before touching a component;
update it whenever a decision changes.

The goal is a panel that looks like the real DE-series board hardware and
carries the same signal names students use in VHDL (`SW`, `LEDR`, `HEX`,
`KEY`), so the on-screen switch and the port in the entity are obviously the
same thing.

**Start with § 1.** It states the three non-negotiables — the stack, the
hardware realism requirement and the code standard — that everything else in
this document is downstream of.

> **Note on this copy:** this document is included here for the design
> rationale and the measured ratios in § 4. The `DesignResources/` reference
> renders it cites by filename are not bundled in this project — they live
> alongside the original component library HDLBoard was built from.

---

## 1. Mandate

Three things are settled and not up for re-litigation in a later component.
Everything else in this document follows from them.

### 1.1 The stack: TypeScript + React + CSS

Every component is written as a **TypeScript + React function component with
plain CSS**. No exceptions, no per-component variation.

| Layer | Rule |
|---|---|
| **TypeScript** | `strict` mode. Props are an exported `interface`. No `any`, no non-null `!` on values that can genuinely be absent, no `@ts-ignore`. Domain types (`Bit`, `BitVector`) are declared once in `board/bits.ts` and reused. |
| **React** | Function components with hooks. No class components. Every panel works both **controlled** (`value` + `onChange`) and **uncontrolled** (`defaultValue`). Components hold only their own UI state — the bit vector belongs to the caller. |
| **CSS** | Plain `.css` files next to the component. No CSS-in-JS, no Tailwind, no preprocessor. Values come from custom properties in `board/tokens.css`. The only inline style a component ever writes is the scale override (`--pb-unit`). |

The reason for the constraint is longevity, not taste: this is course material
that has to still build in five years, and a student has to be able to read the
CSS and see how the hardware look is produced. A styling framework would hide
exactly the part that is worth reading, and would date faster than the course.

Build tooling is Vite. Nothing in `src/components/` may depend on Vite
specifics, so the folder stays copy-paste portable into another app.

### 1.2 The components must look like, and behave like, real hardware

A component is not "a checkbox with a label". It is a picture of a part on the
DE-board, and it has to survive being projected on a lecture-room wall next to a
photo of the real thing.

That means:

1. **The look is measured, never invented.** Colours, dimensions, edges and
   gradient stops are sampled from the reference renders in
   `DesignResources/` and recorded as ratios in § 4. Where no reference exists
   (the lit LED), the design is derived from how the real part behaves and the
   reasoning is written down.
2. **Physical state, not decorative state.** A switch does not change colour
   to say it is on — its knob *travels* to the other end of the slot, the way
   your thumb would push it. A lit LED has a hot core where the die is. The
   state change must be the thing the real part does.
3. **One light source.** Upper-left, everywhere, for every component.
   Highlights on top and left, shadows on bottom and right. A part lit from a
   different direction reads as a sticker.
4. **Real geometry across panels.** All groups share one scale unit and one
   column pitch, so `LEDR3` sits directly under `SW3` exactly as it would on
   the board (§ 4.8).
5. **Inputs are operable, outputs are not.** `SW` and `KEY` are clickable;
   `LEDR` and `HEX` are display-only unless explicitly asked to be
   interactive. On a real board an output is driven by the design, and the
   component must not pretend otherwise.
6. **Pure CSS, no bitmaps.** The hardware look is gradients, borders and
   shadows — so it stays sharp at any size and any display density, and can be
   retinted through tokens.

Test for whether a component is done: put a screenshot next to the reference
PNG at the same width and look at them. If you can tell at a glance which is
which, it is not done.

### 1.3 Built to Clean Code principles

The code is read by students as well as run by browsers, so it is held to the
same standard as the VHDL examples in the course: **nothing in the file that
does not earn its place.**

| Principle | What it means here |
|---|---|
| **Meaningful names** | `--pb-sw-track-top`, not `--offset2`. `bitsToNumber`, not `conv`. A name states what the thing *is*; if a comment is needed to explain a name, the name is wrong. |
| **Single responsibility** | `Led` draws one LED. `Leds` arranges a bank of them. `Panel` draws the card. Nothing does two of those jobs. |
| **Small units** | A component that no longer fits on a screen is doing too much and gets split — that is exactly how `board/` came about. |
| **Don't repeat yourself** | The card, index row and readout exist **once**, in `components/board/`, and every group reuses them. A second copy of the panel markup is a bug, not a shortcut. |
| **No magic numbers** | Every dimension is a named token in `tokens.css`, derived from `--pb-unit`. A raw `px` in a component stylesheet is allowed only for 1 px hairlines. |
| **Comments say *why*** | The code already says what it does. Comments carry the measurement, the reference it came from, or the reason a value is not the obvious one. |
| **No dead code** | No unused props, signals, imports, classes or CSS rules. No element placed only for symmetry. `noUnusedLocals` and `noUnusedParameters` are on so the compiler enforces it. |
| **Consistent formatting** | One style throughout: 2-space indent, single quotes, trailing commas, `pb-<block>__<element>` for classes, `is-*` for state. |
| **Fail visibly** | Prefer a type error at build time over a silent wrong render. `npm run typecheck` must be clean before anything is called done. |
| **Verify, don't assume** | A change is not finished until it has been built and looked at (§ 7). |

Anything left unresolved goes in § 8 as an open question — not as a `TODO`
buried in a source file.

---

## 2. Status

| Component | Reference PNG | State |
|---|---|---|
| `Switches` (`SW[9:0]`) | `DesignResources/Switches_v2.png` | **done** |
| `Leds` (`LEDR[9:0]`) | `DesignResources/LEDs.png` | **done** |
| `Pushbuttons` (`KEY_N[3:0]`) | `DesignResources/PushButtons.png` + `PushButtonStates.png` | **done** |
| `SevenSegmentDisplays` (`HEXn_N[6:0]`) | `DesignResources/7SegmentDisplays.png` + `7SegmentDisplay_maping.png` + `7SegmentDisplay_pin_assignment.png` | **done** |
| `Board` (2×2 grid) | `DesignResources/Component_grouping.png` | **done** |

The components are finished, and so is what drives them: `LEDR`/`HEX` are
now driven by a real GHDL simulation of whatever VHDL is open in the
editor, over a WebSocket backend — specified and built per
[`ghdl_implementation_plan.md`](ghdl_implementation_plan.md). Not one
component changed to support it; see § 5 convention 11 for the boundary
that made that possible, and the mock it replaced (`<Leds value={sw} />`)
worth knowing about even though it's gone, since it's the failure mode to
avoid if this ever gets touched again.

---

## 3. Project layout

```
UI/
├─ README.md                    how to USE the components
├─ Design_Description.md        ← this file: how they are BUILT
├─ ghdl_implementation_plan.md  the GHDL backend: protocol, design, build log
├─ DesignResources/             ← reference renders (do not edit)
├─ Examples/                    built demos + reference comparisons
├─ docs/                        screenshots used by README.md
│                              (board-grid, led-states, led-colours,
│                               key-states, hex-table)
├─ index.html
├─ package.json                 vite + react 18 + ts
├─ tsconfig*.json
├─ vite.config.ts
├─ tools/
│  ├─ screenshot.mjs            visual check helper (playwright)
│  └─ bundle.mjs                inline a build into one .html for Examples/
├─ server/                      GHDL backend, Node + TS — planned, not built
└─ src/
   ├─ main.tsx
   ├─ index.css                 gallery page only — not part of any component
   ├─ App.tsx                   picks Workbench, or the gallery at #gallery
   ├─ ComponentGallery.tsx      every component/state — the § 7 QA page
   └─ components/
      ├─ board/                 shared by every group
      │  ├─ index.ts            public surface of the shared layer
      │  ├─ tokens.css          all design tokens (.pb-ui)
      │  ├─ panel.css           card chrome, bit row, readout
      │  ├─ Panel.tsx           <Panel>, <BitRow>, <Readout>, helpers
      │  ├─ Board.tsx           <Board> — the 2×2 grid
      │  ├─ Board.css
      │  └─ bits.ts             Bit, BitVector + conversions
      ├─ Switches/
      │  ├─ index.ts
      │  ├─ ToggleSwitch.tsx    one slide switch
      │  ├─ ToggleSwitch.css
      │  ├─ Switches.tsx        the SW[9:0] panel
      │  ├─ Switches.css        (forwarder → board/panel.css)
      │  ├─ tokens.css          (forwarder → board/tokens.css)
      │  └─ types.ts            (forwarder → board/bits.ts)
      ├─ Leds/
      │  ├─ index.ts
      │  ├─ Led.tsx             one LED
      │  ├─ Led.css
      │  └─ Leds.tsx            the LEDR[9:0] panel
      ├─ Pushbuttons/
      │  ├─ index.ts
      │  ├─ Pushbutton.tsx      one momentary pushbutton
      │  ├─ Pushbutton.css
      │  └─ Pushbuttons.tsx     the KEY_N[3:0] panel
      ├─ SevenSegment/
      │  ├─ index.ts
      │  ├─ segments.ts         the decoder table + bit↔segment mapping
      │  ├─ SevenSegmentDisplay.tsx   one HEX module
      │  ├─ SevenSegmentDisplay.css
      │  └─ SevenSegmentDisplays.tsx  the HEXn_N[6:0] panel
      └─ workbench/             the app shell — DesignResources/WorkBench.png
         ├─ index.ts
         ├─ Workbench.tsx       the main page; owns all its state
         ├─ Workbench.css       grid shell + the ordinary (non-hardware) tokens
         ├─ Header.tsx / .css   logo, title, Settings + Help + About buttons
         ├─ Dialog.tsx / .css   the modal shell shared by the three dialogs
         ├─ AboutDialog.tsx / .css     repo, copyright, licence, no-warranty
         ├─ SettingsDialog.tsx / .css  "no settings yet — file an issue"
         ├─ HelpDialog.tsx / .css      board signal names + VHDL learning links
         ├─ helpResources.ts    the Help links: 1 cheat sheet, 5 ranked guides
         ├─ project.ts          REPO_URL, ISSUES_URL, ABOUT_EVENT
         ├─ FileExplorer.tsx / .css   the Files panel + tree
         ├─ CodeEditor.tsx / .css    tabs + a highlighted textarea overlay
         ├─ SimulationCard.tsx / .css  Start/Stop + status, in the sidebar
         ├─ ConsoleOutput.tsx / .css the GHDL Output/Status log
         ├─ vhdlHighlight.ts    line-based VHDL tokenizer for the editor
         ├─ files.ts            the three-file starter project shown in the tree
         ├─ icons.tsx           edit/delete — real SVG, the one exception
         │                       to this folder's CSS-only icons
         └─ ghdlClient.ts       the simulator's WebSocket client — planned,
                                 the only file that speaks to the backend
```

`workbench/` is IDE chrome, not a hardware part: it has no reference render
to measure geometry from, so § 1.2 and § 4 do not apply to it — only § 1.1
and § 1.3. It is a consumer of the board layer, exactly like `App.tsx`,
just promoted to the app's main page.

Its one genuinely tricky piece is the resizable three-pane row, whose rules
are set out in `workbench/README.md` § Resizing. The short version, because
all three were bugs first: a draggable pane gets **no fixed maximum** (a cap
means the divider cannot be dragged back to where it sat once the window
grows); the flex row needs **`min-width: 0`** or, as a grid item, it refuses
to shrink below its panes' combined width and the layout code silently
measures a frozen number; and the panes are **`border-box`**, because the
layout code budgets in rendered pixels and padding outside that number goes
unbudgeted. § 4.7.1 covers the separate question of fitting the board
*inside* that pane.

`SevenSegmentDisplay` rather than `7SegmentDisplay`: a JavaScript
identifier cannot start with a digit, and a React component must be
capitalised to be treated as a component at all.

The four files marked *forwarder* only re-export from `board/`; they exist so
imports written against the first version of `Switches/` keep working. New
code should import from `../board` directly.

Commands:

```
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build
npm run typecheck
```

---

## 4. Measured reference geometry

Everything below was sampled pixel-by-pixel from the reference PNGs.
**These numbers are the source of truth** — if a component looks wrong,
re-measure rather than eyeballing.

`W` is the board's scale unit: **one switch housing width**. Every ratio in
this section is against it, so the numbers stay comparable even though the
renders are not all drawn at the same size — `LEDs.png`, `PushButtons.png`,
`7SegmentDisplays.png` and `Component_grouping.png` all draw the housing at
29 px, while `Switches_v2.png` draws it at 57. Each subsection says which
render it was measured from and at what pixel size, so a re-measure lands on
the same ratio.

### 4.1 Switch housing — `Switches_v2.png`

The switch was restyled from a rocker to a slide switch;
`DesignResources/Switches_v2.png` supersedes `Switches.png` for its
appearance. That render draws the housing 57 px wide, so its ratios are
against 57 rather than the 29 used elsewhere — the result is still one
housing width, which is what `W` means.

| Property | Reference px | Ratio to `W` |
|---|---|---|
| Housing width `W` | 57 | 1.000 |
| Housing height | 135 | 2.368 |
| Corner radius | ~8 | 0.140 |
| Border | `rgb(185,189,196)` `#b9bdc4` | 1 px, kept crisp |
| Face | `#ffffff` → `#e0e3e8`, top to bottom | — |

### 4.2 Switch track and knob

| Property | Reference px | Ratio to `W` |
|---|---|---|
| Track width | 38 | 0.667 |
| Track height | 81 | 1.421 |
| Track top inset | 28 | 0.491 |
| Track radius | ~8 | 0.140 |
| Track fill | `rgb(204,208,213)` → `rgb(210,214,219)` | top to foot |
| Knob width | 37 | 0.649 |
| Knob height | 34 | 0.596 |
| Knob radius | ~7 | 0.123 |
| Knob travel | 46 | 0.807 |
| Knob fill | `rgb(33,36,40)` → `rgb(79,82,87)` | top to foot |

The knob's own shading runs the *opposite* way to everything else on the
board: dark at the top, lightening toward its foot. That is not a mistake in
the reference — a dark cap sitting on a white housing picks up bounce off the
plastic right under it. The housing and the slot both obey the upper-left
light in the usual way: lit top edge, shaded foot, and the slot's inset
shadow falling from its upper wall.

#### The two switch states

**Knob at the top is 1, knob at the foot is 0**, which is what the reference
render shows and what the board's silkscreen implies. Only the knob moves;
nothing changes colour. If the polarity ever needs reversing, use the `flip`
prop on `ToggleSwitch` rather than editing the CSS.

### 4.3 LED — `LEDs.png`

| Property | Reference px | Ratio to `W` |
|---|---|---|
| Package width | 24 | 0.828 |
| Package height | 33 | 1.138 |
| Corner radius | ~7 | 0.245 |
| Outer ring | `rgb(117,125,135)` `#757d87` | 1 px |
| Light plastic rim | `rgb(233,236,239)` `#e9ecef` | ~0.10 × width |
| Lens, unlit | `rgb(124,132,137)` `#7c8489` | flat |
| Lens top highlight | +14 grey, top 18 % of the lens | — |
| Lens bottom / right edge | −16 / −23 grey, ~1 px | — |
| Lens corner radius | 0.62 × package radius | — |

The unlit lens is essentially flat grey with a soft highlight along the top
edge and a darker line down the right side and along the bottom — the same
upper-left light source as everything else. Nothing about it is glossy; the
package reads as moulded plastic, not glass.

`Component_grouping.png` draws the same LED **27 px wide** instead of 24 at
the same scale. The narrower 24 px version from `LEDs.png` is the one
implemented, because that is the render the component was specified against;
the pitch is taken from the board grid instead (see § 4.8).

#### The lit state

There is no reference render of a lit LED, so it is designed rather than
measured. A real through-hole red LED on a pale PCB shows a hot, almost white
core where the die sits, saturating out to deep red at the package wall, and
throws a visible halo onto the board around it. That is what the CSS does:

| Layer | Value |
|---|---|
| Lens | `radial-gradient(72% 56% at 50% 33%, …)` |
| Core | `#fff1ee` |
| Mid | `#ff6b52` |
| Body | `#f6210f` |
| Edge | `#a80b06` |
| Halo | two `box-shadow` rings, `rgba(255,48,28,.7)` and `.38` |
| Rim tint | `#fbe2dc` — the white plastic picks up the die colour |

The core sits at 33 % height, not 50 %, so the light reads as coming from a
die near the top of the package. `green` and `amber` variants use the same
structure with their own five values.

### 4.4 Pushbutton — `PushButtons.png`

| Property | Reference px | Ratio to `W` |
|---|---|---|
| Housing, square | 54 × 54 | 1.862 |
| Corner radius | ~12 | 0.414 |
| Cap diameter | 34 | 1.172 (0.63 × housing) |
| Pitch (centre to centre) | 73 | 2.517 |
| Housing face | `rgb(222,230,237)` `#dee6ed` | flat |
| Housing wall, upper-left | `rgb(141,153,167)` `#8d99a7` | 1 px |
| Housing wall, lower-right | `rgb(112,128,148)` `#708094` | 1 px |
| Cap body | `rgb(59,68,77)` `#3b444d` | — |
| Cap specular rim (top) | `rgb(133,139,143)` `#858b8f` | 1 px, inside the top edge |
| Cap underside | near black | 1 px, hard |

The cap is a dark rubber disc standing **proud** of the housing: one bright
line along its top edge, a hard black line along the bottom, and a soft shadow
dropped down-right onto the face. Same upper-left light as everything else.

Both `PushButtons.png` and `Component_grouping.png` draw it at 54 px with a
73 px pitch, so unlike the LED there is no discrepancy to reconcile.

The `KEY` accent is measured, not a placeholder: header `#daeefe`, border
`#b8dcfc`, title the same blue as `Switches`. It is *not* the cyan that was
guessed before the component existed.

#### 4.4.1 The four interaction states — `PushButtonStates.png`

This is the one component with a written interaction spec, and it is a
**2 × 2**: hovered or not, crossed with pressed or not.

| State | Housing | Cap |
|---|---|---|
| **Normal** | `#dee6ed` face, slate wall | raised, specular top rim |
| **Mouse over** | wall → `#1c79ef`, face → `#d2eafc`, blue outer halo | unchanged |
| **Pressed** | face drops to `#9fadba`, strong inset shadow from the upper-left wall, `#b8c4ce` bezel rim still lit | sinks `0.035 × Ø`, scales to 0.97, loses the specular rim and most of its drop shadow |
| **Pressed + mouse over** | the pressed well, **plus** the blue wall and halo | as pressed |

Implementation rule, and the reason this stays honest: hover is `:hover` and
pressed is the `.is-pressed` class, so the fourth state needs **no fourth
rule** — it is the other two selectors matching at once. What that costs is
one piece of care: the hover rule must not set the face, or it would beat
`.is-pressed` on specificity and a held button would go blue. So the face is
split into `:hover:not(.is-pressed)` and the wall/halo into plain `:hover`.

#### 4.4.2 Active low

`KEY` reads **1 when released and 0 when held** — the readout says `1111` at
rest, which is what the reference render shows. The component's `value` is
therefore the *signal*, not the pressed state, so what the readout prints is
what the entity port would carry. Pressing is momentary by default, because
the real part is: the signal returns to 1 on release.

### 4.5 7-segment display — `7SegmentDisplays.png`

| Property | Reference px | Ratio to `W` |
|---|---|---|
| Package | 54 × 76 | 1.862 × 2.621 |
| Corner radius | ~5 | 0.172 |
| Pitch (centre to centre) | 60 | 2.069 |
| Digit box | 27 × 48 | 0.931 × 1.655 |
| Segment thickness | 5 | 0.185 × digit width |
| Corner clearance | ~1.3 | thickness ÷ 4 |
| Slant | 9.6° | centre shifts 8 px over 47 rows |
| Package face | `--pb-part-face` `#dee6ed` | same moulding as `KEY` |
| Package wall | `--pb-part-edge` `#8d99a7` / `#708094` | 1 px |
| Unlit segment | `#f4f8fc`, near white | lighter than the package |
| Lit segment | `#c8211c`, flat red — see below | — |
| Decimal point | Ø 6, at 79 % / 79 % | unlit, always |

**Lit is one flat, deep red — and this is the one part of the board that is
deliberately unshaded.** The reference render draws every segment lit in pale
grey, so it carries no lit colour to measure; the value is sampled from a
photo of the real part, whose segment core runs from about `rgb(194,29,25)` to
`rgb(234,32,30)`. `#c8211c` is the dark end of that range.

No gradient, no highlight, no halo. A segment is a diffuser lit from behind,
so it has no specular face and no falloff: shading it makes it read as moulded
plastic instead of an emitting die, and it was a shaded version that looked
wrong side by side with the photo. This is the single documented exception to
the upper-left light source in § 1.2 rule 3 — the rule is about parts that
*reflect* light, and a lit segment emits it.

Two further things about this part are easy to get wrong and both were
measured:

- **The unlit segment is *lighter* than the package, not darker** — near
  white. That is what makes a dark digit still show its ghost, exactly like
  the real part, and the direction of it is what the reference render
  establishes: its unlit decimal point is the one element it draws dark, and
  it sits above the package, not below. The window is the same window whether
  or not it is energised, so it stays neutral next to the red.
- **Every bar is a separate mitred hexagon.** The horizontals are inset half a
  thickness at each end so their mitre tips land where the verticals' tips do;
  that inset is what opens the diagonal corner gaps. Without it the digit
  reads as one continuous outline rather than seven bars.

Segments are `clip-path: polygon()`, not SVG — § 1.2 rule 6. The mitres are
percentages of each bar's own long side, so they hold at any scale.

The decimal point is moulded into the package and never lights: the board has
no bit for it (`HEX0 … HEX5` are 7 bits each).

The package is the **same moulding as the pushbutton housings** — one face,
one wall, one bevel, from the shared `--pb-part-*` tokens, because on the
board they are the same piece of plastic. Retinting the board's mouldings is
therefore one token, not two.

The reference render shows `HEX = 00` on all six, which under active low means
**every segment lit** — that is why it reads `8` (in grey there, in red here).

#### 4.5.1 Segment numbering and the decoder table

The board numbers segments rather than lettering them a–g
(`7SegmentDisplay_maping.png`), and `HEX0[n]` drives segment *n*:

```
       0            bit 0  top          (a)
     ┌───┐          bit 1  top right    (b)
    5│   │1         bit 2  bottom right (c)
     ├─6─┤          bit 3  bottom       (d)
    4│   │2         bit 4  bottom left  (e)
     └───┘ ● DP     bit 5  top left     (f)
       3            bit 6  middle       (g)
```

`segments.ts` holds the course's own decoder table, transcribed verbatim as
MSB-first `"gfedcba"` strings so it can be diffed line by line against the
VHDL `case`. **Active low: `0` lights a segment.** Anything outside 0–15
blanks the display, matching `when others => "1111111"`.

One property of that table is worth knowing rather than fixing: `9` is
`"0011000"`, which leaves the bottom segment dark — the open-tail nine. Every
other pattern matches the canonical digit shape; this one is a style choice
and is reproduced as written.

### 4.6 Card / panel chrome

Identical for every group; only the three accent tokens change.

| Property | Reference px | Ratio to `W` |
|---|---|---|
| Card radius | ~12 | 0.41 |
| Card border | 2 px, accent | — |
| Card background | `#fafcfd` | — |
| Card padding (sides) | 18 | 0.62 |
| Header band | accent, 1 px bottom border | — |
| Header padding (vertical) | ~10 | 0.30 |
| Title | 17–18 px, bold, accent | 0.60 |
| Index label | 15 px, bold, `#1e3a8a` | 0.52 |
| Label → part gap | 13 | 0.36 |
| Part row → readout gap | 29 | 1.00 |
| Readout box | `#f1f5fb` on `#dbe5f1`, radius 6 | 0.20 |
| Readout text | 16 px mono, letter-spacing ~5 | 0.55 / 0.17 |

Index labels and the readout are the **same navy** in every group — only the
header band, card border and title take the group accent. That was verified
against every render that shows a readout.

### 4.7 Board layout — `Component_grouping.png`

| Property | Reference px | Ratio to `W` |
|---|---|---|
| Column gap | ~19 | 0.66 |
| Row gap | ~10 | 0.34 |

The four cards sit at x 5 / 430 and y 20 / 281, in reading order: **LEDs,
7-segment, switches, pushbuttons** — outputs on top, inputs underneath. They
are *not* stretched to a common width; each is its natural size, flush to the
top-left of its cell, which is why `Board` uses `max-content` columns with
`start` alignment.

`Board` is the whole of it — a grid and two gaps. It holds no state and knows
nothing about the panels inside it, so any subset or order works. What makes
the columns line up inside the cards is § 4.8, not this file.

Below 900 px the two columns stack rather than overflow, and the row gap takes
the larger of the two values since it becomes the only gap. That fallback is
keyed to the **viewport**, which is all a standalone `Board` can see; a `Board`
sitting in a pane whose width moves independently of the window needs § 4.7.1
instead.

Note the folder: `Board.tsx` lives in `components/board/` rather than a
`components/Board/` of its own. On Windows those are the same directory, and a
case-only difference between two sibling folders is a bug that only shows up on
one person's machine.

#### 4.7.1 Fitting a board to a container — reflow vs. scale

There are two ways to make the board survive a container smaller than its
natural size, and they answer different questions:

| | Stacking (§ 4.7) | Scaling |
|---|---|---|
| What gives | the arrangement | the size |
| Parts stay | full size, reordered | in place, smaller |
| Keyed to | viewport width | the container's measured box |
| Used by | standalone `Board`, the gallery | the Workbench board pane |

The Workbench scales. Its pane is user-resizable independently of the window,
and the point of the panel is that a student can see `LEDR <= SW;` — bit *n*
above bit *n* across all four cards (§ 4.8). Restacking moves those
relationships around; scaling preserves them exactly. So the pane never
scrolls and never restacks: the board is laid out once at `size={24}` and
`transform: scale(k)`-ed to fit, `k = min(paneW / naturalW, paneH / naturalH)`.

**Why a transform rather than a smaller `--pb-unit`.** The unit is the right
knob for *choosing* a size (§ 5.1), but it is not a fit-to-box knob, because
convention 1 exempts hairlines: the 1–2 px borders and shadows in
`ToggleSwitch.css`, `Led.css` and `panel.css` do not scale with it. Halve the
unit and the parts halve while their outlines do not, so at small sizes the
chrome swamps the part it outlines. A transform scales every length uniformly,
hairlines included, which is the one case where scaling the rendered result
beats rescaling the geometry.

It is also loop-free to measure: `offsetWidth` / `offsetHeight` and
`ResizeObserver`'s `contentRect` all report the *untransformed* layout box, so
reading the natural size never sees the scale that was just applied to it.

### 4.8 Row geometry, shared by all groups

Every reference card is 250 px tall even though an LED is only 33 px. The
extra room shows up as a taller gap under the LEDs. So each cell reserves the
height of the **tallest** part on the board — the HEX package, at 2.621 W —
and centres its own part in that band:

| Token | Value | Meaning |
|---|---|---|
| `--pb-pitch` | `1.362 W` | column pitch, `SW` and `LEDR` |
| `--pb-row-h` | `2.621 W` | part band = the tallest part, the HEX package |
| `--pb-cell-h` | `--pb-row-h + 0.88 W` | the band plus the index label (0.52) and its gap (0.36) |

`--pb-cell-h` is written as that sum rather than as `3.501 W` so the two stay
tied: change the tallest part and the cell follows.

`KEY` and `HEX` override the pitch with `--pb-cell-w`: four buttons and six
displays cannot line up with ten switches, and both parts are wider than
`1.362 W` anyway.

Consequence, and the reason it is done this way: **bit *n* sits at the same x
in every panel**, and all four cards come out the same height with no manual
tuning. This is what makes the 2×2 board grid line up.

---

## 5. Conventions (apply to every component)

These are the mechanics of § 1 — the specific rules that make the mandate
concrete. Where a convention and the mandate seem to disagree, the mandate
wins and the convention is the thing that needs fixing.

1. **One scale knob.** `--pb-unit` is the board scale unit — the switch
   housing width, default `34px`. Every other length is
   `calc(var(--pb-unit) * k)`. Changing it rescales a whole panel — parts,
   labels, padding, readout. Never hard-code a px value in a component
   stylesheet except 1 px hairlines and border widths.
   (`--pb-sw-size` is kept as an alias for `--pb-unit`.)
   That hairline exemption is the knob's one limit: it picks a size well, but
   it will not fit a board to an arbitrary box, because the hairlines stay put
   while everything around them shrinks. Fitting to a measured container is a
   `transform` instead — § 4.7.1.
2. **Tokens live in `board/tokens.css`**, scoped to the `.pb-ui` class. Every
   component root gets `pb-ui` so the tokens resolve without a global reset.
   Accents are applied by adding `pb-accent-<group>`:

   | Group | class | head | border | title |
   |---|---|---|---|---|
   | Switches | `pb-accent-switches` | `#deeffd` | `#d5e9fd` | `#1e40af` |
   | LEDs | `pb-accent-leds` | `#dbf0ee` | `#c5e5de` | `#166534` |
   | 7-segment | `pb-accent-hex` | `#dbf0ee` | `#c5e5de` | `#166534` |
   | Pushbuttons | `pb-accent-keys` | `#daeefe` | `#b8dcfc` | `#1e40af` |

   (Switches, LEDs and Pushbuttons are measured from their own reference
   renders. The 7-segment row deliberately reuses the LEDs' colours — LEDR and
   HEX are the board's outputs, so they share one frame colour, and the two
   inputs are the blues.) Panel titles name the entity port: `LEDR[9:0]`,
   `HEXn_N[6:0]`, `SW[9:0]`, `KEY_N[3:0]`.
3. **Class naming:** `pb-<block>__<element>`, state classes `is-*`. Shared
   chrome is `pb-panel*`, `pb-bank*`, `pb-readout*`, `pb-board`.
   Four tokens exist only as *optional* overrides — a panel passes one
   inline and the rule that reads it supplies the default, as in
   `var(--pb-cell-w, var(--pb-pitch))`. They are listed at the foot of
   `tokens.css` so they can be found from there:

   | Token | Set by | Instead of |
   |---|---|---|
   | `--pb-cell-w` | KEY, HEX | `--pb-pitch` |
   | `--pb-part-w` | KEY, HEX, LEDR | `--pb-unit` |
   | `--pb-index-size` | KEY, HEX | `0.52 W` |
   | `--pb-readout-tracking` | HEX | `0.17 W` |
4. **Reuse the shared layer.** A new group is a `<Panel>` containing a
   `<BitRow>` and a `<Readout>`, and four of them go in a `<Board>`; only the
   part itself is new. Do not
   re-implement the card. Where a group's geometry differs, override a token
   on the panel rather than forking the CSS — `Pushbuttons` sets
   `--pb-cell-w`, `--pb-part-w` and `--pb-index-size`, and
   `SevenSegmentDisplays` adds `--pb-readout-tracking`; neither needs a rule
   of its own in `panel.css`.
5. **Bit order.** Arrays are **LSB-first** (`bits[0]` is `SW0`) so the array
   index matches the VHDL index. Panels render MSB-first (bit 9 on the left)
   to match the board silkscreen, so the *display* order is the reverse of the
   array order. Do not "fix" this — keep the array indexable the way the
   entity port is.
6. **Inputs are interactive, outputs are not.** `Switches` and `Pushbuttons`
   are clickable by default; `Leds` and `SevenSegment` are display-only and
   need `interactive` to be clicked. An output on a real board is driven by
   the design, and the component should not pretend otherwise.
7. **Controlled + uncontrolled.** Every panel accepts `value`/`onChange` *and*
   works standalone with `defaultValue`. The simulator will drive them
   controlled; the teaching demos use them uncontrolled.
8. **Accessibility.** Interactive parts are real `<button>`s with
   `role="switch"` and `aria-checked`, so Tab/Space work with no extra code.
   Display-only parts are `role="img"` with a label that includes their state
   (`"LEDR3 on"`). The readout is an `<output aria-live="polite">`. Focus ring
   is a 2 px white halo plus 2 px `--pb-focus`.
9. **Motion.** ~130–160 ms. All transitions collapse to 1 ms under
   `prefers-reduced-motion`.
10. **No images, no SVG, no canvas.** The hardware look is pure CSS gradients
    so it stays crisp at any scale and any DPR.
11. **Outputs come from the simulator, never from the inputs.** A panel that
    shows `LEDR` or `HEX` renders whatever `value` it is handed and has no
    opinion about where that came from. In an app with a simulator attached,
    that value is what the VHDL drove. Wiring an output panel's `value` to an
    input panel's state — `<Leds value={sw} />` — is a **mock**, and it is
    only ever acceptable in a demo that says so.

### Why convention 11 is worth stating

It looks like a restatement of convention 6, and it is not. Convention 6 is
about *interaction*: an output must not be clickable. Convention 11 is about
*data flow*, and it exists because the mock's failure mode is unusually
nasty.

`<Leds value={sw} />` is indistinguishable from a working simulator for as
long as the design under test happens to be `LEDR <= SW`. Flip a switch, the
right LED lights, everything looks correct — whether or not a single byte
ever reached the simulator. A backend that is wired up wrongly, or not at
all, presents exactly as one that works. The bug is invisible until someone
runs a design where `LEDR` is *not* `SW`, by which point it is load-bearing.

So the rule is: an app with a simulator holds output state of its own, seeded
blank, written only by the simulator. If nothing is driving it, the board
stays dark — which is the truth, and which makes the first correctly-lit LED
mean something.

`ghdl_implementation_plan.md` § 0 makes cutting this mock the first phase of
that work, before any backend code, for this reason.

Convention 7 already anticipated the end state: *"The simulator will drive
them controlled."* That is the mechanism — `value` + no `onChange` on the
output panels — and nothing in the components has to change to support it.

---

## 6. Component APIs

```tsx
import { Switches, ToggleSwitch, numberToBits } from './components/Switches';
import { Leds, Led } from './components/Leds';
import { Pushbuttons, Pushbutton } from './components/Pushbuttons';

// LEDR <= SW; — a demo of the component API, and a mock. Sharing one
// vector between an input and an output panel is fine here, where the
// point is to show the props; it is convention 11's counter-example, and
// it must not be how an app with a simulator attached drives its board.
const [sw, setSw] = useState(numberToBits(0b0000110101, 10));
<Switches value={sw} onChange={setSw} />
<Leds value={sw} />

// display-only by default; click them by hand while testing
<Leds defaultValue={[1, 0, 1, 0]} count={4} interactive />

// KEY is the signal, not the press: 1111 at rest, 0 while held
const [key, setKey] = useState<BitVector>([1, 1, 1, 1]);
<Pushbuttons value={key} onChange={setKey} />

// bare parts
<ToggleSwitch label="SW0" checked={on} onChange={setOn} size={64} />
<Led on={on} color="red" size={64} label="LEDR0" />
<Pushbutton label="KEY0" pressed={down} onPressedChange={setDown} size={64} />
```

### `<Switches>`, `<Leds>`, `<Pushbuttons>` and `<SevenSegmentDisplays>`

All four take the same panel props (`SevenSegmentDisplays` has no
`onChange`/`defaultValue`/`disabled` — it is display-only):

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `count` | `number` | `10` (`4` for KEY) | Number of parts |
| `value` | `BitVector` | — | Controlled state, LSB first |
| `defaultValue` | `BitVector` | rest level | Initial state when uncontrolled |
| `onChange` | `(next, changedIndex) => void` | — | Fires on every user action |
| `name` | `string` | `"SW"` / `"LEDR"` / `"KEY"` | Title, labels and readout |
| `title` | `string` | derived | Override the header text |
| `framed` | `boolean` | `true` | Draw the card chrome |
| `showReadout` | `boolean` | `true` | Binary readout under the row |
| `showIndices` | `boolean` | `true` | Labels above the parts |
| `size` | `number \| string` | `34` | Board scale unit |
| `disabled` | `boolean` | `false` | Disable the whole group |

"Rest level" is all `0` for `Switches` and `Leds`, and all `1` for
`Pushbuttons`, because `KEY` is active low.

`<Leds>` adds:

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `color` | `'red' \| 'green' \| 'amber'` | `'red'` | Die colour |
| `interactive` | `boolean` | `false` | Let the user click LEDs |

`<Pushbuttons>` adds:

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `activeLow` | `boolean` | `true` | Held reads `0`. False → 1-when-pressed, and the note is dropped |
| `momentary` | `boolean` | `true` | Springs back on release. False → latches |
| `showHint` | `boolean` | `true` | The `(Active low – 0 when pressed)` note |

`<SevenSegmentDisplays>` differs in one important way: its `value` is
`SegmentVector[]` — **one 7-bit segment word per display, display 0 first** —
not a flat bit vector. `value[0][6]` is `HEX0[6]`. Plus:

| Prop | Type | Default | Meaning |
|---|---|---|---|
| `activeLow` | `boolean` | `true` | A `0` lights a segment |

It has no `onChange`: on a real board these are driven by the design.

### `<Board>`

```tsx
<Board>
  <Leds value={ledr} />
  <SevenSegmentDisplays value={hex} />
  <Switches value={sw} onChange={setSw} />
  <Pushbuttons value={key} onChange={setKey} />
</Board>
```

`children` in reading order, plus `size`. Nothing else — it is a grid. It does
not fit itself to its container: `size` picks the geometry, and a caller that
needs the board to track a resizable box scales it from outside (§ 4.7.1).

### Parts

- `<ToggleSwitch>` — `checked` · `defaultChecked` · `onChange(checked)` ·
  `label` · `size` · `flip` · `disabled`, plus any `<button>` attribute.
- `<Led>` — `on` · `color` · `label` · `size` · `interactive` ·
  `onToggle(next)` · `disabled`.
- `<Pushbutton>` — `pressed` · `onPressedChange(pressed)` · `momentary` ·
  `label` · `size` · `disabled`, plus any `<button>` attribute. `pressed` is
  always controlled; the panel owns the vector.
- `<SevenSegmentDisplay>` — `segments` (7 bits, LSB first) · `activeLow` ·
  `label` · `size`.

### Helpers (from `components/board`, re-exported by every group)

`bitsToString` · `bitsToNumber` · `numberToBits` · `zeroBits` · `fillBits` ·
`coerceBits`

### Segment helpers (from `components/SevenSegment`)

`nibbleToSegments(n)` is the course's `hex7seg` function; `numberToDisplays`
splits a value into nibbles, one per display. `patternToSegments` and
`segmentsToPattern` convert to and from the `"gfedcba"` strings the VHDL
writes, and `segmentsToHexByte` produces the two hex digits the readout
prints. `SEGMENT_PATTERNS` is the table itself.

---

## 7. Workflow for the remaining components

1. Measure the reference PNG first — sample actual pixel values for colours,
   edges and gradient stops. Guessing produces something that *reads* as a
   generic web widget.
2. Express every dimension as a ratio of `W` (29 reference px) and add it to
   § 4.
3. Build the part; wrap it in `<Panel>` + `<BitRow>` + `<Readout>` from
   `components/board`. Add its tokens to `board/tokens.css`.
4. Verify before calling it done:

   ```
   npm run build
   npx vite preview --port 4173
   npm run shot -- .pb-leds out.png
   ```

   Then put `out.png` next to the reference PNG at the same width and compare.
   Check every state — for LEDs that means lit and unlit, for HEX every
   segment pattern.
5. Update § 2 and § 4 in this file, and the component's section plus the
   roadmap in `README.md`. Keep the split: this file is how the components are
   built and why; `README.md` is how to use them.

### Known deviations from the reference (deliberate)

- Default `--pb-unit` is `34px`, not the reference's `29px` — the labels and
  readout are noticeably crisper and the switches are easier to hit. Set
  `size={29}` for a 1:1 match.
- Card padding is symmetric (`0.62 W` both sides); the reference render has
  18 px left / 6 px right, which looks like an artefact rather than intent.
- The switch housing has a slightly stronger hover/focus treatment than the
  static reference, since this one is actually clickable.
- `Switches_v2.png` sets its ten switches at a 1.175 W pitch; ours keeps the
  shared 1.362 W so `SW`*n* still lines up with `LEDR`*n* (§ 4.8). The switch
  itself is drawn to the new render's ratios; only the spacing between them
  comes from the board.
- That render's labels and readout are a lighter blue (`#1f5fa8`) than the
  board's navy `--pb-label`. Left alone: that token is shared by all four
  panels, and recolouring one from a render of another is how a design system
  drifts. One token changes it if the whole board should follow.
- LED **width** follows `LEDs.png` (24 px) but LED **pitch** follows
  `Component_grouping.png` (1.362 W, same as the switches) so the columns line
  up between panels. `LEDs.png` on its own uses a tighter 1.172 W pitch, which
  would put LEDR*n* out of line with SW*n*.
- The LED row is centred in the shared part band, where the reference sits it
  about 8 reference px higher. Centring keeps every panel the same height with
  no per-group tuning.
- The same band makes the `KEY` card about 35 reference px taller than
  `PushButtons.png`, which lays its four buttons out without reserving room
  for a switch. The extra space falls under the buttons. Kept, because § 4.8
  is what lets the four cards tile without hand-tuning; a board grid with
  `align-items: stretch` equalises the rows anyway.
- The reference HEX card puts ~12 reference px of padding at each side; ours
  uses the shared `0.62 W` like every other panel, so it comes out slightly
  wider. Same trade as the other three.
- The HEX package is the light `--pb-part-face` of the pushbutton housings,
  where `7SegmentDisplays.png` draws it a mid grey-blue, and unlit segments
  are near white rather than the reference's `#97a2b0`. The reference render
  shows every segment lit at once in pale grey, which only works as a picture
  while nothing is dark; with a real red digit on it, the panel has to read as
  the same moulded plastic as the rest of the board.
- Lit HEX segments are flat red, where `7SegmentDisplays.png` draws them pale
  grey.
  The render is a stylised mock-up that shows every segment lit at once; the
  part on the desk is red, and § 1.2 rule 1 says the reference settles what
  can be measured, not what it never showed.
- `KEY` and `HEX` columns use their own pitch (`2.517 W` and `2.069 W`, both
  measured) rather than the shared `1.362 W`. Four buttons cannot line up with ten switches, so there is
  nothing to line up *with* — and the buttons are wider than the shared pitch
  regardless.

---

## 8. Open questions

- Should `SW` / `LEDR` also show hex/decimal next to the binary readout?
  The board only shows binary, but students constantly convert by hand.
- Should `Switches` gain the same `activeLow` escape hatch `Pushbuttons` has,
  or does active-low stay a `KEY`-only idea? Nothing needs it yet.
- Should a lit LED have any animation (a short ramp, or a flicker at high
  toggle rates)? Right now it is a 140 ms cross-fade, which reads well at
  human speeds but will smear if a simulation drives it fast. **No longer
  hypothetical** — a real simulation (`ghdl_implementation_plan.md`) now
  pushes board snapshots roughly every poll interval (§ 5.4.1), and a
  design that toggles an LED faster than the cross-fade will render as a
  dim smear rather than as blinking. Measure it against a real
  fast-toggling design before changing the value; the answer may be that
  the cross-fade shortens only above some update rate.
- Does a board output need a third, **undefined** state? GHDL reports
  `'U'`/`'X'`/`'Z'` for a signal before reset settles or for an output no
  design drives, but `Bit` is strictly `0 | 1`, so today those can only be
  shown as "off". The reference implementation this project draws on renders
  them pink. Adding it means a tri-state `Bit` through every panel's props
  plus a new documented visual in § 4 — real work, and worth doing only if
  students turn out to be confused by a dark board that is actually
  undriven. `ghdl_implementation_plan.md` § 8.4 ships the simpler coercion
  first, deliberately.
- Should `Pushbuttons` model contact bounce? A real `KEY` bounces for a few
  ms, which is exactly the thing a debounce exercise is about — but a mock
  that bounces by default would make every other demo flaky. If it is wanted,
  it belongs behind an explicit `bounceMs` prop, off by default.

---

## 9. Product features

What HDLBoard does, at the level the README used to spell out. The
component work in §§ 1–7 is one half of it; this is the other.

- **File explorer** — a `vhdl/` / `work/` project tree with upload (a
  picker, or drag-and-drop `.vhd`/`.vhdl` files onto the panel), new-file,
  rename and delete (the last two on hover, or double-click a name to
  rename).
- **Resizable panes** — drag the handles either side of the editor to
  resize the file panel and the board panel; both stay within the window,
  shrinking together (or giving way to whichever one is being dragged)
  rather than overflowing it.
- **Tabbed code editor** — closable tabs, line numbers and VHDL syntax
  highlighting (keywords, types, comments, strings, numbers), built on a
  real, editable `<textarea>`, not a static preview.
- **Simulation controls** — Start/Stop drives a real `ghdl -a` / `-e` /
  `-r` compile → elaborate → run sequence, with GHDL's own output (or error
  text, file:line included) in the console panel.
- **Live DE1-SoC board** — `SW[9:0]` and `KEY_N[3:0]` are genuinely
  clickable inputs; `LEDR[9:0]` and `HEX0_N`…`HEX5_N` are driven by GHDL
  actually simulating the VHDL, not mirrored from the switches (wire
  protocol: `ghdl_implementation_plan.md` § 6).
- **`report` / `assert` output** — printed to the console live, in either a
  board design or a plain, portless testbench (select it as the top file —
  the dot in the Files panel — and it runs directly at GHDL's normal speed,
  finishing on its own).
- **Component gallery** — every board part in every state, beside the
  reference renders, at the `#gallery` route.
- **Windows desktop build** — a one-file installer that bundles the
  frontend, the backend and GHDL (`winInstaller/README.md`). The desktop app
  serves the same frontend to itself on `127.0.0.1:9010`; nothing is
  reimplemented and nothing is exposed to the network.
- **LAN access** — in the browser build both servers bind to `0.0.0.0`, and
  the backend host is resolved relative to the hostname the page was loaded
  from, so another device on the network can use the host's IP with no
  configuration change.

One backend process runs **one GHDL process continuously** for the whole
session rather than restarting it per switch flip, polling for switch/button
changes and pushing `LEDR`/`HEX` back over a WebSocket
(`ghdl_implementation_plan.md` § 5). Simulated time is held to real time, on
Windows too (there via the simulation's standard input instead of a POSIX
FIFO), so a design's timing in the simulator predicts its timing on the real
board — `blinkTest.vhdl` blinks at 2 Hz in both.

## 10. Known limitations

- **No file system on disk.** Uploaded files and edits are held in memory on
  both ends; nothing is written beyond a per-session temp directory on the
  backend, deleted when the tab closes.
- **No persistence.** Reloading resets everything to the starter project; a
  closed tab ends the simulation session.
- **A clock-rate limit for board designs, not a bug.** A design that divides
  a real 50 MHz clock down the honest way (e.g. to blink an LED once a
  second) needs millions of simulated cycles for one visible change.
  Interactive mode is fast for combinational and small sequential designs
  and currently impractical for a literal hardware-accurate clock divider
  (`ghdl_implementation_plan.md` § 5.5). Two things are not affected:
  - a plain, portless testbench, which runs at GHDL's normal speed;
  - a design that declares the optional `CLOCK_500Hz` port instead of
    dividing `CLOCK_50` itself — the testbench hardwires it to an
    already-divided, always-running 500 Hz clock (§ 5.7). It is a
    simulator convenience, not a real DE1-SoC pin, so it must come back out
    before the design targets real hardware. It runs in genuine real time,
    not fast-forwarded: a divider meant to blink an LED once a minute really
    takes about a minute (§ 5.9).
- Further detail: `src/components/workbench/README.md`, *Known limitations*.

## 11. Repository layout (current)

§ 3 above predates the backend and the Windows build; this is the current
top level. Component folders under `src/components/` are as in § 3.

```
HDLBoard/
├─ README.md                    what it is, and how to install it
├─ BUILDING.md                  compiling and running from source
├─ Design_Description.md        ← this file: how the components are BUILT
├─ ghdl_implementation_plan.md  the GHDL backend: protocol, design, build log
├─ start.sh / stop.sh           run both servers as a pair
├─ index.html, package.json, tsconfig*.json, vite.config.ts
├─ tools/
│  ├─ screenshot.mjs            visual-check helper (Playwright)
│  └─ bundle.mjs                inline a build into one self-contained .html
├─ server/                      the GHDL backend — its own Node.js project
│  └─ src/                      protocol, session, GHDL process management
├─ winInstaller/                the Windows desktop build (additive)
│  ├─ build.ps1                 builds the installer end to end
│  ├─ fetch-ghdl.ps1            downloads + checksums the vendored GHDL
│  └─ electron/                 Electron shell, its own standalone project
└─ src/
   ├─ main.tsx, index.css
   ├─ App.tsx                   Workbench, or the gallery at #gallery
   ├─ ComponentGallery.tsx      every component/state, for visual checks
   └─ components/               board/, Switches/, Leds/, Pushbuttons/,
                                SevenSegment/, workbench/
```
