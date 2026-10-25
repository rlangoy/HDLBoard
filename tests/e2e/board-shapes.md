<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# Manual check: board shapes (docs/board_io_v2_spec.md § 12.3)

Run the dev server and the backend (with `IVERILOG_DIR` set for Verilog).

1. Select each board in Settings › Board. The Board pane shows its parts and fits the pane: Default and DE1-SoC
   10/4/10/6; DE10-Lite 2 keys and 8-bit displays; Basys 3 16 switches, a button cross, 16 LEDs, 4 digits;
   Nexys A7 the same plus `CPU_RESETN` beside the cross and 8 digits. Basys 3 and Nexys A7 show their resource
   links under the description; Default shows none.
2. On Basys 3, open Examples: a notice replaces the cards. Press **New starter file**, set it as top, run it,
   flip `sw15`: `led15` lights.
3. Run a 4-digit refresh counter on Basys 3 driven from `CLOCK_500Hz`: four stable digits.
4. Change Default → Nexys A7 with the bundled example open: the dialog lists the clock rename and the hand edits,
   with the board's resource links.
5. On Basys 3, run a VHDL design that declares `SW : in std_logic_vector(9 downto 0)`: the console says the width
   is wrong and what to declare, naming Basys 3.
