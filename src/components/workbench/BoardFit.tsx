// SPDX-License-Identifier: GPL-2.0-only
import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Include the committed arrangement's padding and scrollbar in the pane request. */
export function paneWidthForScale(naturalWidth: number, scale: number, paneWidth: number, viewportWidth: number): number {
  return Math.ceil(naturalWidth * scale + Math.max(0, paneWidth - viewportWidth));
}

/** Update the transform and scroll extent from the same measurements. */
export function fitBoard(viewport: HTMLDivElement, scaler: HTMLDivElement, spacer: HTMLDivElement | null, single: boolean, maxScale = Infinity): number | undefined {
  const naturalWidth = scaler.offsetWidth;
  const naturalHeight = scaler.offsetHeight;
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  if (!naturalWidth || !naturalHeight || !width || !height) return undefined;
  const scale = Math.min(maxScale, single ? width / naturalWidth : Math.min(width / naturalWidth, height / naturalHeight));
  scaler.style.transform = `scale(${scale})`;
  if (spacer) spacer.style.height = `${single ? naturalHeight * scale : 0}px`;
  return scale;
}

/** Fit committed content; a layout switch changes pane width before fitting again. */
export function BoardFit({ single, collapsed, contentKey, paneWidth, onResize, children }: {
  single: boolean;
  collapsed: boolean;
  contentKey: unknown;
  paneWidth: number;
  onResize: (width: number) => number | undefined;
  children: ReactNode;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const previousSingle = useRef(single);
  const lastScale = useRef<number>();
  const pendingScale = useRef<number>();
  const pendingWidth = useRef<number>();
  const widthByLayout = useRef<{ single?: number; double?: number }>({});
  const awaitingWidth = useRef<number>();
  const preserved = useRef<{ scale: number; width: number; content: unknown }>();
  const resizeRef = useRef(onResize);
  const fitRef = useRef(() => {});

  useLayoutEffect(() => { resizeRef.current = onResize; }, [onResize]);

  useLayoutEffect(() => {
    if (previousSingle.current !== single) {
      // Leaving a layout remembers its pane width; returning restores it.
      widthByLayout.current[previousSingle.current ? 'single' : 'double'] = paneWidth;
      pendingWidth.current = widthByLayout.current[single ? 'single' : 'double'];
      pendingScale.current = pendingWidth.current === undefined ? lastScale.current : undefined;
      previousSingle.current = single;
    }
    const fit = () => {
      const viewport = viewportRef.current;
      const scaler = scalerRef.current;
      if (collapsed || !viewport || !scaler || !viewport.clientWidth || !viewport.clientHeight || !scaler.offsetWidth || !scaler.offsetHeight) return;
      if (awaitingWidth.current !== undefined) {
        if (awaitingWidth.current === paneWidth) return;
        awaitingWidth.current = undefined;
      }
      if (pendingScale.current !== undefined || pendingWidth.current !== undefined) {
        const scale = pendingScale.current;
        const request = pendingWidth.current ?? paneWidthForScale(scaler.offsetWidth, scale!, paneWidth, viewport.clientWidth);
        const width = resizeRef.current(request);
        if (width === undefined) return;
        pendingScale.current = undefined;
        pendingWidth.current = undefined;
        preserved.current = scale === undefined ? undefined : { scale, width, content: contentKey };
        // React must commit the fitted pane width before it can be measured.
        if (width !== paneWidth) {
          awaitingWidth.current = paneWidth;
          // If the layout settles back on the same width no effect re-runs; release the gate.
          requestAnimationFrame(() => {
            if (awaitingWidth.current !== paneWidth) return;
            awaitingWidth.current = undefined;
            fitRef.current();
          });
          return;
        }
      }
      const keep = preserved.current;
      if (keep && (keep.width !== paneWidth || keep.content !== contentKey)) preserved.current = undefined;
      // A minimum pane width may leave extra space; it must not enlarge controls.
      lastScale.current = fitBoard(viewport, scaler, spacerRef.current, single, preserved.current?.scale);
    };
    fitRef.current = fit;
    fit();
  }, [single, collapsed, contentKey, paneWidth]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const scaler = scalerRef.current;
    if (!viewport || !scaler) return;
    const observer = new ResizeObserver(() => fitRef.current());
    observer.observe(viewport);
    observer.observe(scaler);
    return () => observer.disconnect();
  }, []);

  return <div className={`wb-board-fit${single ? ' wb-board-fit--single' : ''}`} ref={viewportRef}>
    <div aria-hidden="true" className="wb-board-fit__spacer" ref={spacerRef} />
    <div className="wb-board-fit__inner" ref={scalerRef}>{children}</div>
  </div>;
}
