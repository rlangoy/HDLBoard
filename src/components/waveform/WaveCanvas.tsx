// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The traces (docs/waveform_viewer_spec.md § 8.5): one canvas, sized to the device's
 * pixel ratio and to the visible part of the list, repainted on `requestAnimationFrame`
 * after a change of view, cursor or data – never per change in the file. Painting is in
 * `paintWaveform.ts`, the mouse in `useCanvasGestures.ts`, the tooltip's words in
 * `hoverInfo.ts`.
 */

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { errorMarkerLines, traceLines, type HoverPoint } from './hoverInfo';
import type { Ticks } from './model';
import { paintWaveform, rowIndexAt, type Scene } from './paintWaveform';
import type { TraceRow } from './signalRows';
import { timeToX, xToTime } from './timeAxis';
import { takesCursor, useCanvasGestures, type GestureHandlers, type PointerGestures } from './useCanvasGestures';
import { spanAt } from './valueAt';

/** How close to the error marker the mouse must be to show its message. */
const MARKER_HOVER_PX = 4;
const TOOLTIP_OFFSET_PX = 14;
const TOOLTIP_WIDTH_PX = 320;

export interface WaveCanvasProps {
  readonly scene: Omit<Scene, 'selection' | 'error'>;
  readonly error?: { readonly time: Ticks; readonly text: string };
  readonly handlers: GestureHandlers;
}

interface Hover {
  readonly x: number;
  readonly y: number;
  readonly lines: readonly string[];
}

/** Repaints after every render that changed the scene; at most once per frame. */
function usePaint(canvasRef: RefObject<HTMLCanvasElement>, scene: Scene): void {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || scene.size.width <= 0 || scene.size.height <= 0) return undefined;
    const frame = requestAnimationFrame(() => paintWaveform(canvas, scene));
    return () => cancelAnimationFrame(frame);
  });
}

function Tooltip({ hover, width }: { readonly hover: Hover; readonly width: number }) {
  const left = Math.min(hover.x + TOOLTIP_OFFSET_PX, Math.max(0, width - TOOLTIP_WIDTH_PX));
  return (
    <div className="wv-tooltip" role="tooltip" style={{ left, top: hover.y + TOOLTIP_OFFSET_PX }}>
      {hover.lines.map((line, i) => (
        <div key={i} className={i === 0 ? 'wv-tooltip__value' : undefined}>
          {line}
        </div>
      ))}
    </div>
  );
}

/** The shown row at canvas `y`, if any. */
function traceRowAt(scene: WaveCanvasProps['scene'], y: number): TraceRow | undefined {
  const index = rowIndexAt(scene, y);
  const row = index === undefined ? undefined : scene.rows[index];
  return row?.kind === 'trace' ? row : undefined;
}

function hoverLines({ scene, error }: WaveCanvasProps, x: number, y: number): string[] {
  const at: HoverPoint = { row: traceRowAt(scene, y), time: xToTime(scene.view, x), tickFs: scene.tickFs };
  if (error !== undefined && Math.abs(timeToX(scene.view, error.time) - x) <= MARKER_HOVER_PX) return errorMarkerLines(error.text, at);
  return at.row === undefined ? [] : traceLines(at, scene.showAsOf(at.row.path));
}

const local = (event: ReactMouseEvent) => {
  const box = event.currentTarget.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
};

/** The canvas's own mouse handling: the tooltip, selecting a row, zooming to a bus value. */
function useCanvasMouse(props: WaveCanvasProps, gestures: PointerGestures) {
  const { scene, handlers } = props;
  const [hover, setHover] = useState<Hover | null>(null);
  const [overCursor, setOverCursor] = useState(false);
  const onMouseMove = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const { x, y } = local(event);
    setOverCursor(takesCursor(scene, x, y));
    const lines = gestures.selection === undefined ? hoverLines(props, x, y) : [];
    setHover(lines.length === 0 ? null : { x, y, lines });
  };
  // A press on a trace also selects its signal, for the arrow keys.
  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const row = traceRowAt(scene, local(event).y);
    if (row !== undefined) handlers.onSelectRow(row.path);
    gestures.onPointerDown(event);
  };
  // A double-click on a bus zooms to that value (S9).
  const onDoubleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const { x, y } = local(event);
    const row = traceRowAt(scene, y);
    if (row === undefined || row.signal.kind === 'logic') return;
    const span = spanAt(row.trace, xToTime(scene.view, x), scene.endTime);
    if (span !== undefined) handlers.onZoomTo(span.start, span.end);
  };
  return { hover, overCursor, onMouseMove, onMouseLeave: () => setHover(null), onPointerDown, onDoubleClick };
}

export function WaveCanvas(props: WaveCanvasProps) {
  const { scene, error, handlers } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gestures = useCanvasGestures(canvasRef, scene, handlers);
  const mouse = useCanvasMouse(props, gestures);
  usePaint(canvasRef, { ...scene, error: error?.time, selection: gestures.selection });
  return (
    <div className="wv-canvas" style={{ height: scene.size.height }}>
      <canvas
        ref={canvasRef}
        className={mouse.overCursor ? 'wv-canvas__surface is-over-cursor' : 'wv-canvas__surface'}
        style={{ width: scene.size.width, height: scene.size.height }}
        aria-label="Waveform traces. The values at the cursor are listed beside the signal names."
        tabIndex={0}
        onPointerDown={mouse.onPointerDown}
        onPointerMove={gestures.onPointerMove}
        onPointerUp={gestures.onPointerUp}
        onDoubleClick={mouse.onDoubleClick}
        onMouseMove={mouse.onMouseMove}
        onMouseLeave={mouse.onMouseLeave}
      />
      {mouse.hover !== null && <Tooltip hover={mouse.hover} width={scene.size.width} />}
    </div>
  );
}
