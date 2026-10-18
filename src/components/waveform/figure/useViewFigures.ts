// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The figure actions of the waveform view (docs/waveform_viewer_spec.md § 8.8). Copy
 * waveform puts the view as on screen on the clipboard. Figure for a report turns the
 * view into report mode: the figure itself, drawn live from the view, so panning and
 * zooming choose what it shows. It opens at two columns and remembers the colouring;
 * the cursor is in the figure when the view shows it.
 */

import { useEffect, useMemo, useState, type RefObject } from 'react';
import type { Ticks } from '../model';
import type { ShowAs } from '../radix';
import { traceRows, type SignalPath } from '../signalRows';
import { useStatusLine } from '../useStatusLine';
import type { WaveView } from '../useWaveView';
import { loadReportColouring, saveReportColouring } from '../wavePrefs';
import { COPY_MESSAGES, copyFigure, measureText, saveFigurePng, saveFigureSvg } from './figureOutput';
import { OPENING_WIDTH, REPORT_DPI, reportLook, type ReportChoices } from './figureStyle';
import { waveformFigure, type Figure } from './figureSvg';
import type { ScreenSize } from './screenLook';
import { copyScreenFigure, viewContent, type ViewState } from './viewFigures';

export interface ViewFiguresInput {
  readonly view: WaveView;
  readonly showAsOf: (path: SignalPath) => ShowAs;
  /** Whether the view shows its cursor; a report figure shows it then too. */
  readonly cursorShown: boolean;
  /** The pane, whose colours and fonts a copy as on screen takes. */
  readonly pane: RefObject<HTMLElement>;
  readonly size: ScreenSize;
  /** The saved files' name without extension: `counter_tb_waveform`. */
  readonly baseName: string;
}

/** Report mode: the figure as it stands, the band's choices, and what its buttons do. */
export interface ReportMode {
  readonly figure: Figure;
  readonly choices: ReportChoices;
  /** The cursor, in ticks of `tickFs` femtoseconds, while the view shows it. */
  readonly shownCursor: Ticks | undefined;
  readonly tickFs: number;
  choose(patch: Partial<ReportChoices>): void;
  copy(): void;
  saveSvg(): void;
  savePng(): void;
  close(): void;
}

export interface ViewFigures {
  readonly hasTraces: boolean;
  /** How the last copy went, for a status line; empty when there is nothing to say. */
  readonly status: string;
  copyWaveform(): void;
  /** Report mode while it is on, else null. */
  readonly report: ReportMode | null;
  openReport(): void;
  /** Leaves report mode; false when it was not on. */
  closeReport(): boolean;
}

const SAVE_PNG_FAILED = 'Could not draw the PNG. Save it as SVG instead.';

/** The band's choices: the width starts at two columns on every opening, the colouring is remembered. */
function useReportChoices() {
  const [choices, setChoices] = useState<ReportChoices>(() => ({ width: OPENING_WIDTH, colouring: loadReportColouring() }));
  const choose = (patch: Partial<ReportChoices>) => {
    setChoices((current) => ({ ...current, ...patch }));
    if (patch.colouring !== undefined) saveReportColouring(patch.colouring);
  };
  const startAtOpeningWidth = () => setChoices((current) => ({ ...current, width: OPENING_WIDTH }));
  return { choices, choose, startAtOpeningWidth };
}

/** The view's state for a figure, the same object while nothing in it changes. */
function useViewState({ setup, list }: WaveView, showAsOf: (path: SignalPath) => ShowAs): ViewState | null {
  return useMemo(() => (setup === null ? null : { setup, list, showAsOf }), [setup, list, showAsOf]);
}

/** Report mode is on while asked for and while there are traces: it never comes back by itself. */
function useReportOn(hasTraces: boolean) {
  const [reportOn, setReportOn] = useState(false);
  useEffect(() => {
    if (!hasTraces) setReportOn(false);
  }, [hasTraces]);
  return [reportOn && hasTraces, setReportOn] as const;
}

export function useViewFigures({ view, showAsOf, cursorShown, pane, size, baseName }: ViewFiguresInput): ViewFigures {
  const { choices, choose, startAtOpeningWidth } = useReportChoices();
  const [status, setStatus] = useStatusLine();
  const state = useViewState(view, showAsOf);
  const hasTraces = state !== null && traceRows(state.list).length > 0;
  const [reportOn, setReportOn] = useReportOn(hasTraces);
  const figure = useMemo(
    () => (reportOn && state !== null ? waveformFigure(viewContent(state), reportLook({ ...choices, showCursor: cursorShown }), measureText) : null),
    [reportOn, state, choices, cursorShown],
  );
  const copyWaveform = () => {
    if (state === null || !hasTraces || pane.current === null) return;
    void copyScreenFigure(pane.current, state, size).then((result) => setStatus(COPY_MESSAGES[result]));
  };
  const report: ReportMode | null =
    figure === null || state === null
      ? null
      : {
          figure,
          choices,
          shownCursor: cursorShown ? state.setup.cursor : undefined,
          tickFs: state.setup.tickFs,
          choose,
          copy: () => void copyFigure(figure).then((result) => setStatus(COPY_MESSAGES[result])),
          saveSvg: () => saveFigureSvg(figure, baseName),
          savePng: () => void saveFigurePng(figure, baseName, REPORT_DPI).catch(() => setStatus(SAVE_PNG_FAILED)),
          close: () => setReportOn(false),
        };
  const openReport = () => {
    if (!hasTraces) return;
    startAtOpeningWidth();
    setReportOn(true);
  };
  const closeReport = () => {
    if (!reportOn) return false;
    setReportOn(false);
    return true;
  };
  return { hasTraces, status, copyWaveform, report, openReport, closeReport };
}
