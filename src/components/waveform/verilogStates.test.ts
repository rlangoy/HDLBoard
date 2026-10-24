// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import uartTx from '../../../tests/fixtures/verilog/UART_Tx.v?raw';
import uartTxTb from '../../../tests/fixtures/verilog/UART_Tx_tb.v?raw';
import { fixtureText, scopeAt } from './fixtures.testSupport';
import type { SignalRef, WaveformData } from './model';
import { parseVcd } from './vcdParser';
import { withVerilogStateNames } from './verilogStates';

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

const MODULE = (body: string) => `module m;\n  reg [1:0] state, next_state;\n${body}\nendmodule\n`;
const GROUP = "  localparam [1:0] IDLE = 2'd0, RUN = 2'd1, DONE = 2'b10;";

describe('the UART Tx Testbench (Verilog)', () => {
  const named = () => withVerilogStateNames(uartWave(), [uartTx, uartTxTb]);

  it('shows State by its state names, as the VHDL testbench does', () => {
    const state = signal(named(), 'State', 'UART_Tx_tb', 'uut');
    expect(state).toMatchObject({ kind: 'enum', enumType: { literals: ['IDLE', 'START_BIT', 'DATA_BITS', 'STOP_BIT'] } });
    expect(valuesOf(named(), state)).toEqual(['IDLE', 'START_BIT', 'DATA_BITS', 'STOP_BIT', 'IDLE']);
  });

  it('leaves the other registers as bits', () => {
    expect(signal(named(), 'BitIndex', 'UART_Tx_tb', 'uut').kind).toBe('vector');
    expect(signal(named(), 'DataReg', 'UART_Tx_tb', 'uut').kind).toBe('vector');
  });

  it('leaves out the localparams, as the VHDL waveform leaves out constants', () => {
    const names = scopeAt(named(), 'UART_Tx_tb', 'uut').signals.map((s) => s.name);
    expect(names.filter((name) => /INDEX|^IDLE$|CLKS_PER_BIT|BAUD_RATE/.test(name))).toEqual([]);
  });

  it('shows the bits without the sources', () => {
    expect(signal(withVerilogStateNames(uartWave(), []), 'State', 'UART_Tx_tb', 'uut').kind).toBe('vector');
  });
});

describe('a state register', () => {
  const named = (body: string, data = wave()) => signal(withVerilogStateNames(data, [MODULE(body)]), 'state', 'm');

  it('is assigned only names of one localparam group', () => {
    const data = withVerilogStateNames(wave(), [MODULE(`${GROUP}\n  always @* state = IDLE;\n  initial state <= RUN;`)]);
    expect(valuesOf(data, signal(data, 'state', 'm'))).toEqual(['IDLE', 'RUN', 'DONE']);
  });

  it('may be assigned another state register: state <= next_state', () => {
    const data = withVerilogStateNames(wave(), [MODULE(`${GROUP}\n  always @* next_state = RUN;\n  always @(posedge c) state <= next_state;`)]);
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
    const data = withVerilogStateNames(wave(), [MODULE("  localparam [1:0] IDLE = 2'd0, RUN = 2'd1;\n  initial state = RUN;")]);
    expect(valuesOf(data, signal(data, 'state', 'm'))).toEqual(['IDLE', 'RUN', '10']);
  });

  it('ignores a comparison and a commented-out assignment', () => {
    expect(named(`${GROUP}\n  initial state = IDLE;\n  // state = 2'b11;\n  wire w = state == 2'd3;`).kind).toBe('enum');
  });
});

describe('a localparam group', () => {
  const kindWith = (group: string) => signal(withVerilogStateNames(wave(), [MODULE(`${group}\n  initial state = X;\n  initial state = Y;`)]), 'state', 'm').kind;

  it('may be unsized', () => expect(kindWith('  localparam X = 0, Y = 1;')).toBe('enum'));
  it('may be a parameter statement', () => expect(kindWith('  parameter X = 0, Y = 1;')).toBe('enum'));
  it('needs distinct values', () => expect(kindWith('  localparam X = 1, Y = 1;')).toBe('vector'));
  it('needs constant values', () => expect(kindWith('  localparam X = 0, Y = X + 1;')).toBe('vector'));
  it('needs two names in one statement', () => expect(kindWith('  localparam X = 0;\n  localparam Y = 1;')).toBe('vector'));
});
