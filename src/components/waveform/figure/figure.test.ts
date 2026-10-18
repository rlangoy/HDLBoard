// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { crc32 } from '../../workbench/zip';
import type { SignalKind, SignalRef, Trace } from '../model';
import type { TraceRow } from '../signalRows';
import { WHITE_BACKGROUND_COLORS } from './figure.testSupport';
import { figureRows, type FigureContent, type FigureRow, type MeasureText } from './figureContent';
import { figureLayout } from './figureLayout';
import { withResolution } from './figurePng';
import { DEFAULT_REPORT_OPTIONS, reportLook, type FigureLook } from './figureStyle';
import { waveformFigure } from './figureSvg';
import { screenLook } from './screenLook';

/** About Arial's average letter width: close enough for layout. */
const measure: MeasureText = (text, font) => text.length * font.size * 0.55;

const NS = 1e6;

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

const report = (options = {}): FigureLook => reportLook({ ...DEFAULT_REPORT_OPTIONS, ...options });

const clk = row('clk', 'logic', [
  [0, '0'],
  [10, '1'],
  [20, '0'],
  [30, '1'],
]);

describe('report figure', () => {
  it('is sized in millimetres at an IEEE width, with its drawing in points', () => {
    const { svg } = waveformFigure(content([clk]), report(), measure);
    expect(svg).toContain('width="88.90mm"');
    expect(waveformFigure(content([clk]), report({ width: 'page' }), measure).svg).toContain('width="182.00mm"');
    expect(svg).toMatch(/viewBox="0 0 252\.\d\d /);
  });

  it('draws its PNG at 600 dpi at the printed size', () => {
    const figure = waveformFigure(content([clk]), report(), measure);
    expect(figure.pixelWidth).toBe(Math.round((88.9 / 25.4) * 600));
  });

  it('names the unit in the axis title and writes bare numbers on the ticks', () => {
    const layout = figureLayout(content([clk]), report(), measure);
    expect(layout.axisTitle?.text).toBe('Time (ns)');
    expect(layout.ticks.map((tick) => tick.label)).toEqual(['0', '10', '20', '30', '40']);
  });

  it('keeps tick labels apart and never writes more than fifteen', () => {
    const long = content([clk], 123_456);
    for (const width of ['column', 'page'] as const) {
      const look = report({ width });
      const { ticks } = figureLayout(long, look, measure);
      expect(ticks.length).toBeLessThanOrEqual(15);
      for (let i = 1; i < ticks.length; i++) {
        const room = ticks[i].x - ticks[i - 1].x;
        expect(room).toBeGreaterThan((measure(ticks[i].label, look.axisFont) + measure(ticks[i - 1].label, look.axisFont)) / 2);
      }
    }
  });

  it('gives every row the same height', () => {
    const { rowTops } = figureLayout(content([clk, clk, clk]), report(), measure);
    expect(rowTops[1] - rowTops[0]).toBe(rowTops[2] - rowTops[1]);
  });

  it('draws Z at mid-level and X hatched, unlike 0 and 1', () => {
    const look = report();
    const bit = row('oe', 'logic', [
      [0, 'Z'],
      [20, 'X'],
    ]);
    const { svg } = waveformFigure(content([bit]), look, measure);
    const top = figureLayout(content([bit]), look, measure).rowTops[0];
    const mid = top + look.rowHeight / 2;
    expect(svg).toMatch(new RegExp(`M[\\d.]+ ${mid}H`));
    // The hatch is thin lines inside the X box.
    expect(svg).toContain(`stroke-width="${look.gridLine}"`);
  });

  it('centres a bus value between its crossings, and leaves it out where it does not fit', () => {
    const bus = row('count', 'vector', [
      [0, '00000001'],
      [20, '00000010'],
      [20.2, '00000011'],
    ]);
    const { svg } = waveformFigure(content([bus]), report(), measure);
    expect(svg).toContain('>0x01</text>');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).not.toContain('>0x02</text>');
  });

  it('escapes names so the SVG stays valid', () => {
    const { svg } = waveformFigure(content([row('a<b>&', 'logic', [[0, '1']])]), report(), measure);
    expect(svg).toContain('a&lt;b&gt;&amp;');
  });

  it('draws the cursor only when asked', () => {
    expect(waveformFigure(content([clk]), report(), measure).svg).not.toContain('stroke-dasharray="3 2"');
    expect(waveformFigure(content([clk]), report({ showCursor: true }), measure).svg).toContain('stroke-dasharray="3 2"');
  });
});

describe('report style', () => {
  it('uses 9 pt text, 1 pt traces and no line under 0.5 pt', () => {
    const look = report();
    expect(look.nameFont.size).toBe(9);
    expect(look.traceLine).toBeGreaterThanOrEqual(1);
    expect(Math.min(look.traceLine, look.markerLine, look.gridLine)).toBeGreaterThanOrEqual(0.5);
  });

  it('is black on white unless colour is chosen', () => {
    const { palette } = report();
    expect([palette.ink.testbench, palette.ink.rtl, palette.undefined, palette.highZ]).toEqual(['#000000', '#000000', '#000000', '#000000']);
  });

  it('keeps every colour dark enough to print as a clear line in grayscale', () => {
    const { palette } = report({ colouring: 'colour' });
    for (const color of [palette.ink.testbench, palette.ink.rtl, palette.enumInk, palette.undefined, palette.highZ, palette.cursor]) {
      expect(grayLevel(color)).toBeLessThan(0.5);
    }
  });
});

describe('screen copy', () => {
  const look = screenLook(WHITE_BACKGROUND_COLORS, { namesWidth: 260, tracesWidth: 600 }, 'Consolas');

  it('is the on-screen size in pixels, the axis on top with units on its labels', () => {
    const { svg } = waveformFigure(content([clk]), look, measure);
    expect(svg).toContain('width="860px"');
    const layout = figureLayout(content([clk]), look, measure);
    expect(layout.axisTitle).toBeUndefined();
    expect(layout.ticks[1].label).toMatch(/ ns$/);
    expect(layout.rowTops[0]).toBeGreaterThanOrEqual(layout.axisY);
  });

  it('lists each value at the cursor beside its name', () => {
    expect(waveformFigure(content([clk]), look, measure).svg).toContain('text-anchor="end"');
  });
});

describe('figure content', () => {
  it('stops the traces where the run ended, keeping the axis across the window', () => {
    const look = report();
    const figure = waveformFigure({ ...content([clk], 80), runEnd: 40 }, look, measure);
    const { tracesLeft, tracesRight } = figure.layout;
    const runEndX = tracesLeft + (tracesRight - tracesLeft) / 2;
    const xs = [...figure.svg.matchAll(/H([\d.]+)/g)].map((m) => Number(m[1]));
    const traceEnds = xs.filter((x) => x < tracesRight - 1);
    expect(Math.max(...traceEnds)).toBeCloseTo(runEndX, 1);
    expect(figure.layout.ticks[figure.layout.ticks.length - 1].label).toBe('80');
  });

  it('names a signal by its place in the design when two rows share a name', () => {
    const traceRow = (path: string): TraceRow =>
      ({ kind: 'trace', path, label: 'clk', signal: clk.signal, trace: clk.trace, depth: 0, tone: 'rtl', expandable: false, expanded: false }) as TraceRow;
    const rows = figureRows([traceRow('tb/clk'), traceRow('tb/dut/clk')], () => 'hex');
    expect(rows.map((r) => r.label)).toEqual(['clk', 'dut.clk']);
  });
});

describe('PNG resolution', () => {
  it('records the resolution in a pHYs chunk right after IHDR', () => {
    const png = new Uint8Array(33 + 12);
    const result = withResolution(png, 600);
    const view = new DataView(result.buffer);
    expect(String.fromCharCode(...result.subarray(37, 41))).toBe('pHYs');
    expect(view.getUint32(41)).toBe(Math.round(600 / 0.0254));
    expect(view.getUint32(50)).toBe(crc32(result.subarray(37, 50)));
    expect(result.length).toBe(png.length + 21);
  });
});

/** The gray a colour prints as, from 0 (black) to 1 (white). */
function grayLevel(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
