// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { crc32 } from '../../workbench/zip';
import type { SignalKind, SignalRef, Trace } from '../model';
import type { TraceRow } from '../signalRows';
import { AXIS_FONT, BUS_SLOPE, TRACE_PAD, TRACE_WIDTH, VALUE_FONT } from '../waveDraw';
import { WHITE_BACKGROUND_COLORS } from './figure.testSupport';
import { figureRows, type FigureContent, type FigureRow, type MeasureText } from './figureContent';
import { figureLayout } from './figureLayout';
import { withResolution } from './figurePng';
import { DEFAULT_COLOURING, OPENING_WIDTH, reportLook, type FigureLook } from './figureStyle';
import { waveformFigure } from './figureSvg';
import { screenLook } from './screenLook';

/** About Arial's average letter width: close enough for layout. */
const measure: MeasureText = (text, font) => text.length * font.size * 0.55;

const NS = 1e6;
const BLACK = '#000000';
const LIST_NAME_FONT = { family: 'system-ui', size: 13 };

function trace(changes: ReadonlyArray<readonly [number, string]>): Trace {
  const values = [...new Set(changes.map(([, value]) => value))];
  return {
    times: Float64Array.from(changes.map(([time]) => time)),
    valueIndex: Uint32Array.from(changes.map(([, value]) => values.indexOf(value))),
    values,
  };
}

function row(label: string, kind: SignalKind, changes: ReadonlyArray<readonly [number, string]>): FigureRow {
  const signal: SignalRef = { name: label, trace: 0, kind, width: kind === 'logic' ? 1 : 8 };
  return { label, signal, trace: trace(changes), showAs: 'hex', tone: 'testbench' };
}

function content(rows: readonly FigureRow[], end = 40): FigureContent {
  return { rows, start: 0, end, runEnd: end, tickFs: NS, cursor: 20 };
}

const report = (options = {}): FigureLook => reportLook({ width: 'column', colouring: DEFAULT_COLOURING, showCursor: false, ...options });
const svgOf = (rows: readonly FigureRow[], look = report()): string => waveformFigure(content(rows), look, measure).svg;

const clk = row('clk', 'logic', [
  [0, '0'],
  [10, '1'],
  [20, '0'],
  [30, '1'],
]);

/** The hatch lines of X boxes: thin black paths, which only hatching draws in the report look. */
function hatchPaths(svg: string): string[] {
  return [...svg.matchAll(/<path d="([^"]+)" fill="none" stroke="#000000" stroke-width="0.5"\/>/g)].map((match) => match[1]);
}

/** The smallest room between two neighbouring tick labels, after the labels themselves. */
function tightestLabelGap(look: FigureLook): number {
  const { ticks } = figureLayout(content([clk], 123_456), look, measure);
  const half = (index: number) => measure(ticks[index].label, look.fonts.axis) / 2;
  const gaps = ticks.slice(1).map((tick, i) => tick.x - ticks[i].x - half(i) - half(i + 1));
  return Math.min(...gaps);
}

/** The gray a colour prints as, from 0 (black) to 1 (white). */
function grayLevel(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('report figure size', () => {
  it('opens two IEEE columns wide', () => {
    expect(svgOf([clk], report({ width: OPENING_WIDTH }))).toContain('width="182.00mm"');
  });

  it('is one IEEE column wide when chosen', () => {
    expect(svgOf([clk])).toContain('width="88.90mm"');
  });

  it('is two IEEE columns wide when chosen', () => {
    expect(svgOf([clk], report({ width: 'page' }))).toContain('width="182.00mm"');
  });

  it('is drawn in points', () => {
    expect(svgOf([clk])).toMatch(/viewBox="0 0 252\.\d\d /);
  });

  it('draws its PNG at 600 dpi at the printed size', () => {
    expect(waveformFigure(content([clk]), report(), measure).pixelWidth).toBe(Math.round((88.9 / 25.4) * 600));
  });
});

describe('report time axis', () => {
  it('names the unit in its title', () => {
    expect(figureLayout(content([clk]), report(), measure).axisTitle?.text).toBe('Time (ns)');
  });

  it('writes bare numbers on the ticks', () => {
    expect(figureLayout(content([clk]), report(), measure).ticks.map((tick) => tick.label)).toEqual(['0', '10', '20', '30', '40']);
  });

  it.each(['column', 'page'] as const)('keeps tick labels apart at %s width', (width) => {
    expect(tightestLabelGap(report({ width }))).toBeGreaterThan(0);
  });

  it('never writes more than fifteen labels across two columns', () => {
    expect(figureLayout(content([clk], 123_456), report({ width: 'page' }), measure).ticks.length).toBeLessThanOrEqual(15);
  });
});

describe('report traces', () => {
  it('gives every row the same height', () => {
    const { rowTops } = figureLayout(content([clk, clk, clk]), report(), measure);
    expect(rowTops[1] - rowTops[0]).toBe(rowTops[2] - rowTops[1]);
  });

  it('draws Z at mid-level', () => {
    const look = report();
    const highZ = row('oe', 'logic', [[0, 'Z']]);
    const mid = figureLayout(content([highZ]), look, measure).rowTops[0] + look.sizes.rowHeight / 2;
    expect(svgOf([highZ], look)).toMatch(new RegExp(`M[\\d.]+ ${mid}H`));
  });

  it('hatches an X', () => {
    const unknown = row('oe', 'logic', [[0, 'X']]);
    expect(hatchPaths(svgOf([unknown]))[0]?.split('M').length).toBeGreaterThan(3);
  });

  it('does not hatch 0 and 1', () => {
    expect(hatchPaths(svgOf([clk]))).toEqual([]);
  });

  it('stops the traces where the run ended', () => {
    const figure = waveformFigure({ ...content([clk], 80), runEnd: 40 }, report(), measure);
    const { tracesLeft, tracesRight } = figure.layout;
    const traceEnds = [...figure.svg.matchAll(/H([\d.]+)/g)].map((m) => Number(m[1])).filter((x) => x < tracesRight - 1);
    expect(Math.max(...traceEnds)).toBeCloseTo(tracesLeft + (tracesRight - tracesLeft) / 2, 1);
  });

  it('keeps the axis across the whole window after the run ended', () => {
    const { ticks } = figureLayout({ ...content([clk], 80), runEnd: 40 }, report(), measure);
    expect(ticks[ticks.length - 1].label).toBe('80');
  });

  it('escapes names so the SVG stays valid', () => {
    expect(svgOf([row('a<b>&', 'logic', [[0, '1']])])).toContain('a&lt;b&gt;&amp;');
  });
});

describe('report bus values', () => {
  const bus = row('count', 'vector', [
    [0, '00000001'],
    [20, '00000010'],
    [20.2, '00000011'],
  ]);

  it('are centred between the crossings', () => {
    expect(svgOf([bus])).toMatch(/text-anchor="middle"[^>]*>0x01<\/text>/);
  });

  it('are left out where they do not fit', () => {
    expect(svgOf([bus])).not.toContain('>0x02</text>');
  });
});

describe('report cursor', () => {
  it('is left out unless asked for', () => {
    expect(svgOf([clk])).not.toContain('stroke-dasharray="3 2"');
  });

  it('is a dashed line when asked for', () => {
    expect(svgOf([clk], report({ showCursor: true }))).toContain('stroke-dasharray="3 2"');
  });
});

describe('report style', () => {
  it('writes 9 pt text', () => {
    expect(report().fonts.name.size).toBe(9);
  });

  it('draws 1 pt traces', () => {
    expect(report().strokes.trace).toBe(1);
  });

  it('draws no line under 0.5 pt', () => {
    const { strokes } = report();
    expect(Math.min(strokes.trace, strokes.marker, strokes.grid)).toBeGreaterThanOrEqual(0.5);
  });

  it('is black on white unless colour is chosen', () => {
    const { palette } = report();
    expect(new Set([palette.ink.testbench, palette.ink.rtl, palette.undefined, palette.highZ])).toEqual(new Set([BLACK]));
  });

  it('keeps every colour dark enough to print as a clear line in grayscale', () => {
    const { palette } = report({ colouring: 'colour' });
    const colours = [palette.ink.testbench, palette.ink.rtl, palette.enumInk, palette.undefined, palette.highZ, palette.cursor];
    expect(Math.max(...colours.map(grayLevel))).toBeLessThan(0.5);
  });
});

describe('screen copy', () => {
  const look = screenLook(WHITE_BACKGROUND_COLORS, { namesWidth: 260, tracesWidth: 600, cursorShown: true }, LIST_NAME_FONT);
  const withoutCursor = screenLook(WHITE_BACKGROUND_COLORS, { namesWidth: 260, tracesWidth: 600, cursorShown: false }, LIST_NAME_FONT);

  it('is the on-screen size in pixels', () => {
    expect(svgOf([clk], look)).toContain('width="860px"');
  });

  it('has no axis title', () => {
    expect(figureLayout(content([clk]), look, measure).axisTitle).toBeUndefined();
  });

  it('writes the unit on each tick label', () => {
    expect(figureLayout(content([clk]), look, measure).ticks[1].label).toMatch(/ ns$/);
  });

  it('puts the axis above the rows', () => {
    const layout = figureLayout(content([clk]), look, measure);
    expect(layout.rowTops[0]).toBeGreaterThanOrEqual(layout.axisY);
  });

  it('lists each value at the cursor beside its name', () => {
    expect(svgOf([clk], look)).toContain('text-anchor="end"');
  });

  it('draws the cursor while the view shows it', () => {
    expect(svgOf([clk], look)).toContain(`stroke="${WHITE_BACKGROUND_COLORS.cursor}"`);
  });

  it('leaves out the cursor when the view hides it', () => {
    expect(svgOf([clk], withoutCursor)).not.toContain(`stroke="${WHITE_BACKGROUND_COLORS.cursor}"`);
  });

  it('leaves out the values at the cursor when the view hides it, keeping the Value head', () => {
    expect(svgOf([clk], withoutCursor).match(/text-anchor="end"/g)?.length).toBe(1);
  });

  it("draws with the canvas's own sizes", () => {
    expect([look.sizes.tracePad, look.sizes.busSlope, look.strokes.trace]).toEqual([TRACE_PAD, BUS_SLOPE, TRACE_WIDTH]);
  });

  it("writes with the canvas's own fonts and the list's name font", () => {
    expect([look.fonts.name, look.fonts.value, look.fonts.axis]).toEqual([LIST_NAME_FONT, VALUE_FONT, AXIS_FONT]);
  });
});

describe('figure content', () => {
  it('names a signal by its place in the design when two rows share a name', () => {
    const placed = { depth: 0, tone: 'rtl', expandable: false, expanded: false } as const;
    const traceRow = (path: string): TraceRow => ({ kind: 'trace', path, label: 'clk', signal: clk.signal, trace: clk.trace, ...placed });
    const rows = figureRows([traceRow('tb/clk'), traceRow('tb/dut/clk')], () => 'hex');
    expect(rows.map((r) => r.label)).toEqual(['clk', 'dut.clk']);
  });
});

describe('PNG resolution', () => {
  const PHYS_AT = 33 + 4;
  const result = withResolution(new Uint8Array(33 + 12), 600);
  const view = new DataView(result.buffer);

  it('adds a pHYs chunk right after IHDR', () => {
    expect(String.fromCharCode(...result.subarray(PHYS_AT, PHYS_AT + 4))).toBe('pHYs');
  });

  it('records 600 dpi as pixels per metre', () => {
    expect(view.getUint32(PHYS_AT + 4)).toBe(Math.round(600 / 0.0254));
  });

  it('gives the chunk a correct CRC', () => {
    expect(view.getUint32(PHYS_AT + 13)).toBe(crc32(result.subarray(PHYS_AT, PHYS_AT + 13)));
  });

  it('grows the file by exactly one chunk', () => {
    expect(result.length).toBe(33 + 12 + 21);
  });
});
