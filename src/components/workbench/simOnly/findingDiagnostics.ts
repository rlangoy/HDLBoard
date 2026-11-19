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
import { CHECK_SOURCE, CONSTRUCT_TEXT, multipleDriversText, registerText, type ConstructText } from './simOnlyText';
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
    .map((f) => warning({ fileId: f.fileId, line: f.line }, f.register ? registerText(f.register) : CONSTRUCT_TEXT[f.construct], TIER_LOOK[f.tier].quiet));
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

/**
 * A live warning as the student dismissed it: a click in the editor makes the file's
 * warnings quiet (the text after the line goes; the gutter's `!` and the tooltip stay),
 * and a console link to the file shows them again. Keyed by file and headline, not
 * line, so a warning stays quiet while lines above it are added or removed.
 */
export const liveKey = (d: Pick<AdvisedDiagnostic, 'fileId' | 'advice' | 'message'>): string => `${d.fileId}\n${d.advice?.headline ?? d.message}`;

/** The live warnings, those the student dismissed made quiet. */
export function withQuieted(diagnostics: readonly AdvisedDiagnostic[], quieted: ReadonlySet<string>): AdvisedDiagnostic[] {
  return diagnostics.map((d) => (!d.quiet && quieted.has(liveKey(d)) ? { ...d, quiet: true } : d));
}

/** `quieted` with every live warning of `fileId` added. */
export function quietFile(quieted: ReadonlySet<string>, diagnostics: readonly AdvisedDiagnostic[], fileId: string): ReadonlySet<string> {
  const keys = diagnostics.filter((d) => d.fileId === fileId && !d.quiet).map(liveKey).filter((k) => !quieted.has(k));
  return keys.length === 0 ? quieted : new Set([...quieted, ...keys]);
}

/** `quieted` without the warnings of `fileId`: they show again. */
export function showFile(quieted: ReadonlySet<string>, fileId: string): ReadonlySet<string> {
  const keys = [...quieted].filter((k) => !k.startsWith(`${fileId}\n`));
  return keys.length === quieted.size ? quieted : new Set(keys);
}
