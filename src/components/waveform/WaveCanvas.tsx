// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The traces (docs/waveform_viewer_spec.md § 8.5): one canvas, sized to the device's
 * pixel ratio and to the visible part of the list, redrawn on `requestAnimationFrame`
 * after a change of view, cursor or data – never per change in the file. The gestures
 * are the familiar ones (S9): the wheel scrolls in time, Ctrl + wheel zooms around the
 * mouse, a click places the cursor, a double-click on a bus zooms to that value.
 */

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { visibleSpans } from './levelOfDetail';
import type { Ticks, WaveformData } from './model';
import { formatValue, type ShowAs } from './radix';
import type { Row, SignalPath } from './signalRows';
import { formatCursorFs, timeToX, xToTime, type TimeView } from './timeAxis';
import { spanAt, valueAt } from './valueAt';
import { valueHelp } from './valueHelp';
import { AXIS_HEIGHT, drawAxis, drawRow, drawVerticalLine, readColors, ROW_HEIGHT } from './waveDraw';

/** How close to the error marker the mouse must be to show its message. */
const MARKER_HOVER_PX = 4;
const BOTH_RADIXES_MAX_WIDTH = 16;
const WHEEL_ZOOM_RATE = 0.002;

export interface WaveCanvasProps {
  readonly data: WaveformData;
  readonly rows: readonly Row[];
  readonly view: TimeView;
  readonly width: number;
  /** The visible height of the list, and how far it is scrolled. */
  readonly height: number;
  readonly scrollTop: number;
  readonly cursor: Ticks;
  readonly error?: { readonly time: Ticks; readonly text: string };
  readonly stale: boolean;
  readonly showAsOf: (path: SignalPath) => ShowAs;
  onCursor(time: Ticks): void;
  /** Scroll by `ticks`; zoom by `factor` around `at`. */
  onScroll(ticks: number): void;
  onZoom(factor: number, at: Ticks): void;
  onZoomTo(start: Ticks, end: Ticks): void;
}

interface Hover {
  readonly x: number;
  readonly y: number;
  readonly lines: readonly string[];
}

export function WaveCanvas(props: WaveCanvasProps) {
  const { data, rows, view, width, height, scrollTop, cursor, error, stale, showAsOf } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || width <= 0 || height <= 0) return;
    const frame = requestAnimationFrame(() => {
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      const ctx = canvas.getContext('2d');
      if (ctx === null) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const colors = readColors(canvas);
      ctx.fillStyle = colors.background;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = stale ? 0.45 : 1;
      const from = view.start;
      const to = xToTime(view, width);
      const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
      const last = Math.min(rows.length, Math.ceil((scrollTop + height - AXIS_HEIGHT) / ROW_HEIGHT) + 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, AXIS_HEIGHT, width, height - AXIS_HEIGHT);
      ctx.clip();
      for (let i = first; i < last; i++) {
        const row = rows[i];
        if (row.kind !== 'signal' || !row.shown) continue;
        const trace = data.traces.get(row.signal.trace);
        if (trace === undefined) continue;
        const y = AXIS_HEIGHT + i * ROW_HEIGHT - scrollTop;
        const spans = visibleSpans(trace, from, Math.min(to, data.endTime), view.ticksPerPx);
        drawRow(ctx, view, { signal: row.signal, trace, spans, showAs: showAsOf(row.path), y }, colors);
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      drawAxis(ctx, view, width, AXIS_HEIGHT, data.tickFs, colors);
      // The end of the recording: nothing is known past it.
      const endX = timeToX(view, data.endTime);
      if (endX < width) {
        ctx.fillStyle = colors.grid;
        ctx.globalAlpha = 0.35;
        ctx.fillRect(endX, AXIS_HEIGHT, width - endX, height - AXIS_HEIGHT);
        ctx.globalAlpha = 1;
      }
      if (error !== undefined) drawVerticalLine(ctx, timeToX(view, error.time), height, colors.errorMarker, 2);
      drawVerticalLine(ctx, timeToX(view, cursor), height, colors.cursor);
    });
    return () => cancelAnimationFrame(frame);
  }, [data, rows, view, width, height, scrollTop, cursor, error, stale, showAsOf]);

  // A native listener: React's wheel listeners are passive, and Ctrl + wheel must not zoom the page.
  const wheel = useRef({ view, onScroll: props.onScroll, onZoom: props.onZoom });
  wheel.current = { view, onScroll: props.onScroll, onZoom: props.onZoom };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const onWheel = (event: WheelEvent) => {
      const { view: now, onScroll, onZoom } = wheel.current;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const x = event.clientX - canvas.getBoundingClientRect().left;
        onZoom(Math.exp(event.deltaY * WHEEL_ZOOM_RATE), xToTime(now, x));
      } else {
        // The wheel scrolls in time (S9); the signal list has its own scrollbar.
        onScroll((Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * now.ticksPerPx);
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const rowAt = (y: number): Row | undefined => {
    if (y < AXIS_HEIGHT) return undefined;
    return rows[Math.floor((y - AXIS_HEIGHT + scrollTop) / ROW_HEIGHT)];
  };

  const local = (event: ReactMouseEvent) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  };

  const hoverLines = (x: number, y: number): string[] => {
    const time = xToTime(view, x);
    const at = `at ${formatCursorFs(time * data.tickFs)}`;
    if (error !== undefined && Math.abs(timeToX(view, error.time) - x) <= MARKER_HOVER_PX) return ['First error', error.text, at];
    const row = rowAt(y);
    if (row?.kind !== 'signal' || !row.shown) return [];
    const trace = data.traces.get(row.signal.trace);
    const raw = trace === undefined ? undefined : valueAt(trace, time);
    if (raw === undefined) return [`${row.signal.name}: no value yet`, at];
    // A short vector in both hexadecimal and decimal, so "Show as" is rarely needed (FR-23).
    const value =
      row.signal.kind === 'vector' && row.signal.width <= BOTH_RADIXES_MAX_WIDTH
        ? `${formatValue(row.signal, raw, 'hex')} = ${formatValue(row.signal, raw, 'decimal')}`
        : formatValue(row.signal, raw, showAsOf(row.path));
    const help = row.signal.kind === 'logic' || row.signal.kind === 'vector' ? valueHelp(raw) : undefined;
    return [`${row.signal.name} = ${value}`, at, ...(help ? [help] : [])];
  };

  const onMouseMove = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const { x, y } = local(event);
    const lines = hoverLines(x, y);
    setHover(lines.length === 0 ? null : { x, y, lines });
  };

  const onClick = (event: ReactMouseEvent<HTMLCanvasElement>) => props.onCursor(xToTime(view, local(event).x));

  const onDoubleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const { x, y } = local(event);
    const row = rowAt(y);
    if (row?.kind !== 'signal' || row.signal.kind === 'logic') return;
    const trace = data.traces.get(row.signal.trace);
    const span = trace === undefined ? undefined : spanAt(trace, xToTime(view, x), data.endTime);
    if (span !== undefined) props.onZoomTo(span.start, span.end);
  };


  return (
    <div className="wv-canvas" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="wv-canvas__surface"
        style={{ width, height }}
        aria-label="Waveform traces. The values at the cursor are listed beside the signal names."
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
      />
      {hover !== null && (
        <div className="wv-tooltip" role="tooltip" style={{ left: Math.min(hover.x + 14, Math.max(0, width - 320)), top: hover.y + 16 }}>
          {hover.lines.map((line, i) => (
            <div key={i} className={i === 0 ? 'wv-tooltip__value' : undefined}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
