// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { cx } from '../board';
import { isOverflowing, scrollPerThumbPixel, thumbGeometry, type ScrollMetrics } from './scrollThumb';
import './OverlayScrollbar.css';

export type Axis = 'x' | 'y';

export interface BothAxes {
  x: ScrollMetrics;
  y: ScrollMetrics;
}

/** Thickness of the bar, and the side of each (hover-only) arrow button: keep in step with OverlayScrollbar.css. */
export const SCROLLBAR_PX = 14;
/** How far one arrow click scrolls — about two lines of code or one file row. */
const ARROW_STEP_PX = 40;
/** Holding an arrow repeats, like a native scrollbar: first after a pause, then steadily. */
const REPEAT_DELAY_MS = 350;
const REPEAT_EVERY_MS = 60;

const EMPTY: ScrollMetrics = { position: 0, contentSize: 0, viewSize: 0 };

function readMetrics(el: HTMLElement): BothAxes {
  return {
    x: { position: el.scrollLeft, contentSize: el.scrollWidth, viewSize: el.clientWidth },
    y: { position: el.scrollTop, contentSize: el.scrollHeight, viewSize: el.clientHeight },
  };
}

/** Calls `onChange` whenever `element` scrolls or resizes; returns the undo. */
function watch(element: HTMLElement, onChange: () => void): () => void {
  const observer = new ResizeObserver(onChange);
  observer.observe(element);
  element.addEventListener('scroll', onChange, { passive: true });
  return () => {
    observer.disconnect();
    element.removeEventListener('scroll', onChange);
  };
}

const sameAxis =(a: ScrollMetrics, b: ScrollMetrics) =>
  a.position === b.position && a.contentSize === b.contentSize && a.viewSize === b.viewSize;

/**
 * Tracks an element's scroll position and sizes on both axes: on scroll, on resize,
 * and after every render of the caller (which is when its content changes).
 */
export function useScrollMetrics(targetRef: RefObject<HTMLElement>): BothAxes {
  const [metrics, setMetrics] = useState<BothAxes>({ x: EMPTY, y: EMPTY });

  const measure = useCallback(() => {
    const el = targetRef.current;
    if (!el) return;
    const next = readMetrics(el);
    setMetrics((prev) => (sameAxis(prev.x, next.x) && sameAxis(prev.y, next.y) ? prev : next));
  }, [targetRef]);

  // Checked after every render rather than once: the target can appear later (the
  // editor's textarea exists only while a tab is open) or be replaced.
  const attached = useRef<{ element: HTMLElement; detach: () => void } | null>(null);
  useEffect(() => {
    const element = targetRef.current;
    if (attached.current?.element !== element) {
      attached.current?.detach();
      attached.current = element ? { element, detach: watch(element, measure) } : null;
    }
    measure();
  });
  useEffect(() => () => attached.current?.detach(), []);

  return metrics;
}

const scrollKey = (axis: Axis) => (axis === 'y' ? 'top' : 'left');
const pointerCoord = (axis: Axis, e: { clientX: number; clientY: number }) => (axis === 'y' ? e.clientY : e.clientX);

function Arrow({ axis, direction, onStep }: { axis: Axis; direction: -1 | 1; onStep: (direction: -1 | 1) => void }) {
  const timer = useRef<number | null>(null);
  const stopRepeat = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stopRepeat, []);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation(); // not a click on the track
    onStep(direction);
    const repeat = () => {
      onStep(direction);
      timer.current = window.setTimeout(repeat, REPEAT_EVERY_MS);
    };
    timer.current = window.setTimeout(repeat, REPEAT_DELAY_MS);
  };

  const points =
    axis === 'y'
      ? direction < 0 ? '1,6 5,2 9,6' : '1,3 5,7 9,3'
      : direction < 0 ? '6,1 2,5 6,9' : '3,1 7,5 3,9';
  return (
    <div
      className={cx('wb-scrollbar__arrow', direction < 0 ? 'wb-scrollbar__arrow--start' : 'wb-scrollbar__arrow--end')}
      onPointerDown={handlePointerDown}
      onPointerUp={stopRepeat}
      onPointerLeave={stopRepeat}
      onPointerCancel={stopRepeat}
    >
      <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
        <polygon points={points} />
      </svg>
    </div>
  );
}

export interface OverlayScrollbarProps {
  targetRef: RefObject<HTMLElement>;
  axis: Axis;
  metrics: ScrollMetrics;
  /** The bar stops this far short of its far end — the corner where the other axis' bar runs. */
  endInset?: number;
}

/**
 * A Visual Studio–style scrollbar drawn over a scrolling element whose own native bar
 * is hidden. Idle it is just a thin rounded thumb; with the pointer over it (or while
 * dragging) the thumb widens and a track and arrow buttons appear. The thumb drags,
 * a click on the track pages, and an arrow held down keeps scrolling. Renders nothing
 * while the content fits. The wheel, touch and keyboard scroll the element natively.
 */
export function OverlayScrollbar({ targetRef, axis, metrics, endInset = 0 }: OverlayScrollbarProps) {
  const [dragging, setDragging] = useState(false);
  if (!isOverflowing(metrics)) return null;

  const trackLength = Math.max(0, metrics.viewSize - endInset - 2 * SCROLLBAR_PX);
  const thumb = thumbGeometry(metrics, trackLength);

  const scrollBy = (delta: number, smooth: boolean) =>
    targetRef.current?.scrollBy({ [scrollKey(axis)]: delta, behavior: smooth ? 'smooth' : 'auto' });

  const handleThumbPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = targetRef.current;
    if (e.button !== 0 || !el) return;
    e.preventDefault();
    e.stopPropagation(); // not a click on the track
    const handle = e.currentTarget;
    const start = pointerCoord(axis, e);
    const startScroll = axis === 'y' ? el.scrollTop : el.scrollLeft;
    const ratio = scrollPerThumbPixel(metrics, trackLength);
    handle.setPointerCapture(e.pointerId);
    setDragging(true);

    const onMove = (ev: PointerEvent) => {
      const next = startScroll + (pointerCoord(axis, ev) - start) * ratio;
      if (axis === 'y') el.scrollTop = next;
      else el.scrollLeft = next;
    };
    const onUp = () => {
      setDragging(false);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  // A click on the track before or after the thumb pages by one view, like a native bar.
  const handleTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const along = pointerCoord(axis, e) - (axis === 'y' ? rect.top : rect.left) - SCROLLBAR_PX;
    scrollBy((along < thumb.offset ? -1 : 1) * metrics.viewSize, true);
  };

  const thumbStyle =
    axis === 'y'
      ? { top: SCROLLBAR_PX + thumb.offset, height: thumb.length }
      : { left: SCROLLBAR_PX + thumb.offset, width: thumb.length };

  return (
    <div
      className={cx('wb-scrollbar', `wb-scrollbar--${axis}`, dragging && 'is-dragging')}
      style={axis === 'y' ? { bottom: endInset } : { right: endInset }}
      aria-hidden="true"
      onPointerDown={handleTrackPointerDown}
    >
      <Arrow axis={axis} direction={-1} onStep={(d) => scrollBy(d * ARROW_STEP_PX, false)} />
      <div className="wb-scrollbar__thumb" style={thumbStyle} onPointerDown={handleThumbPointerDown} />
      <Arrow axis={axis} direction={1} onStep={(d) => scrollBy(d * ARROW_STEP_PX, false)} />
    </div>
  );
}

export default OverlayScrollbar;
