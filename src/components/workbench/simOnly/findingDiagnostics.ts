// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The findings as editor warnings (docs/impl_sim_only_warnings.md § 5.2): the live
 * layer, merged with a run's diagnostics by `addToFiles`, so it has the same caps and
 * dedup. Lines are only right while the text has the lines its analysis was made
 * from: typing within a line keeps the warnings, adding or removing a line hides the
 * file's warnings until the next analysis, 500 ms later. Pure.
 */

import type { AdvisedDiagnostic } from '../diagnosticAdvice';
import { countLines } from '../diagnosticLocation';
import type { ProjectAnalysis, TestbenchOverrides } from '../tbDetect/types';
import { isWarnable } from './findings';
import { CHECK_SOURCE, CONSTRUCT_TEXT } from './simOnlyText';
import type { SimOnlyFinding, Tier } from './types';

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

export function findingDiagnostics(findings: readonly SimOnlyFinding[], live: LiveText): AdvisedDiagnostic[] {
  const current = new Set(live.files.filter((file) => linesMatchAnalysis(live.analysis, file)).map((file) => file.id));
  return findings
    .filter((f) => current.has(f.fileId) && isWarnable(f, live.overrides))
    .map(toDiagnostic);
}

function linesMatchAnalysis(analysis: ProjectAnalysis, file: { readonly id: string; readonly content: string }): boolean {
  const analysed = analysis.byFile.get(file.id);
  return analysed !== undefined && countLines(analysed.content) === countLines(file.content);
}

function toDiagnostic(finding: SimOnlyFinding): AdvisedDiagnostic {
  const text = CONSTRUCT_TEXT[finding.construct];
  return {
    fileId: finding.fileId,
    line: finding.line,
    severity: 'warning',
    message: text.explanation,
    details: [],
    ...(TIER_LOOK[finding.tier].quiet && { quiet: true }),
    advice: { headline: text.headline, compiler: CHECK_SOURCE, liveCheck: true },
  };
}
