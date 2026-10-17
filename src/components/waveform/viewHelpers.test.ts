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
import { listRows, rowIndexAtY, SECTION_GAP_PX, sectionPath, signalsByPath, traceRows, type ListState } from './signalRows';
import { ROW_HEIGHT } from './waveDraw';
import { formatCursorFs, formatFs, parseSimTime, tickMarks, tickStepFs, viewOf } from './timeAxis';
import { indexAt, nextChange, previousChange, spanAt, valueAt } from './valueAt';
import { unavailableHelp, valueHelp } from './valueHelp';
import { parseVcd } from './vcdParser';
import { memoryNames, withVerilogMemories } from './verilogMemories';

/** A trace as `[time, value]` pairs. */
const changes = (t: Trace): Array<[number, string]> => Array.from(t.times, (time, i) => [time, t.values[t.valueIndex[i]]]);

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

  test('zoomed far in, the labels keep the decimals their steps need', () => {
    expect(formatFs(20e6 + 100, 100)).toBe('20.0001 ns');
    expect(formatFs(20e6 + 200, 100)).toBe('20.0002 ns');
    expect(formatFs(20e6, 100)).toBe('20 ns');
    expect(formatFs(20e6 + 5000, 5000)).toBe('20.005 ns'); // a coarse step: three decimals, as before
    expect(formatCursorFs(20e6 + 30, 10)).toBe('20.00003 ns');
    // GHDL ticks are 1 fs: 0.1 ps steps around 20 ns read apart.
    const labels = tickMarks(viewOf(20e6, 20e6 + 2000, 1800), 1800, 1).map((m) => m.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels[1]).toBe('20.0001 ns');
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
    expect(visibleSpans(t, { from: 0, to: 100 }, 1)).toEqual([
      { start: 0, end: 10, value: NO_VALUE },
      { start: 10, end: 50, value: 0 },
      { start: 50, end: 100, value: 1 },
    ]);
  });

  test('changes closer than a pixel become one busy span', () => {
    const fast = trace(Array.from({ length: 1000 }, (_, i): [number, string] => [i, i % 2 ? '1' : '0']).concat([[2000, 'Z']]));
    const spans = visibleSpans(fast, { from: 0, to: 3000 }, 10);
    expect(spans).toEqual([
      { start: 0, end: 999, value: BUSY },
      { start: 999, end: 2000, value: fast.valueIndex[999] },
      { start: 2000, end: 3000, value: fast.valueIndex[1000] },
    ]);
  });

  test('the number of spans follows the width, not the changes', () => {
    const clock = trace(Array.from({ length: 200_000 }, (_, i): [number, string] => [i * 5, i % 2 ? '1' : '0']));
    expect(visibleSpans(clock, { from: 0, to: 1_000_000 }, 1000).length).toBeLessThan(5);
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

  const state = (shown: string[], open: string[] = [], expanded: string[] = []): ListState => ({
    shown,
    open: new Set(open),
    expanded: new Set(expanded),
  });

  test('the testbench signals first, as many as fit', () => {
    expect(firstShown(data, 3)).toEqual(['wave_types_tb/clk', 'wave_types_tb/rst', 'wave_types_tb/q']);
    expect(signalsByPath(data).get('wave_types_tb/dut/count')?.kind).toBe('vector');
  });

  const TB = sectionPath('wave_types_tb');
  const DUT = sectionPath('wave_types_tb/dut');

  test('a Testbench section and an RTL section, each with its shown signals together under its head', () => {
    const { rows } = listRows(data, state(['wave_types_tb/clk', 'wave_types_tb/dut/count', 'wave_types_tb/q']));
    expect(rows.map((r) => [r.kind, r.tone])).toEqual([
      ['section', 'testbench'],
      ['trace', 'testbench'],
      ['trace', 'testbench'],
      ['section', 'rtl'],
      ['trace', 'rtl'],
    ]);
    expect(rows[0]).toMatchObject({ path: TB, label: 'TB', scopes: ['wave_types_tb'], count: 12, open: false });
    expect(rows[3]).toMatchObject({ path: DUT, label: 'RTL', scopes: ['wave_types_tb', 'dut'], count: 3, open: false });
    expect(traceRows({ rows }).map((r) => r.label)).toEqual(['clk', 'q', 'count']);
  });

  test('a small gap above the second section, on the list and the canvas alike', () => {
    const model = listRows(data, state(['wave_types_tb/clk']));
    expect(model.tops).toEqual([0, ROW_HEIGHT, 2 * ROW_HEIGHT + SECTION_GAP_PX]);
    expect(model.height).toBe(3 * ROW_HEIGHT + SECTION_GAP_PX);
    expect(rowIndexAtY(model, ROW_HEIGHT + 1)).toBe(1);
    expect(rowIndexAtY(model, 2 * ROW_HEIGHT + 1)).toBeUndefined(); // in the gap
    expect(rowIndexAtY(model, 2 * ROW_HEIGHT + SECTION_GAP_PX)).toBe(2);
    expect(rowIndexAtY(model, model.height)).toBeUndefined();
  });

  test("an open section lists, after its shown signals, only the ones not shown", () => {
    const { rows } = listRows(data, state(['wave_types_tb/dut/count'], [TB, DUT, 'wave_types_tb/pair']));
    const dutRows = rows.filter((r) => r.path.startsWith('wave_types_tb/dut/'));
    expect(dutRows.map((r) => [r.kind, r.path])).toEqual([
      ['trace', 'wave_types_tb/dut/count'],
      ['hidden', 'wave_types_tb/dut/clk'],
      ['hidden', 'wave_types_tb/dut/rst'],
      ['hidden', 'wave_types_tb/dut/q'],
    ]);
    expect(rows.filter((r) => r.path.startsWith('wave_types_tb/pair')).map((r) => r.kind)).toEqual(['group', 'hidden', 'hidden']);
  });

  test('a shown vector unfolds into its bits, most significant first', () => {
    const { rows } = listRows(data, state(['wave_types_tb/q'], [], ['wave_types_tb/q']));
    const traces = traceRows({ rows });
    expect(traces.map((r) => r.label)).toEqual(['q', 'q[3]', 'q[2]', 'q[1]', 'q[0]']);
    const bit0 = traces[4];
    expect(bit0.kind === 'trace' && changes(bit0.trace).slice(0, 4)).toEqual([
      [0, 'U'],
      [5e6, '0'],
      [15e6, '1'],
      [25e6, '0'],
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
    const { rows } = listRows(data, { shown: [], open: new Set([sectionPath('wave_types_tb')]), expanded: new Set() });
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
