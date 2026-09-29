// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Real simulator output, copied from docs/editor_diagnostics_implementation_plan.md
 * Appendix A. Keep leading spaces and the order of the lines: the recognizers
 * are tested against exactly this text.
 */

const join = (lines: readonly string[]): string => lines.join('\n');

// ---------------------------------------------------------------- A.1 ghdl -a

/** GHDL 4.1.0, `ghdl -a --std=08 syntax.vhdl` (A.1). */
export const GHDL_SYNTAX_ERROR = join([
  "syntax.vhdl:13:15:error: ';' expected at end of signal assignment",
  '    LEDR <= SW',
  '              ^',
  "syntax.vhdl:13:15:error: (found: 'end')",
]);

/** GHDL 4.1.0, `ghdl -a --std=08 undeclared.vhdl` (A.1). */
export const GHDL_UNDECLARED = join([
  'undeclared.vhdl:13:13:error: no declaration for "swx"',
  '    LEDR <= SWX;',
  '            ^',
  "undeclared.vhdl:14:16:error: can't match character literal '2' with type STD_ULOGIC",
  "    LEDR(0) <= '2';",
  '               ^',
]);

/** GHDL 4.1.0, `ghdl -a --std=08 typeerr.vhdl` (A.1). */
export const GHDL_TYPEERR = join([
  'typeerr.vhdl:14:13:error: can\'t match "count" with type array type "STD_ULOGIC_VECTOR"',
  '    LEDR <= count;',
  '            ^',
  "typeerr.vhdl:15:25:warning: value constraints don't match target ones [-Wruntime-error]",
  '    LEDR(3 downto 0) <= SW;',
  '                        ^',
]);

/** GHDL 4.1.0, `ghdl -a --std=08 "space name.vhdl"` (A.1). */
export const GHDL_SPACE_NAME = join([
  'space name.vhdl:1:28:error: missing ";" at end of entity',
  'entity spaced is end entity',
  '                           ^',
]);

// ---------------------------------------------------------------- A.2 ghdl -e

/** GHDL 4.1.0, `ghdl -e --std=08 comp` (A.2). */
export const GHDL_ELABORATION = join([
  'comp.vhdl:9:5:warning: instance "u0" of component "missing_thing" is not bound [-Wbinding]',
  '    u0 : missing_thing port map ( a => SW(0) );',
  '    ^',
  'comp.vhdl:6:14:warning: (in default configuration of comp(rtl))',
]);

/** GHDL 4.1.0, `ghdl -e --std=08 nosuch` (A.2): no location. */
export const GHDL_ELABORATION_NO_UNIT = '/usr/bin/ghdl-mcode:error: cannot find entity or configuration nosuch';

// ---------------------------------------------------------------- A.3 ghdl -r

/** GHDL 4.1.0, `ghdl -r --std=08 tb` (A.3), stdout. */
export const GHDL_RUNTIME_REPORTS = join([
  'tb.vhdl:6:9:@0ms:(report note): hello from tb',
  'tb.vhdl:7:9:@0ms:(assertion warning): warning level',
  'tb.vhdl:8:9:@0ms:(assertion error): values differ',
  'tb.vhdl:9:9:@0ms:(assertion failure): fatal stop',
  'ghdl:error: assertion failed',
  'ghdl:error: simulation failed',
]);

/** GHDL 4.1.0, `ghdl -r --std=08 bound` (A.3): a runtime check failure. */
export const GHDL_RUNTIME_BOUND = join([
  'ghdl:error: index (5) out of bounds (0 to 3) at bound.vhdl:9',
  'ghdl:error: simulation failed',
]);

// ------------------------------------------------------------------- A.4 wrapper

/** GHDL 4.1.0, the generated `hdl_board_tb.vhdl` failing to fit the entity (A.4). */
export const GHDL_WRAPPER_MISMATCH = join([
  "hdl_board_tb.vhdl:55:15:error: actual constraints don't match formal ones",
  '      ledr => ledr_sig',
  '              ^',
]);

// ------------------------------------------------------------- A.5 iverilog

/** Icarus Verilog 12.0, `iverilog … syntax.v` (A.5). */
export const ICARUS_SYNTAX = join(['syntax.v:6: syntax error', 'I give up.']);

/** Icarus Verilog 12.0, `iverilog … undeclared.v` (A.5). */
export const ICARUS_UNDECLARED = join([
  "undeclared.v:5: error: Unable to bind wire/reg/memory `SWX' in `undeclared'",
  'undeclared.v:5: error: Unable to elaborate r-value: SWX',
  "undeclared.v:6: error: Unable to bind wire/reg/memory `foo' in `undeclared'",
  "undeclared.v:6: error: Unable to bind wire/reg/memory `bar' in `undeclared'",
  'undeclared.v:6: error: Unable to elaborate r-value: (foo)&(bar)',
  '5 error(s) during elaboration.',
]);

/** Icarus Verilog 12.0, `iverilog … regassign.v` (A.5). */
export const ICARUS_REGASSIGN = join([
  'regassign.v:5: error: LEDR is not a valid l-value in regassign.',
  'regassign.v:3:      : LEDR is declared here as wire.',
  'Elaboration failed',
]);

/** Icarus Verilog 12.0, `iverilog … inc.v` (A.5): a header with a syntax error. */
export const ICARUS_INCLUDE_SYNTAX = join([
  'inc.v:3: warning: macro WIDTHX undefined (and assumed null) at this point.',
  './defs.vh:2: syntax error',
  'I give up.',
]);

/** Icarus Verilog 12.0, `iverilog … "sp ace.v"` (A.5). */
export const ICARUS_SPACE_NAME = join(['sp ace.v:1: syntax error', 'sp ace.v:1: error: Syntax error in continuous assignment']);

/** Icarus Verilog 12.0, `iverilog … sorry.v` (A.5). */
export const ICARUS_SORRY = join(["sorry.v:5: error: 'disable fork' requires SystemVerilog.", '1 error(s) during elaboration.']);

/** Icarus Verilog 12.0, `iverilog … unk.v` (A.5). */
export const ICARUS_UNKNOWN_MODULE = join([
  'unk.v:2: error: Unknown module type: missing_mod',
  '2 error(s) during elaboration.',
  '*** These modules were missing:',
  '        missing_mod referenced 1 times.',
  '***',
]);

/** Icarus Verilog 12.0, `iverilog … miss.v` (A.5): reported one line after the `include. */
export const ICARUS_MISSING_INCLUDE = join([
  'miss.v:2: Include file nope.vh not found',
  'error: Unable to find the root module "miss" in the Verilog source.',
  "     : Perhaps ``-s miss'' is incorrect?",
  '1 error(s) during elaboration.',
]);

/** Icarus Verilog 12.0, `iverilog -Wall … warn.v` (A.5): a compile that succeeds. */
export const ICARUS_WARNING = "warn.v:6: warning: implicit definition of wire 'nothere'.";

// ------------------------------------------------------------------ A.6 vvp

/** Icarus Verilog 12.0, `vvp -n -i sim.vvp` for tb.v and tb2.v (A.6), stdout. */
export const VVP_RUNTIME = join([
  'hello from tb',
  'WARNING: tb.v:5: careful: 3',
  '         Time: 0  Scope: tb',
  'ERROR: tb.v:6: values differ',
  '       Time: 0  Scope: tb',
  'r is xxxx',
  'FATAL: tb.v:9: fatal stop',
  '       Time: 0  Scope: tb',
  'start',
  'tb2.v:4: $finish called at 0 (1ps)',
  'ERROR: tb2.v:8: $readmemh: Unable to open nofile.hex for reading.',
]);

// ------------------------------------------------ A.7 starter designs, one `;` removed

/** Icarus Verilog 12.0, `DE1_SoC.v` with the `;` of line 19 removed (A.7). */
export const ICARUS_DE1_MISSING_SEMICOLON = join([
  'DE1_SoC.v:23: syntax error',
  'DE1_SoC.v:19: error: Syntax error in left side of continuous assignment.',
]);

/** GHDL 4.1.0, `DE1_SoC.vhdl` with the `;` of line 27 removed (A.7). */
export const GHDL_DE1_MISSING_SEMICOLON = join([
  "DE1_SoC.vhdl:27:15:error: ';' expected at end of signal assignment",
  '    LEDR <= SW',
  '              ^',
  'DE1_SoC.vhdl:27:15:error: (found: an identifier)',
]);

/** Icarus Verilog 12.0, `inc3.v` with the missing `include on line 3 (A.7). */
export const ICARUS_INCLUDE_LATER_LINE = join(['inc3.v:4: Include file nope.vh not found', 'inc3.v:3: syntax error']);
