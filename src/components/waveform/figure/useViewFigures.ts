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
import type { ScreenLayout } from './screenLook';
import { copyScreenFigure, viewContent, type ViewState } from './viewFigures';

export interface ViewFiguresInput {
  readonly view: WaveView;
  readonly showAsOf: (path: SignalPath) => ShowAs;
  /** The cursor while the view shows it; copies and report figures show it then too. */
  readonly shownCursor: Ticks | undefined;
  /** The pane, whose colours and fonts a copy as on screen takes. */
  readonly pane: RefObject<HTMLElement>;
  /** The columns' widths on screen, for a copy as on screen. */
  readonly size: Omit<ScreenLayout, 'cursorShown'>;
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

/** The report figure of the view as it stands. */
function reportFigure(state: ViewState, choices: ReportChoices, showCursor: boolean): Figure {
  return waveformFigure(viewContent(state), reportLook({ ...choices, showCursor }), measureText);
}

/**
 * Report mode: on while asked for and while there are traces, so it never comes back by
 * itself. `onOpen` runs on every opening; `close` says whether it was on.
 */
function useReportOn(hasTraces: boolean, onOpen: () => void) {
  const [asked, setAsked] = useState(false);
  useEffect(() => {
    if (!hasTraces) setAsked(false);
  }, [hasTraces]);
  const reportOn = asked && hasTraces;
  const open = () => {
    if (!hasTraces) return;
    onOpen();
    setAsked(true);
  };
  const close = () => {
    if (!reportOn) return false;
    setAsked(false);
    return true;
  };
  return { reportOn, open, close };
}

export function useViewFigures({ view, showAsOf, shownCursor, pane, size, baseName }: ViewFiguresInput): ViewFigures {
  const { choices, choose, startAtOpeningWidth } = useReportChoices();
  const [status, setStatus] = useStatusLine();
  const state = useViewState(view, showAsOf);
  const hasTraces = state !== null && traceRows(state.list).length > 0;
  const { reportOn, open: openReport, close: closeReport } = useReportOn(hasTraces, startAtOpeningWidth);
  const cursorShown = shownCursor !== undefined;
  const figure = useMemo(
    () => (reportOn && state !== null ? reportFigure(state, choices, cursorShown) : null),
    [reportOn, state, choices, cursorShown],
  );
  const copyWaveform = () => {
    if (state === null || !hasTraces || pane.current === null) return;
    void copyScreenFigure(pane.current, state, { ...size, cursorShown }).then((result) => setStatus(COPY_MESSAGES[result]));
  };
  const report: ReportMode | null =
    figure === null || state === null
      ? null
      : {
          figure,
          choices,
          shownCursor,
          tickFs: state.setup.tickFs,
          choose,
          copy: () => void copyFigure(figure).then((result) => setStatus(COPY_MESSAGES[result])),
          saveSvg: () => saveFigureSvg(figure, baseName),
          savePng: () => void saveFigurePng(figure, baseName, REPORT_DPI).catch(() => setStatus(SAVE_PNG_FAILED)),
          close: closeReport,
        };
  return { hasTraces, status, copyWaveform, report, openReport, closeReport };
}
