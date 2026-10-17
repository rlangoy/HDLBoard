// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { changes, fixtureText, scopeAt, signalIn } from './fixtures.testSupport';
import { WaveParseError } from './model';
import { extendVector, parseVcd, VcdParser, vectorToInteger } from './vcdParser';

const NS = 1e6; // GHDL ticks are femtoseconds

describe('VCD from GHDL', () => {
  const data = parseVcd(fixtureText('ghdl_wave_types.vcd'));
  const tb = scopeAt(data, 'wave_types_tb');

  test('femtosecond timescale, empty package scopes dropped', () => {
    expect(data.tickFs).toBe(1);
    expect(data.root.scopes.map((s) => s.name)).toEqual(['wave_types_tb']);
    expect(tb.scopes.map((s) => s.name)).toEqual(['dut']);
  });

  test('a range attached to the name', () => {
    expect(signalIn(tb, 'q')).toMatchObject({ kind: 'vector', width: 4, range: { left: 3, right: 0 } });
  });

  test('enumerations, records and character are listed as unavailable', () => {
    expect(tb.unavailable).toEqual([
      { name: 'state', reason: 'vcd-type' },
      { name: 'pair', reason: 'vcd-type' },
      { name: 'ch', reason: 'vcd-type' },
    ]);
  });

  test('all nine std_logic values', () => {
    expect(changes(data, signalIn(tb, 'nine')).map(([, v]) => v)).toEqual(['U', 'X', '0', '1', 'Z', 'W', 'L', 'H', '-']);
  });

  test('U vectors, integer as signed decimal, real and boolean', () => {
    expect(changes(data, signalIn(tb, 'lv'))).toEqual([
      [0, 'UUUUUUUU'],
      [25 * NS, '10100101'],
    ]);
    expect(signalIn(tb, 'n').kind).toBe('integer');
    expect(changes(data, signalIn(tb, 'n'))).toEqual([
      [0, '0'],
      [25 * NS, '42'],
      [105 * NS, '-7'],
    ]);
    expect(changes(data, signalIn(tb, 'r'))).toEqual([
      [0, '0'],
      [25 * NS, '3.5'],
    ]);
    expect(signalIn(tb, 'flag')).toMatchObject({ kind: 'logic', width: 1 });
  });

  test('a port and the signal it is connected to are two traces with the same values', () => {
    const dut = scopeAt(data, 'wave_types_tb', 'dut');
    expect(signalIn(dut, 'clk').trace).not.toBe(signalIn(tb, 'clk').trace);
    expect(changes(data, signalIn(dut, 'clk'))).toEqual(changes(data, signalIn(tb, 'clk')));
  });
});

describe('VCD from Icarus Verilog', () => {
  const data = parseVcd(fixtureText('icarus_counter.vcd'));
  const tb = scopeAt(data, 'counter_tb');

  test('picosecond timescale written without a space', () => {
    expect(data.tickFs).toBe(1000);
  });

  test('a shared identifier code is one trace', () => {
    expect(signalIn(scopeAt(data, 'counter_tb', 'dut'), 'clk').trace).toBe(signalIn(tb, 'clk').trace);
  });

  test('a separate range, and left-compressed vectors extended', () => {
    expect(signalIn(tb, 'q')).toMatchObject({ width: 4, range: { left: 3, right: 0 } });
    expect(changes(data, signalIn(tb, 'q')).slice(0, 3)).toEqual([
      [0, 'XXXX'],
      [5000, '0000'],
      [15000, '0001'],
    ]);
    expect(changes(data, signalIn(tb, 'data'))).toEqual([
      [0, 'ZZZZZZZZ'],
      [32000, '00111100'],
      [52000, 'XXXX0101'],
    ]);
  });

  test('the end time is the last time step', () => {
    expect(data.endTime).toBe(152000);
  });
});

describe('a file cut off by a stopped run', () => {
  const text = fixtureText('ghdl_forever_stopped.vcd');

  test('the incomplete last line and time step are dropped', () => {
    const data = parseVcd(text, 'stopped');
    expect(data.source.truncated).toBe(true);
    // The last time step whose `#` line is complete: its changes may be cut, so it is dropped.
    const lastStep = Number([...text.matchAll(/#(\d+)\s/g)].pop()![1]);
    expect(data.endTime).toBe(lastStep);
    for (const trace of data.traces.values()) expect(trace.times[trace.times.length - 1]).toBeLessThan(lastStep);
  });

  test('cut anywhere, it never throws once the header is complete', () => {
    const body = text.indexOf('$enddefinitions');
    for (let cut = body + 40; cut < body + 4000; cut += 37) {
      expect(() => parseVcd(text.slice(0, cut), 'stopped')).not.toThrow();
    }
  });

  test('cut inside the header is a clear error', () => {
    expect(() => parseVcd(text.slice(0, 200), 'stopped')).toThrow(WaveParseError);
  });
});

describe('streaming', () => {
  test('chunks split anywhere give the same result as one string', () => {
    const text = fixtureText('icarus_counter.vcd');
    const whole = parseVcd(text);
    const parser = new VcdParser();
    for (let i = 0; i < text.length; i += 7) parser.push(text.slice(i, i + 7));
    const chunked = parser.finish('complete');
    expect(chunked.root).toEqual(whole.root);
    expect([...chunked.traces.values()].map((t) => Array.from(t.times))).toEqual([...whole.traces.values()].map((t) => Array.from(t.times)));
  });
});

describe('rules', () => {
  const header = '$timescale 1 ns $end $scope module t $end $var wire 1 ! a $end $upscope $end $enddefinitions $end\n';

  test('a time beyond 2^53 is refused with a clear message', () => {
    expect(() => parseVcd(`${header}#0\n0!\n#90071992547409930\n1!\n`)).toThrow(/too long/);
  });

  test('two changes in one time step keep the last', () => {
    const data = parseVcd(`${header}#0\n0!\n#5\n1!\n0!\n1!\n#9\n`);
    expect(changes(data, signalIn(scopeAt(data, 't'), 'a'))).toEqual([
      [0, '0'],
      [5, '1'],
    ]);
  });

  test('vector extension', () => {
    expect(extendVector('1', 4)).toBe('0001');
    expect(extendVector('x', 4)).toBe('XXXX');
    expect(extendVector('z01', 4)).toBe('ZZ01');
    expect(extendVector('u01', 4)).toBe('0U01');
  });

  test('integers', () => {
    expect(vectorToInteger('101010')).toBe('42');
    expect(vectorToInteger('11111111111111111111111111111001')).toBe('-7');
    expect(vectorToInteger('UUUU')).toBe('X');
  });
});
