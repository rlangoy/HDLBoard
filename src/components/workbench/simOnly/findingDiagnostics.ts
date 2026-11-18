// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The design check's findings as editor warnings (docs/impl_sim_only_warnings.md
 * § 5.2, § 8.1): the live layer, merged with a run's diagnostics by `addToFiles`, so it
 * has the same caps and dedup. Lines are only right while the text has the lines its
 * analysis was made from: typing within a line keeps the warnings, adding or removing
 * a line hides the file's warnings until the next analysis, 500 ms later. A file
 * marked *Simulation model* gets none. Pure.
 */

import type { AdvisedDiagnostic } from '../diagnosticAdvice';
import { countLines } from '../diagnosticLocation';
import type { ProjectAnalysis, TestbenchOverrides } from '../tbDetect/types';
import type { DriverConflict } from './driverTypes';
import { isWarnable } from './findings';
import { CHECK_SOURCE, CONSTRUCT_TEXT, multipleDriversText, type ConstructText } from './simOnlyText';
import type { DesignCheck, SimOnlyFinding, Tier } from './types';

/** How each tier shows: `quiet` only as the gutter's `!` and the tooltip. */
const TIER_LOOK: Readonly<Record<Tier, { readonly quiet: boolean }>> = {
  never: { quiet: false },
  ignored: { quiet: false },
  quiet: { quiet: true },
};

export interface LiveText {
  /** The analysis the findings come from (DesignView.raw). */
  readonly analysis: ProjectAnalysis;
  readonly overrides: TestbenchOverrides;
  /** The files as the editor has them now. */
  readonly files: readonly { readonly id: string; readonly content: string }[];
}

/** Every warning of the check: the simulation-only lines and the signals with more than one driver. */
export function checkDiagnostics(check: DesignCheck, live: LiveText): AdvisedDiagnostic[] {
  return [...findingDiagnostics(check.findings, live), ...driverDiagnostics(check.driverConflicts, live)];
}

export function findingDiagnostics(findings: readonly SimOnlyFinding[], live: LiveText): AdvisedDiagnostic[] {
  const shown = shownIn(live);
  return findings
    .filter(shown)
    .map((f) => warning({ fileId: f.fileId, line: f.line }, CONSTRUCT_TEXT[f.construct], TIER_LOOK[f.tier].quiet));
}

export function driverDiagnostics(conflicts: readonly DriverConflict[], live: LiveText): AdvisedDiagnostic[] {
  const shown = shownIn(live);
  return conflicts.filter(shown).map((c) => warning(c, multipleDriversText(c.signal, c.otherLines), false));
}

/** Whether a warning at this place may show now: its file's lines are those analysed, and it is no *Simulation model*. */
function shownIn(live: LiveText): (place: { readonly fileId: string }) => boolean {
  const current = new Set(live.files.filter((file) => linesMatchAnalysis(live.analysis, file)).map((file) => file.id));
  return (place) => current.has(place.fileId) && isWarnable(place, live.overrides);
}

function linesMatchAnalysis(analysis: ProjectAnalysis, file: { readonly id: string; readonly content: string }): boolean {
  const analysed = analysis.byFile.get(file.id);
  return analysed !== undefined && countLines(analysed.content) === countLines(file.content);
}

function warning(place: { readonly fileId: string; readonly line: number }, text: ConstructText, quiet: boolean): AdvisedDiagnostic {
  return {
    fileId: place.fileId,
    line: place.line,
    severity: 'warning',
    message: text.explanation,
    details: [],
    ...(quiet && { quiet: true }),
    advice: { headline: text.headline, compiler: CHECK_SOURCE, liveCheck: true },
  };
}
