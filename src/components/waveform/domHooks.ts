// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Small DOM hooks the waveform view uses: an element's size, and a flag that turns on after a delay. */

import { useEffect, useState } from 'react';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** The element's content box, kept up to date as it resizes. */
export function useElementSize(element: HTMLElement | null): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useEffect(() => {
    if (element === null) return undefined;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
}

/** True once `on` has stayed true for `delayMs` – a progress note that never flickers for a fast load. */
export function useDelayed(on: boolean, delayMs: number): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!on) {
      setShown(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [on, delayMs]);
  return shown;
}
