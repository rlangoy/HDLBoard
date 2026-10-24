// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import uartTx from '../../../tests/fixtures/verilog/UART_Tx.v?raw';
import uartTxTb from '../../../tests/fixtures/verilog/UART_Tx_tb.v?raw';
import { fixtureText, scopeAt } from './fixtures.testSupport';
import type { SignalRef, WaveformData } from './model';
import { parseVcd } from './vcdParser';
import { verilogModulesIn } from './verilogModules';
import { withVerilogStateNames } from './verilogStates';

/** The state names the sources give the waveform, as the viewer works them out. */
const withStates = (data: WaveformData, sources: readonly string[]) => withVerilogStateNames(data, verilogModulesIn(sources));

// icarus_uart_tx.vcd: the built-in UART Tx Testbench (Verilog), run by Icarus 13.
const uartWave = () => parseVcd(fixtureText('icarus_uart_tx.vcd'));

function signal(data: WaveformData, name: string, ...scopes: string[]): SignalRef {
  const found = scopeAt(data, ...scopes).signals.find((s) => s.name === name);
  if (found === undefined) throw new Error(`No signal ${name}`);
  return found;
}

/** The values a signal takes, in order. */
function valuesOf(data: WaveformData, ref: SignalRef): string[] {
  const trace = data.traces.get(ref.trace);
  if (trace === undefined) throw new Error('No trace');
  return [...trace.valueIndex].map((index) => trace.values[index]);
}

/** A one-module VCD with a 2-bit `state` that steps 0, 1, 2 and `other`, the same bits. */
function wave(width = 2): WaveformData {
  const vector = (n: number) => `b${n.toString(2)}`;
  return parseVcd(
    [
      '$timescale 1ns $end',
      '$scope module m $end',
      `$var reg ${width} ! state [${width - 1}:0] $end`,
      `$var reg ${width} " next_state [${width - 1}:0] $end`,
      '$upscope $end',
      '$enddefinitions $end',
      `#0\n${vector(0)} !\n${vector(1)} "`,
      `#10\n${vector(1)} !\n${vector(2)} "`,
      `#20\n${vector(2)} !\nbx "`,
      '#30',
    ].join('\n'),
  );
}

/** A module whose `state` is used as a state: `case (state)`. */
const MODULE = (body: string) => `module m;\n  reg [1:0] state, next_state;\n  always @* case (state) default: ; endcase\n${body}\nendmodule\n`;
const GROUP = "  localparam [1:0] IDLE = 2'd0, RUN = 2'd1, DONE = 2'b10;";

describe('the UART Tx Testbench (Verilog)', () => {
  // Parsed and named once: every test reads the same waveform.
  const named = withStates(uartWave(), [uartTx, uartTxTb]);
  const FRAME_STATES = ['IDLE', 'START_BIT', 'DATA_BITS', 'STOP_BIT', 'IDLE'];

  it('shows State as an enumeration of its four states, as the VHDL testbench does', () => {
    expect(signal(named, 'State', 'UART_Tx_tb', 'uut')).toMatchObject({ kind: 'enum', enumType: { literals: ['IDLE', 'START_BIT', 'DATA_BITS', 'STOP_BIT'] } });
  });

  it('steps State through one frame by name', () => {
    expect(valuesOf(named, signal(named, 'State', 'UART_Tx_tb', 'uut'))).toEqual(FRAME_STATES);
  });

  it("shows the testbench's copy of uut.State by its state names too", () => {
    expect(valuesOf(named, signal(named, 'state', 'UART_Tx_tb'))).toEqual(FRAME_STATES);
  });

  it('leaves the other registers as bits', () => {
    const kinds = ['BitIndex', 'DataReg'].map((name) => signal(named, name, 'UART_Tx_tb', 'uut').kind);
    expect(kinds).toEqual(['vector', 'vector']);
  });

  it('shows the bits without the sources', () => {
    expect(signal(withStates(uartWave(), []), 'State', 'UART_Tx_tb', 'uut').kind).toBe('vector');
  });
});

describe('a state register', () => {
  const named = (body: string, data = wave()) => signal(withStates(data, [MODULE(body)]), 'state', 'm');

  it('is assigned only names of one localparam group', () => {
    const data = withStates(wave(), [MODULE(`${GROUP}\n  always @* state = IDLE;\n  initial state <= RUN;`)]);
    expect(valuesOf(data, signal(data, 'state', 'm'))).toEqual(['IDLE', 'RUN', 'DONE']);
  });

  it('may be assigned another state register: state <= next_state', () => {
    const data = withStates(wave(), [MODULE(`${GROUP}\n  always @* next_state = RUN;\n  always @(posedge c) state <= next_state;`)]);
    expect(signal(data, 'state', 'm').kind).toBe('enum');
    expect(valuesOf(data, signal(data, 'next_state', 'm'))).toEqual(['RUN', 'DONE', 'X']);
  });

  it('is not one when an assignment is an expression', () => {
    expect(named(`${GROUP}\n  initial state = IDLE;\n  always @(posedge c) state <= state + 1;`).kind).toBe('vector');
  });

  it('is not one when it mixes two groups', () => {
    const second = "  localparam [1:0] A = 2'd0, B = 2'd1;";
    expect(named(`${GROUP}\n${second}\n  initial state = IDLE;\n  initial state = B;`).kind).toBe('vector');
  });

  it('is not one when the group is wider than the register', () => {
    expect(named(`${GROUP}\n  initial state = IDLE;`, wave(3)).kind).toBe('vector');
  });

  it('keeps the bits of a value no state has', () => {
    const data = withStates(wave(), [MODULE("  localparam [1:0] IDLE = 2'd0, RUN = 2'd1;\n  initial state = RUN;")]);
    expect(valuesOf(data, signal(data, 'state', 'm'))).toEqual(['IDLE', 'RUN', '10']);
  });

  it('may have next_state = state as the default of a two-process state machine', () => {
    const body = `${GROUP}\n  always @* begin next_state = state; if (go) next_state = RUN; end\n  always @(posedge c) state <= next_state;\n  initial state = IDLE;`;
    const data = withStates(wave(), [MODULE(body)]);
    expect([signal(data, 'state', 'm').kind, signal(data, 'next_state', 'm').kind]).toEqual(['enum', 'enum']);
  });

  it('may be used as a state in a comparison instead of a case', () => {
    const data = withStates(wave(), [`module m;\n  reg [1:0] state;\n${GROUP}\n  initial state = IDLE;\n  wire idle = (state == IDLE);\nendmodule\n`]);
    expect(signal(data, 'state', 'm').kind).toBe('enum');
  });

  it('is not one when it is never used as a state: constants loaded into a counter', () => {
    const body = "  localparam [1:0] FULL = 2'd3, HALF = 2'd1;\n  initial state = FULL;\n  always @(posedge c) state <= HALF;";
    const data = withStates(wave(), [`module m;\n  reg [1:0] state;\n${body}\nendmodule\n`]);
    expect(signal(data, 'state', 'm').kind).toBe('vector');
  });

  it('is not mistaken for an assignment in a <= comparison: if (state <= DONE)', () => {
    expect(named(`${GROUP}\n  initial state = IDLE;\n  always @(posedge c) if (state <= DONE) state <= RUN;`).kind).toBe('enum');
  });

  it('ignores a comparison and a commented-out assignment', () => {
    expect(named(`${GROUP}\n  initial state = IDLE;\n  // state = 2'b11;\n  wire w = state == 2'd3;`).kind).toBe('enum');
  });
});

describe('a hierarchical name', () => {
  const TOP = 'module top;\n  wire [1:0] state;\n  child u1 ();\n  assign state = u1.s;\nendmodule\n';
  const TOP_WAVE = ['$timescale 1ns $end', '$scope module top $end', '$var wire 2 ! state [1:0] $end', '$upscope $end', '$enddefinitions $end', '#0', 'b1 !'];
  const kindWith = (child: string) => signal(withStates(parseVcd(TOP_WAVE.join('\n')), [TOP, child]), 'state', 'top').kind;

  it("reads the instance's state register", () => {
    expect(kindWith(`module child;\n${GROUP}\n  reg [1:0] s = RUN;\n  always @* case (s) default: ; endcase\nendmodule\n`)).toBe('enum');
  });

  it("stays bits when the instance's register is not a state register", () => {
    expect(kindWith("module child;\n  reg [1:0] s = 2'd1;\nendmodule\n")).toBe('vector');
  });

  it('stays bits when the instance is not in the sources', () => {
    expect(kindWith(MODULE(GROUP))).toBe('vector');
  });
});

describe('a localparam group', () => {
  const kindWith = (group: string) => signal(withStates(wave(), [MODULE(`${group}\n  initial state = X;\n  initial state = Y;`)]), 'state', 'm').kind;

  it('may be unsized', () => expect(kindWith('  localparam X = 0, Y = 1;')).toBe('enum'));
  it('may be a parameter statement', () => expect(kindWith('  parameter X = 0, Y = 1;')).toBe('enum'));
  it('needs distinct values', () => expect(kindWith('  localparam X = 1, Y = 1;')).toBe('vector'));
  it('needs constant values', () => expect(kindWith('  localparam X = 0, Y = X + 1;')).toBe('vector'));
  it('needs two names in one statement', () => expect(kindWith('  localparam X = 0;\n  localparam Y = 1;')).toBe('vector'));
});

describe('a name with characters a pattern would read', () => {
  // `\a+b(3` is an escaped identifier with an unbalanced `(`: as a raw pattern it throws.
  const NAME = String.raw`\a+b(3`;
  const ESCAPED = ['$timescale 1ns $end', '$scope module m $end', `$var reg 2 ! ${NAME} [1:0] $end`, '$scope module genblk1[0] $end', '$upscope $end', '$upscope $end', '$enddefinitions $end', '#0', 'b1 !'];
  const named = () => withStates(parseVcd(ESCAPED.join('\n')), [MODULE(GROUP)]);

  it('does not stop the waveform from opening: an escaped identifier, a generate scope', () => {
    expect(named).not.toThrow();
  });

  it('is matched only as itself', () => {
    expect(signal(named(), NAME, 'm').kind).toBe('vector');
  });
});
