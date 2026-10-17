// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { changes, fixtureBytes, scopeAt, signalIn } from './fixtures.testSupport';
import { parseGhw } from './ghwParser';
import { NO_TRACE, WaveParseError } from './model';

const NS = 1e6;

describe('GHW from GHDL', () => {
  const data = parseGhw(fixtureBytes('wave_types.ghw'));
  const tb = scopeAt(data, 'wave_types_tb');

  test('only the design is left once empty packages are dropped', () => {
    expect(data.tickFs).toBe(1);
    expect(data.root.scopes.map((s) => s.name)).toEqual(['wave_types_tb']);
    expect(tb.scopes.map((s) => s.name)).toEqual(['dut']);
    expect(data.source).toEqual({ format: 'ghw', status: 'complete', truncated: false });
  });

  test('an enumeration – an FSM state – is shown by name', () => {
    expect(signalIn(tb, 'state')).toMatchObject({ kind: 'enum', enumType: { name: 'state_t', literals: ['idle', 'run', 'done'] } });
    expect(changes(data, signalIn(tb, 'state'))).toEqual([
      [0, 'idle'],
      [25 * NS, 'run'],
      [105 * NS, 'done'],
    ]);
  });

  test('a record folds into its fields', () => {
    const pair = signalIn(tb, 'pair');
    expect(pair).toMatchObject({ kind: 'record', trace: NO_TRACE, width: 5 });
    expect(pair.fields?.map((f) => [f.name, f.kind])).toEqual([
      ['a', 'logic'],
      ['b', 'vector'],
    ]);
    expect(changes(data, (pair.fields ?? [])[1])).toEqual([
      [0, '0000'],
      [25 * NS, '0101'],
    ]);
  });

  test('character, integer, real, boolean and bit', () => {
    expect(changes(data, signalIn(tb, 'ch'))).toEqual([
      [0, "'A'"],
      [25 * NS, "'B'"],
    ]);
    expect(changes(data, signalIn(tb, 'n')).map(([, v]) => v)).toEqual(['0', '42', '-7']);
    expect(changes(data, signalIn(tb, 'r')).map(([, v]) => v)).toEqual(['0', '3.5']);
    expect(signalIn(tb, 'flag').kind).toBe('logic');
    expect(changes(data, signalIn(tb, 'flag')).map(([, v]) => v)).toEqual(['0', '1']);
    expect(changes(data, signalIn(tb, 'b')).map(([, v]) => v)).toEqual(['0', '1']);
  });

  test('vectors, with U before their first assignment, and all nine std_logic values', () => {
    expect(signalIn(tb, 'lv')).toMatchObject({ kind: 'vector', width: 8, range: { left: 7, right: 0 } });
    expect(changes(data, signalIn(tb, 'lv'))).toEqual([
      [0, 'UUUUUUUU'],
      [25 * NS, '10100101'],
    ]);
    expect(changes(data, signalIn(tb, 'sv')).map(([, v]) => v)).toEqual(['00000000', '11111101']);
    expect(changes(data, signalIn(tb, 'nine')).map(([, v]) => v)).toEqual(['U', 'X', '0', '1', 'Z', 'W', 'L', 'H', '-']);
  });

  test('a port shares the trace of the signal it is connected to', () => {
    const dut = scopeAt(data, 'wave_types_tb', 'dut');
    expect(signalIn(dut, 'clk').trace).toBe(signalIn(tb, 'clk').trace);
    expect(changes(data, signalIn(dut, 'count')).slice(0, 3)).toEqual([
      [0, 'UUUU'],
      [5 * NS, '0000'],
      [15 * NS, '0001'],
    ]);
  });
});

describe('GHW from a stopped run', () => {
  const bytes = fixtureBytes('forever_stopped.ghw');

  test('the data up to the last complete cycle is kept', () => {
    const data = parseGhw(bytes, 'size-limit');
    expect(data.source.truncated).toBe(true);
    const tb = scopeAt(data, 'forever_tb');
    const clk = changes(data, signalIn(tb, 'clk'));
    expect(clk.length).toBeGreaterThan(1000);
    // A free-running 10 ns clock: every change is 5 ns after the one before.
    clk.slice(1).forEach(([t], i) => expect(t - clk[i][0]).toBe(5 * NS));
    expect(changes(data, signalIn(tb, 'state')).slice(0, 4).map(([, v]) => v)).toEqual(['idle', 'run', 'done', 'idle']);
    expect(data.endTime).toBe(clk[clk.length - 1][0]);
  });

  test('cut at any point inside the cycles, it never throws and keeps time order', () => {
    const start = new TextDecoder('latin1').decode(bytes).indexOf('CYC');
    for (let cut = start; cut < start + 3000; cut += 13) {
      const data = parseGhw(bytes.slice(0, cut), 'stopped');
      for (const trace of data.traces.values()) {
        for (let i = 1; i < trace.times.length; i++) expect(trace.times[i]).toBeGreaterThan(trace.times[i - 1]);
      }
    }
  });

  test('cut inside the hierarchy is a clear error', () => {
    const inHierarchy = new TextDecoder('latin1').decode(bytes).indexOf('HIE') + 20;
    expect(() => parseGhw(bytes.slice(0, inHierarchy), 'stopped')).toThrow(WaveParseError);
    expect(() => parseGhw(bytes.slice(0, inHierarchy), 'stopped')).toThrow(/ends before its list of signals/);
  });

  test('not a GHW file', () => {
    expect(() => parseGhw(new TextEncoder().encode('$date today $end'))).toThrow(/not a GHW/);
    expect(() => parseGhw(new Uint8Array())).toThrow(/empty/);
  });
});
