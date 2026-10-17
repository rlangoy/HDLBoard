// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { firstError, icarusLineTime, lastReportFs, reportTimeFs } from './consoleTimes';
import { fixtureBytes, fixtureText } from './fixtures.testSupport';
import { parseGhw } from './ghwParser';
import { clockPeriod, firstShown, firstWindow } from './initialView';
import { BUSY, NO_VALUE, visibleSpans } from './levelOfDetail';
import type { SignalRef, Trace } from './model';
import { defaultShowAs, formatBits, formatValue, isUndefinedValue } from './radix';
import { listRows, signalsByPath, testbenchSignalPaths } from './signalRows';
import { formatCursorFs, formatFs, parseSimTime, tickMarks, tickStepFs, viewOf } from './timeAxis';
import { indexAt, nextChange, previousChange, spanAt, valueAt } from './valueAt';
import { unavailableHelp, valueHelp } from './valueHelp';
import { parseVcd } from './vcdParser';
import { memoryNames, withVerilogMemories } from './verilogMemories';

const trace = (pairs: Array<[number, string]>): Trace => {
  const values = [...new Set(pairs.map(([, v]) => v))];
  return {
    times: Float64Array.from(pairs.map(([t]) => t)),
    valueIndex: Uint32Array.from(pairs.map(([, v]) => values.indexOf(v))),
    values,
  };
};

describe('valueAt', () => {
  const t = trace([
    [10, 'a'],
    [20, 'b'],
    [30, 'c'],
  ]);
  test.each([
    [5, undefined],
    [10, 'a'],
    [15, 'a'],
    [20, 'b'],
    [99, 'c'],
  ])('at %d', (time, value) => expect(valueAt(t, time)).toBe(value));

  test('index, next and previous change, span', () => {
    expect(indexAt(t, 9)).toBe(-1);
    expect(nextChange(t, 10)).toBe(20);
    expect(nextChange(t, 30)).toBeUndefined();
    expect(previousChange(t, 20)).toBe(10);
    expect(previousChange(t, 25)).toBe(20);
    expect(previousChange(t, 10)).toBeUndefined();
    expect(spanAt(t, 25, 50)).toEqual({ start: 20, end: 30 });
    expect(spanAt(t, 35, 50)).toEqual({ start: 30, end: 50 });
  });
});

describe('radix', () => {
  const vector = (width: number): SignalRef => ({ name: 'v', trace: 0, kind: 'vector', width });
  test.each([
    ['00001011', 'hex', '0x0B'],
    ['01000001', 'hex', '0x41'],
    ['00001011', 'decimal', '11'],
    ['11111101', 'decimal', '253'],
    ['01000001', 'ascii', "'A'"],
    ['0100100001101001', 'ascii', "'Hi'"],
    ['00000001', 'ascii', "'·'"],
    ['UUUU0011', 'ascii', "'X'"],
    ['00001011', 'binary', '00001011'],
    ['UUUU0011', 'hex', '0xU3'],
    ['XX010011', 'hex', '0xX3'],
    ['ZZZZZZZZ', 'hex', '0xZZ'],
    ['0U11', 'decimal', 'X'],
    ['UUUU', 'decimal', 'U'],
    ['101', 'hex', '0x5'],
  ] as const)('%s as %s is %s', (bits, showAs, text) => expect(formatBits(bits, showAs)).toBe(text));

  test('defaults: vectors as hexadecimal with 0x, integers as decimal', () => {
    expect(defaultShowAs(vector(4))).toBe('hex');
    expect(defaultShowAs(vector(8))).toBe('hex');
    expect(defaultShowAs({ name: 'n', trace: 0, kind: 'integer', width: 1 })).toBe('decimal');
    expect(formatValue(vector(8), '10100101')).toBe('0xA5');
    expect(formatValue({ name: 's', trace: 0, kind: 'enum', width: 1 }, 'idle')).toBe('idle');
  });

  test('undefined values are found in vectors and bits', () => {
    expect(isUndefinedValue(vector(4), '01U1')).toBe(true);
    expect(isUndefinedValue(vector(4), '01Z1')).toBe(false);
    expect(isUndefinedValue({ name: 'b', trace: 0, kind: 'logic', width: 1 }, 'X')).toBe(true);
  });
});

describe('timeAxis', () => {
  test('time text', () => {
    expect(formatFs(0)).toBe('0');
    expect(formatFs(850e6)).toBe('850 ns');
    expect(formatFs(1.23e9)).toBe('1.23 µs');
    expect(formatFs(2e12)).toBe('2 ms');
    expect(formatFs(500)).toBe('500 fs');
    expect(formatCursorFs(1.23e9)).toBe('1.230 µs');
  });

  test('GHDL times', () => {
    expect(parseSimTime('1230ns')).toBe(1.23e9);
    expect(parseSimTime('0ms')).toBe(0);
    expect(parseSimTime('1.5us')).toBe(1.5e9);
    expect(parseSimTime('2 sec')).toBe(2e15);
    expect(parseSimTime('soon')).toBeUndefined();
  });

  test('1-2-5 steps at least 90 px apart', () => {
    // 1 ns per pixel, femtosecond ticks: 90 ns wanted, 100 ns chosen.
    expect(tickStepFs(1e6, 1)).toBe(100e6);
    expect(tickStepFs(2e6, 1)).toBe(200e6);
    expect(tickStepFs(5e6, 1)).toBe(500e6);
    // Never below one tick of the file.
    expect(tickStepFs(0.0001, 1000)).toBe(1000);
  });

  test('tick marks across the view', () => {
    const marks = tickMarks(viewOf(0, 1000e6, 1000), 1000, 1);
    expect(marks.map((m) => m.label)).toEqual(['0', '100 ns', '200 ns', '300 ns', '400 ns', '500 ns', '600 ns', '700 ns', '800 ns', '900 ns', '1 µs']);
    expect(marks[1].x).toBeCloseTo(100);
  });
});

describe('levelOfDetail', () => {
  test('wide spans are kept, with no value before the first change', () => {
    const t = trace([
      [10, 'a'],
      [50, 'b'],
    ]);
    expect(visibleSpans(t, 0, 100, 1)).toEqual([
      { start: 0, end: 10, value: NO_VALUE },
      { start: 10, end: 50, value: 0 },
      { start: 50, end: 100, value: 1 },
    ]);
  });

  test('changes closer than a pixel become one busy span', () => {
    const fast = trace(Array.from({ length: 1000 }, (_, i): [number, string] => [i, i % 2 ? '1' : '0']).concat([[2000, 'Z']]));
    const spans = visibleSpans(fast, 0, 3000, 10);
    expect(spans).toEqual([
      { start: 0, end: 999, value: BUSY },
      { start: 999, end: 2000, value: fast.valueIndex[999] },
      { start: 2000, end: 3000, value: fast.valueIndex[1000] },
    ]);
  });

  test('the number of spans follows the width, not the changes', () => {
    const clock = trace(Array.from({ length: 200_000 }, (_, i): [number, string] => [i * 5, i % 2 ? '1' : '0']));
    expect(visibleSpans(clock, 0, 1_000_000, 1000).length).toBeLessThan(5);
  });
});

describe('consoleTimes', () => {
  const lines = [
    'tb.vhd:28:21:@1230ns:(report note): starting',
    'tb.vhd:30:21:@1500ns:(assertion error): 7 + 5 gave 11',
    'tb.vhd:31:21:@1700ns:(assertion error): again',
    'tb.vhd:41:9:@2590ns:(report note): FAIL: 2 of 256 wrong',
  ];
  test('report times and the first error', () => {
    expect(reportTimeFs(lines[0])).toBe(1.23e9);
    expect(firstError(lines)).toEqual({ fs: 1.5e9, text: '7 + 5 gave 11' });
    expect(lastReportFs(lines)).toBe(2.59e9);
    expect(firstError(lines.slice(0, 1))).toBeUndefined();
  });

  test('Icarus $error: the time is on the next line, in picoseconds', () => {
    const icarus = ['plain', 'ERROR: tb.v:12: count is 3', '       Time: 45000  Scope: tb'];
    expect(icarusLineTime(icarus[2])).toEqual({ fs: 45e6, parts: ['       Time: ', '45000', '  Scope: tb'] });
    expect(firstError(icarus)).toEqual({ fs: 45e6, text: 'count is 3' });
  });
});

describe('signal list and first view (GHW fixture)', () => {
  const data = parseGhw(fixtureBytes('wave_types.ghw'));

  test('the testbench signals first, as many as fit', () => {
    expect(firstShown(data, 3)).toEqual(['wave_types_tb/clk', 'wave_types_tb/rst', 'wave_types_tb/q']);
    expect(testbenchSignalPaths(data)).toContain('wave_types_tb/pair/b');
    expect(signalsByPath(data).get('wave_types_tb/dut/count')?.kind).toBe('vector');
  });

  test('rows: shown signals, then "N more", then folded instances', () => {
    const shown = new Set(firstShown(data, 3));
    const rows = listRows(data, { shown, open: new Set(), showAll: false });
    expect(rows.map((r) => r.kind)).toEqual(['signal', 'signal', 'signal', 'group', 'more', 'scope']);
    expect(rows.find((r) => r.kind === 'more')).toMatchObject({ count: 9 });
    const all = listRows(data, { shown, open: new Set(['wave_types_tb/dut', 'wave_types_tb/pair']), showAll: true });
    expect(all.filter((r) => r.kind === 'signal' && r.depth === 1).map((r) => r.path)).toEqual([
      'wave_types_tb/pair/a',
      'wave_types_tb/pair/b',
      'wave_types_tb/dut/clk',
      'wave_types_tb/dut/rst',
      'wave_types_tb/dut/q',
      'wave_types_tb/dut/count',
    ]);
  });

  test('the clock is found and the first error zooms in around it', () => {
    expect(clockPeriod(data)).toBe(10e6);
    const window = firstWindow(data, { firstError: { fs: 100e6, text: 'bad' } });
    expect(window.cursor).toBe(100e6);
    expect(window.end - window.start).toBe(200e6); // 20 periods beat a tenth of 200 ns
    expect(window.error).toEqual({ time: 100e6, text: 'bad' });
    expect(firstWindow(data, { lastReportFs: 150e6 })).toEqual({ start: 0, end: 200e6, cursor: 150e6 });
  });

});

describe('unavailable signals', () => {
  test('GHDL VCD: enumerations listed with the reason', () => {
    const data = parseVcd(fixtureText('ghdl_wave_types.vcd'));
    const rows = listRows(data, { shown: new Set(), open: new Set(), showAll: true });
    expect(rows.filter((r) => r.kind === 'unavailable').map((r) => r.path)).toEqual(['wave_types_tb/state', 'wave_types_tb/pair', 'wave_types_tb/ch']);
    expect(unavailableHelp('vcd-type')).toMatch(/enumeration/);
  });

  test('Verilog memories from the testbench source', () => {
    const source = 'module counter_tb; reg [7:0] mem [0:3]; // reg x [1:0];\n reg [7:0] data; endmodule';
    expect(memoryNames(source, 'counter_tb')).toEqual(['mem']);
    const data = withVerilogMemories(parseVcd(fixtureText('icarus_counter.vcd')), [source]);
    expect(data.root.scopes[0].unavailable).toEqual([{ name: 'mem', reason: 'memory' }]);
  });

  test('value help', () => {
    expect(valueHelp('U')).toMatch(/never been given a value/);
    expect(valueHelp('01U1')).toMatch(/Some bits are U/);
    expect(valueHelp('0101')).toBeUndefined();
  });
});
