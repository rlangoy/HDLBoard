// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useRef, type ReactNode } from 'react';
import { cx } from '../board';
import { isOverflowing } from './scrollThumb';
import { OverlayScrollbar, useScrollMetrics } from './OverlayScrollbar';
import './ScrollArea.css';

export interface ScrollAreaProps {
  className?: string;
  children: ReactNode;
}

/**
 * A vertically scrolling region with the workbench's Visual Studio–style overlay
 * scrollbar (OverlayScrollbar.tsx) in place of the native one.
 */
export function ScrollArea({ className, children }: ScrollAreaProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const metrics = useScrollMetrics(viewportRef);
  const overflowing = isOverflowing(metrics.y);

  return (
    <div className={cx('wb-scroll', overflowing && 'has-rail', className)}>
      <div className="wb-scroll__viewport wb-scrollbar-host" ref={viewportRef}>
        {children}
      </div>
      <OverlayScrollbar targetRef={viewportRef} axis="y" metrics={metrics.y} />
    </div>
  );
}

export default ScrollArea;
