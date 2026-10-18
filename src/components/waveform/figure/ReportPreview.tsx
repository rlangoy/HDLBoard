// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The figure in report mode (docs/waveform_viewer_spec.md § 8.8), drawn from the view as
 * it changes. Both widths are shown at one scale – the one that fits two columns in the
 * pane – so switching to two columns visibly widens the figure. The mouse works as in
 * the viewer: the wheel scrolls in time, Ctrl + wheel zooms, dragging across the figure
 * marks a range to zoom into and a click places the cursor. With the cursor shown, its
 * handle sits on a strip above the figure, outside it, where it is easy to grab and drag.
 */

import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { useElementSize } from '../domHooks';
import type { Ticks } from '../model';
import { formatCursorFs, formatFs, timeToX } from '../timeAxis';
import { FIGURE_WIDTH_MM, ptFromMm } from './figureStyle';
import type { Figure } from './figureSvg';

export interface PreviewHandlers {
  onScroll(ticks: number): void;
  onZoom(factor: number, at: Ticks): void;
  onZoomTo(start: Ticks, end: Ticks): void;
  onCursor(time: Ticks): void;
}

export interface ReportPreviewProps {
  readonly figure: Figure;
  /** The cursor, when it is shown; undefined hides its handle. */
  readonly cursor: Ticks | undefined;
  /** The femtoseconds in one tick, for the times written on the handle and a marked range. */
  readonly tickFs: number;
  readonly handlers: PreviewHandlers;
}

/** The space around the figure. */
const PREVIEW_PAD_PX = 24;
/** Never more than this many screen pixels per point, however wide the pane. */
const MAX_PX_PER_PT = 2.5;
const WHEEL_ZOOM_RATE = 0.002;
/** A press that moves less than this is a click, not a drag. */
const DRAG_THRESHOLD_PX = 4;
const WIDEST_FIGURE_PT = ptFromMm(FIGURE_WIDTH_MM.page);

/** Screen pixels ↔ time across the figure on screen. */
interface ScreenMapping {
  /** Screen pixels per drawing unit. */
  readonly scale: number;
  readonly figure: Figure;
}

/** The time at `x` screen pixels from the figure's left edge, kept inside the traces. */
function timeAt({ scale, figure }: ScreenMapping, x: number): Ticks {
  const { tracesLeft, tracesRight, view } = figure.layout;
  const units = Math.min(tracesRight, Math.max(tracesLeft, x / scale));
  return view.start + (units - tracesLeft) * view.ticksPerPx;
}

const xOf = ({ scale, figure }: ScreenMapping, time: Ticks): number => (figure.layout.tracesLeft + timeToX(figure.layout.view, time)) * scale;

const ticksPerScreenPx = ({ scale, figure }: ScreenMapping): number => figure.layout.view.ticksPerPx / scale;

const localX = (event: { clientX: number }, element: Element): number => event.clientX - element.getBoundingClientRect().left;

/** The wheel, as a native listener: React's are passive, and Ctrl + wheel must not zoom the page. */
function useWheel(ref: RefObject<HTMLDivElement>, mapping: ScreenMapping, handlers: PreviewHandlers): void {
  const latest = useRef({ mapping, handlers });
  latest.current = { mapping, handlers };
  useEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    const onWheel = (event: WheelEvent) => {
      const { mapping: now, handlers: on } = latest.current;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) on.onZoom(Math.exp(event.deltaY * WHEEL_ZOOM_RATE), timeAt(now, localX(event, element)));
      else on.onScroll((Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * ticksPerScreenPx(now));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [ref]);
}

interface Selection {
  readonly from: Ticks;
  readonly to: Ticks;
}

/** Dragging across the figure marks a range, zoomed into on release; a click places the cursor. */
function useRangeSelection(mapping: ScreenMapping, handlers: PreviewHandlers) {
  const press = useRef<{ readonly x: number; dragging: boolean } | null>(null);
  const [selection, setSelection] = useState<Selection | undefined>(undefined);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { x: localX(event, event.currentTarget), dragging: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = press.current;
    if (current === null) return;
    const x = localX(event, event.currentTarget);
    current.dragging ||= Math.abs(x - current.x) >= DRAG_THRESHOLD_PX;
    if (current.dragging) setSelection({ from: timeAt(mapping, current.x), to: timeAt(mapping, x) });
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = press.current;
    press.current = null;
    setSelection(undefined);
    if (current === null) return;
    const time = timeAt(mapping, localX(event, event.currentTarget));
    if (!current.dragging) return handlers.onCursor(time);
    const [start, end] = [timeAt(mapping, current.x), time].sort((a, b) => a - b);
    if (end > start) handlers.onZoomTo(start, end);
  };
  return { selection, onPointerDown, onPointerMove, onPointerUp };
}

/** The marked range over the figure, with how long it is: what the view will show. */
function SelectionBand({ selection, mapping, tickFs }: { readonly selection: Selection; readonly mapping: ScreenMapping; readonly tickFs: number }) {
  const [x0, x1] = [xOf(mapping, selection.from), xOf(mapping, selection.to)].sort((a, b) => a - b);
  return (
    <div className="wv-report__selection" style={{ left: x0, width: x1 - x0 }}>
      <span>{formatFs(Math.abs(selection.to - selection.from) * tickFs)}</span>
    </div>
  );
}

/** Whether `time` is inside the time the figure shows. */
function inView({ figure }: ScreenMapping, time: Ticks): boolean {
  const { view, tracesLeft, tracesRight } = figure.layout;
  const x = timeToX(view, time);
  return x >= 0 && x <= tracesRight - tracesLeft;
}

/**
 * The strip above the figure with the cursor's handle: press or drag anywhere on it to
 * move the cursor. The handle is left out while the cursor is outside the time shown.
 */
function CursorRuler({ time, tickFs, mapping, onCursor }: { readonly time: Ticks; readonly tickFs: number; readonly mapping: ScreenMapping; readonly onCursor: (time: Ticks) => void }) {
  const moving = useRef(false);
  const moveTo = (event: PointerEvent<HTMLDivElement>) => onCursor(timeAt(mapping, localX(event, event.currentTarget)));
  const label = formatCursorFs(time * tickFs, ticksPerScreenPx(mapping) * tickFs);
  return (
    <div
      className="wv-report__ruler"
      title="Drag the cursor to move it"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        moving.current = true;
        moveTo(event);
      }}
      onPointerMove={(event) => moving.current && moveTo(event)}
      onPointerUp={() => (moving.current = false)}
    >
      {inView(mapping, time) && (
        <span className="wv-report__handle" style={{ left: xOf(mapping, time) }}>
          {label}
        </span>
      )}
    </div>
  );
}

export function ReportPreview({ figure, cursor, tickFs, handlers }: ReportPreviewProps) {
  const [area, setArea] = useState<HTMLDivElement | null>(null);
  const figureRef = useRef<HTMLDivElement>(null);
  const room = Math.max(0, useElementSize(area).width - 2 * PREVIEW_PAD_PX);
  const mapping: ScreenMapping = { scale: Math.min(MAX_PX_PER_PT, room / WIDEST_FIGURE_PT) || 1, figure };
  useWheel(figureRef, mapping, handlers);
  const { selection, ...pointer } = useRangeSelection(mapping, handlers);
  return (
    <div className="wv-report" ref={setArea}>
      <div className="wv-report__sheet" style={{ width: figure.layout.width * mapping.scale }}>
        {cursor !== undefined && <CursorRuler time={cursor} tickFs={tickFs} mapping={mapping} onCursor={handlers.onCursor} />}
        <div ref={figureRef} className="wv-report__figure" title="Scroll to move in time, Ctrl + scroll to zoom, drag across to zoom into that part" {...pointer}>
          {/* The figure is SVG this app wrote itself, with every name escaped. */}
          <div className="wv-report__page" dangerouslySetInnerHTML={{ __html: figure.svg }} />
          {selection !== undefined && <SelectionBand selection={selection} mapping={mapping} tickFs={tickFs} />}
        </div>
      </div>
    </div>
  );
}
