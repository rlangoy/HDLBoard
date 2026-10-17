// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { bitIndex, bitSignal } from './bitTraces';
import { CURSOR_GRAB_PX } from './cursorHandle';
import { changeFrom, fineStep } from './cursorSteps';
import { fixtureBytes } from './fixtures.testSupport';
import { parseGhw } from './ghwParser';
import { traceLines } from './hoverInfo';
import type { SignalRef, Trace } from './model';
import { declarationOf, type TraceRow } from './signalRows';
import { viewOf } from './timeAxis';
import { takesCursor } from './useCanvasGestures';
import { AXIS_HEIGHT } from './waveDraw';
import { clampWindow, setupFor, toggleShown, toMemory, windowShowing, zoomWindow, type ViewSetup } from './viewSetup';

const trace = (pairs: Array<[number, string]>): Trace => {
  const values = [...new Set(pairs.map(([, v]) => v))];
  return { times: Float64Array.from(pairs.map(([t]) => t)), valueIndex: Uint32Array.from(pairs.map(([, v]) => values.indexOf(v))), values };
};

const vector = (width: number, range?: { left: number; right: number }): SignalRef => ({ name: 'q', trace: 0, kind: 'vector', width, ...(range ? { range } : {}) });

describe('the view window', () => {
  const bounds = { end: 1000, minSpan: 10 };

  test('zooming keeps the point under the mouse where it is', () => {
    expect(zoomWindow({ start: 0, end: 100 }, 1 / 2, 50)).toEqual({ start: 25, end: 75 });
    expect(zoomWindow({ start: 0, end: 100 }, 2, 0)).toEqual({ start: 0, end: 200 });
  });

  test('never narrower than the minimum, nor much wider or further than the run', () => {
    expect(clampWindow({ start: 100, end: 101 }, bounds)).toEqual({ start: 100, end: 110 });
    expect(clampWindow({ start: 0, end: 100_000 }, bounds)).toEqual({ start: 0, end: 4000 });
    expect(clampWindow({ start: 5000, end: 5100 }, bounds)).toEqual({ start: 975, end: 1075 });
  });

  test('a console time outside the window centres it; inside, the window stays', () => {
    expect(windowShowing({ start: 0, end: 100 }, 50)).toEqual({ start: 0, end: 100 });
    expect(windowShowing({ start: 0, end: 100 }, 500)).toEqual({ start: 450, end: 550 });
  });
});

describe('the view setup', () => {
  const data = parseGhw(fixtureBytes('wave_types.ghw'));
  const context = { moments: {}, fittingRows: 2 };

  test('the first view shows the testbench signals that fit, the whole run, the cursor at 0', () => {
    const setup = setupFor(data, null, context);
    expect(setup.list.shown).toEqual(['wave_types_tb/clk', 'wave_types_tb/rst']);
    expect(setup.window).toEqual({ start: 0, end: data.endTime });
    expect(setup.cursor).toBe(0);
  });

  test('a ticked signal goes to the end of the shown ones; unticked, it leaves', () => {
    const setup = setupFor(data, null, context);
    const added = toggleShown(setup, 'wave_types_tb/dut/count');
    expect(added.list.shown).toEqual(['wave_types_tb/clk', 'wave_types_tb/rst', 'wave_types_tb/dut/count']);
    expect(toggleShown(added, 'wave_types_tb/rst').list.shown).toEqual(['wave_types_tb/clk', 'wave_types_tb/dut/count']);
  });

  test('a rerun keeps the student’s setup for the signals that still exist (FR-17)', () => {
    const own: ViewSetup = { ...toggleShown(setupFor(data, null, context), 'wave_types_tb/gone'), window: { start: 10, end: 20 }, cursor: 15 };
    const again = setupFor(data, toMemory(own), context);
    expect(again.list.shown).toEqual(['wave_types_tb/clk', 'wave_types_tb/rst']);
    expect(again.window).toEqual({ start: 10, end: 20 });
    expect(again.cursor).toBe(15);
  });

  test('…but a run with an error opens at the error (W11)', () => {
    const memory = toMemory({ ...setupFor(data, null, context), window: { start: 10, end: 20 } });
    const again = setupFor(data, memory, { ...context, moments: { firstError: { fs: 100e6, text: 'bad' } } });
    expect(again.cursor).toBe(100e6);
    expect(again.window.start).toBeLessThan(100e6);
  });
});

describe('bits of a vector', () => {
  test('named by their index in the declared range', () => {
    expect([0, 3].map((p) => bitIndex(vector(4, { left: 3, right: 0 }), p))).toEqual([3, 0]);
    expect([0, 3].map((p) => bitIndex(vector(4, { left: 0, right: 3 }), p))).toEqual([0, 3]);
    expect(bitIndex(vector(4), 0)).toBe(3);
    expect(bitSignal(vector(4, { left: 7, right: 4 }), 1)).toMatchObject({ name: 'q[6]', kind: 'logic', width: 1 });
  });
});

describe('the cursor keys', () => {
  const a = trace([[0, '0'], [10, '1'], [30, '0']]);
  const b = trace([[0, '0'], [20, '1']]);

  test('the next and previous change among the stepped traces', () => {
    expect(changeFrom([a, b], 10, 'next')).toBe(20);
    expect(changeFrom([a, b], 25, 'previous')).toBe(20);
    expect(changeFrom([a], 30, 'next')).toBeUndefined();
  });

  test('Shift moves by a hundredth of the window, never before 0', () => {
    expect(fineStep(500, 1000, 'next')).toBe(510);
    expect(fineStep(5, 1000, 'previous')).toBe(0);
  });
});

describe('the tooltip', () => {
  const row = (signal: SignalRef, t: Trace): TraceRow => ({ kind: 'trace', path: 'tb/x', label: signal.name, signal, trace: t, depth: 1, tone: 'testbench', expandable: false, expanded: false });

  test('a short vector in hex and decimal, with the time', () => {
    expect(traceLines({ row: row(vector(8), trace([[0, '00001011']])), time: 5e6, tickFs: 1 }, 'hex')).toEqual(['q = 0x0B = 11', 'at 5.000 ns']);
  });

  test('U explained; before the first change, no value yet', () => {
    const bit: SignalRef = { name: 'b', trace: 0, kind: 'logic', width: 1 };
    expect(traceLines({ row: row(bit, trace([[10, 'U']])), time: 20, tickFs: 1 }, 'hex')[2]).toMatch(/never been given a value/);
    expect(traceLines({ row: row(bit, trace([[10, 'U']])), time: 5, tickFs: 1 }, 'hex')[0]).toBe('b: no value yet');
  });
});

describe('where a signal is declared', () => {
  const data = parseGhw(fixtureBytes('wave_types.ghw'));

  test('a record field is declared with its record', () => {
    expect(declarationOf(data, 'wave_types_tb/pair/a')).toEqual({ scopes: ['wave_types_tb'], name: 'pair' });
    expect(declarationOf(data, 'wave_types_tb/dut/count')).toEqual({ scopes: ['wave_types_tb', 'dut'], name: 'count' });
  });
});

describe('picking up the cursor', () => {
  // 1000 ticks over 1000 px: the cursor at tick 400 stands at x = 400.
  const at = { view: viewOf(0, 1000, 1000), cursor: 400 };

  test('on the ruler anywhere, and on or beside the line in the traces', () => {
    expect(takesCursor(at, 900, AXIS_HEIGHT - 1)).toBe(true);
    expect(takesCursor(at, 400, 200)).toBe(true);
    expect(takesCursor(at, 400 + CURSOR_GRAB_PX, 200)).toBe(true);
    expect(takesCursor(at, 400 - CURSOR_GRAB_PX - 1, 200)).toBe(false);
  });
});
