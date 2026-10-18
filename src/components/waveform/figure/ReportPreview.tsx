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

import { useRef, useState } from 'react';
import { useElementSize } from '../domHooks';
import type { Ticks } from '../model';
import { formatCursorFs, formatFs, timeToX } from '../timeAxis';
import { useCursorGrab, useRangeDrag, useWheelGestures, type Selection, type TimeHandlers, type TimeMapping } from '../useTimeGestures';
import { FIGURE_WIDTH_MM, ptFromMm } from './figureStyle';
import { isInView } from './figureLayout';
import type { Figure } from './figureSvg';
import { FIGURE_MOUSE_HINT } from './reportText';

export interface ReportPreviewProps {
  readonly figure: Figure;
  /** The cursor, when it is shown; undefined hides its handle. */
  readonly cursor: Ticks | undefined;
  /** The femtoseconds in one tick, for the times written on the handle and a marked range. */
  readonly tickFs: number;
  readonly handlers: TimeHandlers;
}

/** The space around the figure. */
const PREVIEW_PAD_PX = 24;
/** Never more than this many screen pixels per point, however wide the pane. */
const MAX_PX_PER_PT = 2.5;
const WIDEST_FIGURE_PT = ptFromMm(FIGURE_WIDTH_MM.page);

/** Screen pixels ↔ time across the figure on screen. */
interface ScreenMapping extends TimeMapping {
  /** Screen pixels per drawing unit. */
  readonly scale: number;
  readonly figure: Figure;
}

/** The mapping for `figure` drawn at `scale`: a time is always kept inside the traces. */
function screenMapping(figure: Figure, scale: number): ScreenMapping {
  const { tracesLeft, tracesRight, view } = figure.layout;
  return {
    scale,
    figure,
    ticksPerPx: view.ticksPerPx / scale,
    timeAt: (x) => view.start + (Math.min(tracesRight, Math.max(tracesLeft, x / scale)) - tracesLeft) * view.ticksPerPx,
  };
}

const xOf = ({ scale, figure }: ScreenMapping, time: Ticks): number => (figure.layout.tracesLeft + timeToX(figure.layout.view, time)) * scale;

interface SelectionBandProps {
  readonly selection: Selection;
  readonly mapping: ScreenMapping;
  readonly tickFs: number;
}

/** The marked range over the figure, with how long it is: what the view will show. */
function SelectionBand({ selection, mapping, tickFs }: SelectionBandProps) {
  const [x0, x1] = [xOf(mapping, selection.from), xOf(mapping, selection.to)].sort((a, b) => a - b);
  return (
    <div className="wv-report__selection" style={{ left: x0, width: x1 - x0 }}>
      <span>{formatFs(Math.abs(selection.to - selection.from) * tickFs)}</span>
    </div>
  );
}

interface CursorRulerProps {
  readonly time: Ticks;
  readonly tickFs: number;
  readonly mapping: ScreenMapping;
  readonly onCursor: (time: Ticks) => void;
}

/**
 * The strip above the figure with the cursor's handle: press or drag anywhere on it to
 * move the cursor. The handle is left out while the cursor is outside the time shown.
 */
function CursorRuler({ time, tickFs, mapping, onCursor }: CursorRulerProps) {
  const grab = useCursorGrab(mapping, onCursor);
  const label = formatCursorFs(time * tickFs, mapping.ticksPerPx * tickFs);
  return (
    <div className="wv-report__ruler" title="Drag the cursor to move it" {...grab}>
      {isInView(mapping.figure.layout, time) && (
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
  const mapping = screenMapping(figure, Math.min(MAX_PX_PER_PT, room / WIDEST_FIGURE_PT) || 1);
  useWheelGestures(figureRef, mapping, handlers);
  const { selection, ...pointer } = useRangeDrag(mapping, handlers);
  return (
    <div className="wv-report" ref={setArea}>
      <div className="wv-report__sheet" style={{ width: figure.layout.width * mapping.scale }}>
        {cursor !== undefined && <CursorRuler time={cursor} tickFs={tickFs} mapping={mapping} onCursor={handlers.onCursor} />}
        <div ref={figureRef} className="wv-report__figure" title={FIGURE_MOUSE_HINT} {...pointer}>
          {/* The figure is SVG this app wrote itself, with every name escaped. */}
          <div className="wv-report__page" dangerouslySetInnerHTML={{ __html: figure.svg }} />
          {selection !== undefined && <SelectionBand selection={selection} mapping={mapping} tickFs={tickFs} />}
        </div>
      </div>
    </div>
  );
}
