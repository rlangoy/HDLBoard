// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The figure in report mode (docs/waveform_viewer_spec.md § 8.8), drawn from the view as
 * it changes. Both widths are shown at one scale – the one that fits two columns in the
 * pane – so switching to two columns visibly widens the figure. The mouse chooses what
 * it shows: the wheel scrolls in time, Ctrl + wheel zooms, dragging pans and a click
 * places the cursor.
 */

import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { Ticks } from '../model';
import { useElementSize } from '../domHooks';
import { FIGURE_WIDTH_MM, ptFromMm } from './figureStyle';
import type { Figure } from './figureSvg';

export interface PreviewHandlers {
  onScroll(ticks: number): void;
  onZoom(factor: number, at: Ticks): void;
  onCursor(time: Ticks): void;
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

function timeAt({ scale, figure }: ScreenMapping, x: number): Ticks {
  const { tracesLeft, view } = figure.layout;
  return view.start + (x / scale - tracesLeft) * view.ticksPerPx;
}

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

/** Dragging pans the figure under the mouse; a click places the cursor. */
function usePan(mapping: ScreenMapping, handlers: PreviewHandlers) {
  const press = useRef<{ startX: number; lastX: number; dragging: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const x = localX(event, event.currentTarget);
    press.current = { startX: x, lastX: x, dragging: false };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = press.current;
    if (current === null) return;
    const x = localX(event, event.currentTarget);
    current.dragging ||= Math.abs(x - current.startX) >= DRAG_THRESHOLD_PX;
    if (!current.dragging) return;
    setDragging(true);
    handlers.onScroll((current.lastX - x) * ticksPerScreenPx(mapping));
    current.lastX = x;
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = press.current;
    press.current = null;
    setDragging(false);
    if (current !== null && !current.dragging) handlers.onCursor(timeAt(mapping, localX(event, event.currentTarget)));
  };
  return { dragging, onPointerDown, onPointerMove, onPointerUp };
}

export function ReportPreview({ figure, handlers }: { readonly figure: Figure; readonly handlers: PreviewHandlers }) {
  const [area, setArea] = useState<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const room = Math.max(0, useElementSize(area).width - 2 * PREVIEW_PAD_PX);
  const mapping: ScreenMapping = { scale: Math.min(MAX_PX_PER_PT, room / WIDEST_FIGURE_PT) || 1, figure };
  useWheel(pageRef, mapping, handlers);
  const { dragging, ...pointer } = usePan(mapping, handlers);
  return (
    <div className="wv-report" ref={setArea}>
      <div
        ref={pageRef}
        className={dragging ? 'wv-report__page is-dragging' : 'wv-report__page'}
        style={{ width: figure.layout.width * mapping.scale }}
        title="Scroll or drag to move in time, Ctrl + scroll to zoom, click to place the cursor"
        // The figure is SVG this app wrote itself, with every name escaped.
        dangerouslySetInnerHTML={{ __html: figure.svg }}
        {...pointer}
      />
    </div>
  );
}
