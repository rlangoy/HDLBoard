// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Report mode in the waveform pane (docs/waveform_viewer_spec.md § 8.8): the figure laid
 * over the list and the canvas, and the line that says how a copy went. The list and the
 * canvas stay laid out underneath, so the toolbar's cursor time and the zoom keep
 * working, but they are inert while covered: neither Tab nor the mouse reaches them.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import type { TimeHandlers } from '../useTimeGestures';
import { ReportPreview } from './ReportPreview';
import type { ReportMode } from './useViewFigures';

export interface ReportStageProps {
  readonly report: ReportMode | null;
  readonly handlers: TimeHandlers;
  /** The list and the canvas. */
  readonly children: ReactNode;
}

export function ReportStage({ report, handlers, children }: ReportStageProps) {
  const covered = useRef<HTMLDivElement>(null);
  const reportOn = report !== null;
  useEffect(() => {
    if (covered.current !== null) covered.current.inert = reportOn;
  }, [reportOn]);
  return (
    <div className="wv-stage">
      <div className="wv-stage__covered" ref={covered}>
        {children}
      </div>
      {report !== null && <ReportPreview figure={report.figure} cursor={report.shownCursor} tickFs={report.tickFs} handlers={handlers} />}
    </div>
  );
}

/** How the last copy went, at the bottom of the pane; nothing when there is nothing to say. */
export function CopyStatus({ status }: { readonly status: string }) {
  return status === '' ? null : (
    <p className="wv-status" role="status">
      {status}
    </p>
  );
}
