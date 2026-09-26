// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The generated Verilog testbench that wraps a student's board design
 * (docs/Verilog_implementation_plan.md § 5.6, Appendix A) — the Verilog counterpart of
 * `tbTemplate.ts`. It speaks the same file protocol as the VHDL one, so everything
 * downstream (the stimulus queue, `STATE` polling, real-time pacing) is shared.
 *
 * Pure: it only builds text. The Verilog below is data, in named sections; only the
 * connections, tie-offs and clock processes vary with the design's ports.
 */

/** One board signal the testbench owns, and what an unconnected output reads as. */
interface BoardSignal {
  /** The board's port name, lower case (as in `boardPortSpellings`). */
  readonly port: string;
  /** The testbench-side signal it connects to. */
  readonly signal: string;
  /** Present for outputs only: the electrically "off" value read when the design lacks the port. */
  readonly offValue?: string;
}

const HEX_DISPLAY_COUNT = 6;
const HEX_DISPLAYS = Array.from({ length: HEX_DISPLAY_COUNT }, (_, index) => index);
const LED_OFF = "10'b0";
const SEGMENTS_OFF = "7'h7F"; // active low: all ones is blank

/** In the order the ports are connected and the 52-bit state is assembled. */
const BOARD_SIGNALS: readonly BoardSignal[] = [
  { port: 'clock_50', signal: 'clk_sig' },
  { port: 'clock_500hz', signal: 'clk500_sig' },
  { port: 'sw', signal: 'sw_sig' },
  { port: 'key_n', signal: 'key_sig' },
  { port: 'ledr', signal: 'ledr_sig', offValue: LED_OFF },
  ...HEX_DISPLAYS.map((index) => ({ port: `hex${index}_n`, signal: `hex${index}_sig`, offValue: SEGMENTS_OFF })),
];

type Spellings = ReadonlyMap<string, string>;

/**
 * The instance of the student's top module, connecting each board port it declares
 * by the spelling it declared (`.Clock_50(clk_sig)`), because Verilog names are
 * case-sensitive.
 */
export function instantiation(top: string, spellings: Spellings): string {
  const connections = BOARD_SIGNALS.flatMap(({ port, signal }) => {
    const declared = spellings.get(port);
    return declared === undefined ? [] : [`.${declared}(${signal})`];
  });
  return `  ${top} uut (${connections.join(', ')});`;
}

/**
 * Assignments that hold every board *output* the design does not declare at its off
 * value, so an unconnected LED or display reads as blank rather than undefined
 * (the Verilog equivalent of `tbTemplate.ts`'s signal defaults).
 */
export function tieOffs(spellings: Spellings): string[] {
  return BOARD_SIGNALS.flatMap(({ port, signal, offValue }) =>
    offValue !== undefined && !spellings.has(port) ? [`assign ${signal} = ${offValue};`] : [],
  );
}

// --- The fixed sections of the testbench ------------------------------------

/**
 * Its own timescale, so the wrapper does not depend on which file was compiled before
 * it (a file with no directive inherits the previous file's, or runs at 1 s — M17).
 */
const TIMESCALE = '`timescale 1ns/1ps';

const DECLARATIONS = `module hdl_board_tb;
  reg         clk_sig    = 1'b0;
  reg         clk500_sig = 1'b0;
  reg  [9:0]  sw_sig     = 10'b0;
  reg  [3:0]  key_sig    = 4'hF;
  wire [9:0]  ledr_sig;
  wire [6:0]  hex0_sig, hex1_sig, hex2_sig, hex3_sig, hex4_sig, hex5_sig;`;

const TIE_OFF_COMMENT = '  // Board outputs this design does not declare read as "off" (displays are active low).';

/** 20 ns period: a 10 ns half-period at the 1 ns timescale. */
const CLOCK_50_PROCESS = '  always #10 clk_sig = ~clk_sig;';
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
 * "<seq> <SW10><KEY4>" line per poll (and not before the previous one has held for
 * min_dwell_ns), and publish "<52 state bits> <last applied seq>" whenever either changes.
 */
const BOARD_IO = `  // Board I/O: apply at most one queued input line per poll, publish the
  // 52-bit board state whenever it (or the applied sequence number) changes.
  wire [51:0] board_bits = {ledr_sig, hex0_sig, hex1_sig, hex2_sig, hex3_sig, hex4_sig, hex5_sig};
  integer fin, fout, scan_count, seq, applied_seq = 0, last_seq = -1;
  reg [13:0] rec;
  reg [51:0] last_bits = 52'bx;
  time applied_at = 0;
  reg applied_one;
  initial begin
    #1;
    forever begin
      #(poll_interval_ns * 1);
      if (input_file != 0 && ($time - applied_at) >= min_dwell_ns) begin
        fin = $fopen(input_file, "r");
        if (fin != 0) begin
          applied_one = 0;
          while (!applied_one && !$feof(fin)) begin
            scan_count = $fscanf(fin, "%d %b", seq, rec);
            if (scan_count == 2 && seq > applied_seq) begin
              sw_sig = rec[13:4];
              key_sig = rec[3:0];
              applied_seq = seq;
              applied_at = $time;
              applied_one = 1;
            end
          end
          $fclose(fin);
        end
      end
      if (output_file != 0 && (board_bits !== last_bits || applied_seq != last_seq)) begin
        fout = $fopen(output_file, "w");
        $fdisplay(fout, "%b %0d", board_bits, applied_seq);
        $fclose(fout);
        last_bits = board_bits;
        last_seq = applied_seq;
      end
    end
  end`;

// --- Assembly ----------------------------------------------------------------

/** The tie-off block, or an empty string when the design declares every output. */
function tieOffSection(spellings: Spellings): string {
  const assignments = tieOffs(spellings);
  if (assignments.length === 0) return '';
  return [TIE_OFF_COMMENT, ...assignments.map((assignment) => `  ${assignment}`)].join('\n');
}

/** The 50 MHz clock only when the design declares `CLOCK_50`; the 500 Hz clock always. */
function clockProcesses(spellings: Spellings): string {
  return [spellings.has('clock_50') ? CLOCK_50_PROCESS : '', CLOCK_500HZ_PROCESS].filter(Boolean).join('\n');
}

/**
 * The complete `hdl_board_tb` module for a design whose top module is `top` and which
 * declares the board ports in `spellings` (from `boardPortSpellings`).
 */
export function buildBoardTestbench(top: string, spellings: Spellings): string {
  const sections = [
    TIMESCALE,
    DECLARATIONS,
    tieOffSection(spellings),
    instantiation(top, spellings),
    clockProcesses(spellings),
    RUNTIME_SETTINGS,
    PACING,
    BOARD_IO,
  ];
  return `${sections.filter((section) => section !== '').join('\n\n')}\nendmodule\n`;
}
