// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The generated Verilog testbench that wraps a student's board design
 * (docs/Verilog_implementation_plan.md § 5.6, Appendix A) — the Verilog counterpart of
 * `tbTemplate.ts`. It speaks the same file protocol as the VHDL one, so everything
 * downstream (the stimulus queue, `STATE` polling, real-time pacing) is shared.
 *
 * Pure: it only builds text. The Verilog below is data, in named sections; what
 * follows the board — widths, rest and off values, the clock, the `STIM`/`STATE`
 * layout, a multiplexed display's decoder — comes from `boardText.ts`
 * (docs/board_io_v2_spec.md § 7.3).
 */

import { boardBindings, type BoardIo } from '../engines/boardPorts.js';
import { stateLength, stimLength } from '../engines/boardShape.js';
import {
  boardBitsDeclaration,
  boardBitsUpdate,
  boardClockProcess,
  declarations,
  decoderSection,
  outputOffValue,
  stimSlices,
  verilogActual,
} from './boardText.js';

/** `lower-case board name -> the spelling the design declared`, from `boardPortSpellings`. */
type Spellings = ReadonlyMap<string, string>;

/**
 * The instance of the student's top module, connecting each board port it declares
 * by the spelling it declared (`.Clock_50(clk_sig)`, `.btnC(key_sig[0])`), because
 * Verilog names are case-sensitive.
 */
export function instantiation(top: string, spellings: Spellings, board: BoardIo): string {
  const connections = boardBindings(board).flatMap((binding) => {
    const declared = spellings.get(binding.key);
    return declared === undefined ? [] : [`.${declared}(${verilogActual(binding)})`];
  });
  return `  ${top} uut (${connections.join(', ')});`;
}

/**
 * Assignments that hold every board *output* the design does not declare at its off
 * value, so an unconnected LED or display reads as blank rather than undefined
 * (the Verilog equivalent of `tbTemplate.ts`'s signal defaults).
 */
export function tieOffs(spellings: Spellings, board: BoardIo): string[] {
  return boardBindings(board).flatMap((binding) => {
    const offValue = outputOffValue(binding, board);
    return offValue !== undefined && !spellings.has(binding.key) ? [`assign ${verilogActual(binding)} = ${offValue};`] : [];
  });
}

// --- The fixed sections of the testbench ------------------------------------

/**
 * Its own timescale, so the wrapper does not depend on which file was compiled before
 * it (a file with no directive inherits the previous file's, or runs at 1 s — M17).
 */
const TIMESCALE = '`timescale 1ns/1ps';

/** The wrapper's module name: what `iverilog -s` elaborates in a board run. */
export const TESTBENCH_MODULE_NAME = 'hdl_board_tb';

const TIE_OFF_COMMENT = '  // Board outputs this design does not declare read as "off" (displays are active low).';

/** 2 ms period, 500 Hz: a 1 ms half-period is 1 000 000 ns. Always present — see § 5.2. */
const CLOCK_500HZ_PROCESS = '  always #1000000 clk500_sig = ~clk500_sig;';

/** Settings arrive as +name=value on the vvp command line: no recompile per run. */
const RUNTIME_SETTINGS = `  reg [1023:0] input_file, output_file, heartbeat_file;
  integer poll_interval_ns, min_dwell_ns;
  initial begin
    if (!$value$plusargs("input_file=%s", input_file)) input_file = 0;
    if (!$value$plusargs("output_file=%s", output_file)) output_file = 0;
    if (!$value$plusargs("heartbeat_file=%s", heartbeat_file)) heartbeat_file = 0;
    if (!$value$plusargs("poll_interval_ns=%d", poll_interval_ns)) poll_interval_ns = 1000;
    if (!$value$plusargs("min_dwell_ns=%d", min_dwell_ns)) min_dwell_ns = 0;
  end`;

/**
 * Real-time pacing (M5): every 20 ms of simulated time this reports its progress and
 * blocks on one line from standard input — 32'h8000_0000 is Verilog's stdin. The
 * backend writes one line per 20 ms of real time, so a late backend can only ever slow
 * the simulation down, never let it run ahead.
 */
const PACING = `  // Real-time pacing: after every 20 ms of simulated time, report progress and
  // block on one stdin line (32'h8000_0000).
  integer fhb, pace_status;
  reg [255:0] pace_line;
  initial begin
    #1;
    forever begin
      #20000000;
      if (heartbeat_file != 0) begin
        fhb = $fopen(heartbeat_file, "w");
        $fdisplay(fhb, "%0d", $time / 1000000);
        $fclose(fhb);
      end
      pace_status = $fgets(pace_line, 32'h8000_0000);
    end
  end`;

/**
 * The same file protocol as the VHDL testbench: apply at most one queued
 * "<seq> <STIM bits>" line per poll (and not before the previous one has held for
 * min_dwell_ns), and publish "<STATE bits> <last applied seq>" whenever either changes.
 * A line may end in a hold time, "<seq> <bits> <hold_ns>": a bouncing button's step,
 * held exactly that long (shorter than min_dwell_ns if it says so) before the next.
 * Each line is read whole, so a line without a hold cannot borrow the next line's seq.
 */
/** Opens the input queue and applies its oldest new line, if the last one has held long enough. */
function applyInput(board: BoardIo): string {
  return `      if (input_file != 0 && ($time - applied_at) >= dwell_ns) begin
        fin = $fopen(input_file, "r");
        if (fin != 0) begin
          applied_one = 0;
          while (!applied_one && $fgets(in_line, fin) != 0) begin
            hold_ns = 0;
            scan_count = $sscanf(in_line, "%d %b %d", seq, rec, hold_ns);
            if (scan_count >= 2 && seq > applied_seq) begin
${stimSlices(board)}
              applied_seq = seq;
              applied_at = $time;
              applied_one = 1;
              if (hold_ns > 0) begin
                dwell_ns = hold_ns;
                wait_ns = hold_ns;
              end else begin
                dwell_ns = min_dwell_ns;
              end
            end
          end
          $fclose(fin);
        end
      end`;
}

function boardIo(board: BoardIo): string {
  const stim = stimLength(board);
  const state = stateLength(board);
  return `  // Board I/O: apply at most one queued input line per poll, publish the
  // ${state}-bit board state whenever it (or the applied sequence number) changes.
${boardBitsDeclaration(board)}
  integer fin, fout, scan_count, seq, applied_seq = 0, last_seq = -1;
  integer hold_ns, dwell_ns, wait_ns;
  reg [${stim - 1}:0] rec;
  reg [8*80-1:0] in_line;
  reg [${state - 1}:0] last_bits = ${state}'bx;
  time applied_at = 0;
  reg applied_one;
  initial begin
    #1;
    dwell_ns = min_dwell_ns;
    wait_ns = poll_interval_ns;
    forever begin
      #(wait_ns * 1);
      wait_ns = poll_interval_ns;
${applyInput(board)}
${boardBitsUpdate(board)}      if (output_file != 0 && (board_bits !== last_bits || applied_seq != last_seq)) begin
        fout = $fopen(output_file, "w");
        $fdisplay(fout, "%b %0d", board_bits, applied_seq);
        $fclose(fout);
        last_bits = board_bits;
        last_seq = applied_seq;
      end
    end
  end`;
}

// --- Assembly ----------------------------------------------------------------

/** The tie-off block, or an empty string when the design declares every output. */
function tieOffSection(spellings: Spellings, board: BoardIo): string {
  const assignments = tieOffs(spellings, board);
  if (assignments.length === 0) return '';
  return [TIE_OFF_COMMENT, ...assignments.map((assignment) => `  ${assignment}`)].join('\n');
}

/** The board clock only when the design declares it; the 500 Hz clock always. */
function clockProcesses(spellings: Spellings, board: BoardIo): string {
  const hasBoardClock = spellings.has(board.clock.port.toLowerCase());
  return [hasBoardClock ? boardClockProcess(board) : '', CLOCK_500HZ_PROCESS].filter(Boolean).join('\n');
}

/**
 * The complete `hdl_board_tb` module for a design whose top module is `top` and which
 * declares the board ports in `spellings` (from `boardPortSpellings`), on `board`.
 */
export function buildBoardTestbench(top: string, spellings: Spellings, board: BoardIo): string {
  const sections = [
    TIMESCALE,
    declarations(board, TESTBENCH_MODULE_NAME),
    tieOffSection(spellings, board),
    instantiation(top, spellings, board),
    decoderSection(board),
    clockProcesses(spellings, board),
    RUNTIME_SETTINGS,
    PACING,
    boardIo(board),
  ];
  return `${sections.filter((section) => section !== '').join('\n\n')}\nendmodule\n`;
}
