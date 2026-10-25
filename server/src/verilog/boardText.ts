// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The parts of the Verilog board testbench that follow the board
 * (docs/board_io_v2_spec.md § 7.3, § 7.4): declarations, connections, off values, the
 * clock delay, the `STIM` slices, the `STATE` concatenation and the multiplexed-display
 * decoder. With `DEFAULT_BOARD_IO` each part is exactly the text it was before boards
 * had shapes, so the golden wrappers do not change. Pure.
 */

import { SEGMENT_COUNT } from '../engines/boardLimits.js';
import type { BoardBinding, BoardIo, MultiplexedDisplays, SevenSegment } from '../engines/boardPorts.js';
import { buttonCount, displayWordWidth, stateLength, stimFields, stimLength } from '../engines/boardShape.js';
import { clockHalfPeriodPs, DISPLAY_PERSIST_MS, verilogDelay } from '../engines/boardTiming.js';

const NS_PER_MS = 1_000_000;
const HEX_RADIX = 16;

/** `10'b0`. */
const zeros = (width: number): string => `${width}'b0`;
/** `4'hF`, `7'h7F`: every bit set. */
const ones = (width: number): string => `${width}'h${(2 ** width - 1).toString(HEX_RADIX).toUpperCase()}`;
/** A part's off (or released) value: all ones when active low; `1'b1` or `1'b0` for one bit. */
function offValue(width: number, activeLow: boolean): string {
  if (width === 1) return activeLow ? "1'b1" : "1'b0";
  return activeLow ? ones(width) : zeros(width);
}

const KIND_COLUMN = 5;
const RANGE_COLUMN = 7;
const NAME_COLUMN = 10;

/** `  reg  [9:0]  `: the kind and range columns the wrapper always had. */
function declarationHead(kind: 'reg' | 'wire', width: number): string {
  const range = width === 1 ? '' : `[${width - 1}:0]`;
  return `  ${kind.padEnd(KIND_COLUMN)}${range.padEnd(RANGE_COLUMN)}`;
}

/** `  reg  [9:0]  sw_sig     = 10'b0;`: a testbench input, at its rest value. */
const regDeclaration = (width: number, name: string, init: string): string => `${declarationHead('reg', width)}${name.padEnd(NAME_COLUMN)} = ${init};`;

/** `  wire [9:0]  ledr_sig;`: what the design drives. */
const wireDeclaration = (width: number, names: string): string => `${declarationHead('wire', width)}${names};`;

function displayDeclarations(displays: SevenSegment, wordWidth: number): string[] {
  if (displays.kind === 'independent') {
    return [wireDeclaration(displays.width, displays.ports.map((_, index) => `hex${index}_sig`).join(', '))];
  }
  const point = displays.decimalPoint === undefined ? [] : [wireDeclaration(1, 'dp_sig')];
  return [
    wireDeclaration(SEGMENT_COUNT, 'seg_sig'),
    ...point,
    wireDeclaration(displays.digits, 'an_sig'),
    ...decoderDeclarations(displays, wordWidth),
  ];
}

/** The module header and every testbench-side board signal, inputs at their rest level. */
export function declarations(board: BoardIo, moduleName: string): string {
  const { switches, pushbuttons, resetButton, leds } = board;
  const reset = resetButton === undefined ? [] : [regDeclaration(1, 'rstbtn_sig', offValue(1, resetButton.activeLow))];
  return [
    `module ${moduleName};`,
    regDeclaration(1, 'clk_sig', "1'b0"),
    regDeclaration(1, 'clk500_sig', "1'b0"),
    regDeclaration(switches.count, 'sw_sig', zeros(switches.count)),
    regDeclaration(buttonCount(board), 'key_sig', offValue(buttonCount(board), pushbuttons.activeLow)),
    ...reset,
    wireDeclaration(leds.count, 'ledr_sig'),
    ...displayDeclarations(board.sevenSegment, displayWordWidth(board)),
  ].join('\n');
}

/** The actual of a connection: `key_sig`, or `key_sig[0]` for a scalar port. */
export function verilogActual({ signal, index }: BoardBinding): string {
  return index === undefined ? signal : `${signal}[${index}]`;
}

/** What a board output reads as when the design lacks it: its off value. None for an input. */
export function outputOffValue(binding: BoardBinding, board: BoardIo): string | undefined {
  if (binding.direction === 'in') return undefined;
  const displays = board.sevenSegment;
  if (binding.role === 'leds') return zeros(board.leds.count);
  if (binding.role === 'digitEnables' && displays.kind === 'multiplexed') return offValue(displays.digits, displays.digitEnablesActiveLow);
  if (binding.role === 'segments') return offValue(SEGMENT_COUNT, displays.activeLow);
  const width = displays.kind === 'independent' && binding.role.startsWith('sevenSegment') ? displays.width : 1;
  return offValue(width, displays.activeLow);
}

/** `  always #10 clk_sig = ~clk_sig;`: the board clock, from its frequency. */
export function boardClockProcess(board: BoardIo): string {
  return `  always #${verilogDelay(clockHalfPeriodPs(board.clock.mhz))} clk_sig = ~clk_sig;`;
}

/** `sw_sig = rec[13:4];` and so on: one `STIM` record into the input signals, field by field (D5). */
export function stimSlices(board: BoardIo): string {
  let high = stimLength(board) - 1;
  return stimFields(board)
    .map(({ signal, width }) => {
      const slice = width === 1 ? `rec[${high}]` : `rec[${high}:${high - width + 1}]`;
      high -= width;
      return `              ${signal} = ${slice};`;
    })
    .join('\n');
}

/** `wire [51:0] board_bits = {ledr_sig, hex0_sig, …};`, or a reg the poll assembles for a multiplexed display. */
export function boardBitsDeclaration(board: BoardIo): string {
  const state = stateLength(board);
  const displays = board.sevenSegment;
  if (displays.kind === 'multiplexed') return `  reg [${state - 1}:0] board_bits;`;
  const terms = ['ledr_sig', ...displays.ports.map((_, index) => `hex${index}_sig`)];
  return `  wire [${state - 1}:0] board_bits = {${terms.join(', ')}};`;
}

/** For a multiplexed display, the poll's assembly of `board_bits`; nothing for independent displays. */
export function boardBitsUpdate(board: BoardIo): string {
  const displays = board.sevenSegment;
  if (displays.kind !== 'multiplexed') return '';
  const words = Array.from({ length: displays.digits }, (_, index) => `display_word(${index})`);
  return `      board_bits = {ledr_sig, ${words.join(', ')}};\n`;
}

// --- The multiplexed-display decoder (§ 7.4) ---------------------------------------

/** `{dp_sig, seg_sig}`, or `seg_sig` alone without a decimal point. */
const liveWord = (displays: MultiplexedDisplays): string => (displays.decimalPoint === undefined ? 'seg_sig' : '{dp_sig, seg_sig}');

function decoderDeclarations(displays: MultiplexedDisplays, width: number): string[] {
  const last = displays.digits - 1;
  return [
    '',
    '  // A multiplexed display, decoded into stable digits (docs/board_io_v2_spec.md § 7.4):',
    '  // each digit keeps the segments it showed while enabled, for DISPLAY_PERSIST.',
    `  localparam [63:0] DISPLAY_PERSIST = 64'd${DISPLAY_PERSIST_MS * NS_PER_MS};`,
    `  localparam AN_ON = 1'b${displays.digitEnablesActiveLow ? 0 : 1};`,
    `  localparam SEG_OFF = 1'b${displays.activeLow ? 1 : 0};`,
    `  reg [${width - 1}:0] digit_word [0:${last}];`,
    `  reg [63:0] digit_last [0:${last}];`,
    `  reg [${last}:0] digit_seen = 0;`,
  ];
}

/** The decoder: a capture of each enabled digit, and the word each display shows now. */
export function decoderSection(board: BoardIo): string {
  const displays = board.sevenSegment;
  if (displays.kind !== 'multiplexed') return '';
  const width = displayWordWidth(board);
  const sensitivity = displays.decimalPoint === undefined ? 'seg_sig or an_sig' : 'seg_sig or dp_sig or an_sig';
  return `  integer capture_digit;
  reg [${displays.digits - 1}:0] digit_on = 0;
  always @(${sensitivity})
    for (capture_digit = 0; capture_digit < ${displays.digits}; capture_digit = capture_digit + 1)
      if (an_sig[capture_digit] === AN_ON) begin
        digit_word[capture_digit] = ${liveWord(displays)};
        digit_last[capture_digit] = $time;
        digit_seen[capture_digit] = 1'b1;
        digit_on[capture_digit] = 1'b1;
      end else if (digit_on[capture_digit]) begin
        // Switched off: the hold of DISPLAY_PERSIST starts now.
        digit_last[capture_digit] = $time;
        digit_on[capture_digit] = 1'b0;
      end

  // Enabled: the live segments. Unknown enable: X. Refreshed lately: the latched word. Else off.
  function [${width - 1}:0] display_word(input integer d);
    begin
      if (an_sig[d] === AN_ON) display_word = ${liveWord(displays)};
      else if (an_sig[d] !== ~AN_ON) display_word = {${width}{1'bx}};
      else if (digit_seen[d] && $time - digit_last[d] <= DISPLAY_PERSIST) display_word = digit_word[d];
      else display_word = {${width}{SEG_OFF}};
    end
  endfunction`;
}
