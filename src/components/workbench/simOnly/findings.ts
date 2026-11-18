// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The findings: the constructs in hardware code (docs/impl_sim_only_warnings.md
 * § 5.1), in the file and on the line where the code is — an architecture in another
 * file than its entity included (§ 4.1). Pure.
 */

import type { TestbenchOverrides } from '../tbDetect/types';
import type { CodePart, DesignView, SimOnlyFinding, Tier } from './types';
import { definedUnitKey, unitRefKey } from './unitRef';

export function simOnlyFindings(view: DesignView): SimOnlyFinding[] {
  return [...view.parts.values()].flat().flatMap((part) => {
    const unitRef = partUnitKey(view, part);
    if (unitRef === undefined || !view.hardware.hardware.has(unitRef)) return [];
    return part.matches.map((m) => ({ ...m, fileId: part.fileId, unitName: part.unitName, unitRef }));
  });
}

/** The key of the unit a part belongs to: its own, or for an architecture of § 4.1 its entity's. */
export function partUnitKey(view: DesignView, part: CodePart): string | undefined {
  const language = view.raw.byFile.get(part.fileId)?.language;
  if (language === undefined) return undefined;
  return part.ownsUnit ? unitRefKey(part.fileId, language, part.unitName) : definedUnitKey(view.raw, language, part.unitName);
}

/** Tiers that mean the code does not run on the board as written; `quiet` is harmless console output. */
const OFF_THE_BOARD: ReadonlySet<Tier> = new Set(['never', 'ignored']);

/** Whether a finding makes its code SIM-only. */
export const makesSimOnly = (finding: SimOnlyFinding): boolean => OFF_THE_BOARD.has(finding.tier);

/**
 * Whether a finding may be shown as a warning on its line: not in a file the student
 * marked *Simulation model* (S9). Phase 2's synthesis messages go through the same rule.
 */
export const isWarnable = (finding: { readonly fileId: string }, overrides: TestbenchOverrides): boolean =>
  overrides.simModels?.[finding.fileId] !== true;
