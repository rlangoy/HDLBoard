// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { cx } from '../board';
import { isOverflowing, scrollPerThumbPixel, thumbGeometry, type ScrollMetrics } from './scrollThumb';
import './ScrollArea.css';

export interface ScrollAreaProps {
  className?: string;
  children: ReactNode;
}

const NO_METRICS: ScrollMetrics = { scrollTop: 0, scrollHeight: 0, clientHeight: 0 };

/**
 * A vertically scrolling region with a Visual Studio–style overlay scrollbar: while
 * the content overflows, a thin gray line on the right edge says there is more; with
 * the pointer over that line (or while dragging it) it widens into an ordinary
 * scrollbar with a track and a draggable thumb. The native scrollbar is hidden, but
 * the wheel, touch and keyboard still scroll the viewport natively.
 */
export function ScrollArea({ className, children }: ScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<ScrollMetrics>(NO_METRICS);
  const [dragging, setDragging] = useState(false);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const { scrollTop, scrollHeight, clientHeight } = viewport;
    setMetrics({ scrollTop, scrollHeight, clientHeight });
  }, []);

  // The viewport resizes with the panel; the content with every file added,
  // renamed or folder collapsed.
  useEffect(() => {
    const observer = new ResizeObserver(measure);
    if (viewportRef.current) observer.observe(viewportRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    measure();
    return () => observer.disconnect();
  }, [measure]);

  const handleThumbPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (e.button !== 0 || !viewport) return;
    e.preventDefault();
    e.stopPropagation(); // not a click on the track
    const thumb = e.currentTarget;
    const startY = e.clientY;
    const startScroll = viewport.scrollTop;
    const ratio = scrollPerThumbPixel(metrics);
    thumb.setPointerCapture(e.pointerId);
    setDragging(true);

    const onMove = (ev: PointerEvent) => {
      viewport.scrollTop = startScroll + (ev.clientY - startY) * ratio;
    };
    const onUp = () => {
      setDragging(false);
      thumb.removeEventListener('pointermove', onMove);
      thumb.removeEventListener('pointerup', onUp);
      thumb.removeEventListener('pointercancel', onUp);
    };
    thumb.addEventListener('pointermove', onMove);
    thumb.addEventListener('pointerup', onUp);
    thumb.addEventListener('pointercancel', onUp);
  };

  // A click on the track above or below the thumb pages by one view, like a native bar.
  const handleRailPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (e.button !== 0 || !viewport) return;
    e.preventDefault();
    const clickY = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const direction = clickY < thumbGeometry(metrics).top ? -1 : 1;
    viewport.scrollBy({ top: direction * viewport.clientHeight, behavior: 'smooth' });
  };

  const thumb = thumbGeometry(metrics);
  const overflowing = isOverflowing(metrics);

  return (
    <div className={cx('wb-scroll', overflowing && 'has-rail', className)}>
      <div className="wb-scroll__viewport" ref={viewportRef} onScroll={measure}>
        <div ref={contentRef}>{children}</div>
      </div>
      {overflowing && (
        <div
          className={cx('wb-scroll__rail', dragging && 'is-dragging')}
          aria-hidden="true"
          onPointerDown={handleRailPointerDown}
        >
          <div
            className="wb-scroll__thumb"
            style={{ top: thumb.top, height: thumb.height }}
            onPointerDown={handleThumbPointerDown}
          />
        </div>
      )}
    </div>
  );
}

export default ScrollArea;
