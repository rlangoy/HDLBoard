<!-- SPDX-License-Identifier: GPL-2.0-only -->
<!-- Copyright (C) 2026 Rune Langøy -->

# Verilog syntax colouring — manual check

Run after changing `verilogHighlight.ts`, `highlight.ts` or the `wb-tok-*` colours.

## Prerequisites

- `npm run build`, then `npx vite preview --port 4173`; open `http://localhost:4173/`.

## Steps

1. The `DE1_SoC.vhdl` tab: VHDL keywords blue, `--` comments green italic. (Must look the same as before the Verilog work.)
2. Click `DE1_SoC.v`: `module`, `input`, `assign`, `endmodule` blue bold; `wire` teal; `7'b1111111` one purple piece; `//` comments green italic.
3. Open `blinkTest.v`: `$clog2` in sky blue; `` `timescale `` (if present) in rose; `4'b0000`-style numbers purple.
4. In `DE1_SoC.v` press Ctrl+Home and type `/* `: every line below turns green italic. Backspace three times: colours return.
5. Rename `DE1_SoC.v` to `DE1_SoC.vhd` (double-click the name): it moves to the VHDL folder and is coloured as VHDL; rename back: Verilog colours return.
6. Back to the `.vhdl` tab: unchanged from step 1.
