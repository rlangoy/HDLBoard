// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The two modes of Settings › Editor › Design check (docs/impl_sim_only_warnings.md
 * § 6), as two functions in one table. *Simulation only* is the check that finds
 * nothing: no findings, so no warnings and no console summary, and the groups of the
 * roles alone, so no SIM-only label. Nothing downstream asks for the mode. Pure.
 */

import { simOnlyFindings } from './findings';
import { codeGroups, groupsFromRoles } from './groups';
import type { CheckInput, DesignCheck, DesignCheckMode } from './types';

function synthesisCheck({ view, overrides }: CheckInput): DesignCheck {
  const findings = simOnlyFindings(view);
  return { findings, groups: codeGroups({ view, overrides, findings }) };
}

function simulationCheck({ view, overrides }: CheckInput): DesignCheck {
  return { findings: [], groups: groupsFromRoles(view, overrides) };
}

export const DESIGN_CHECKS: Readonly<Record<DesignCheckMode, (input: CheckInput) => DesignCheck>> = {
  synthesis: synthesisCheck,
  simulation: simulationCheck,
};
