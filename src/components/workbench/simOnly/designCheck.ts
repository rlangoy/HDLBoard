// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The two modes of Settings › Simulation › Design check (docs/impl_sim_only_warnings.md
 * § 6), as two functions in one table. *Synthesis* finds the simulation-only code and
 * the signals with more than one driver (§ 8.1), and reads of the board's simulator-only
 * clock (§ 3.5). *Simulation only* is the check that
 * finds nothing: no findings, so no warnings and no console summary, and the groups of
 * the roles alone, so no SIM-only label. Nothing downstream asks for the mode. Pure.
 */

import { driverConflicts } from './drivers';
import { simOnlyFindings } from './findings';
import { codeGroups, groupsFromRoles } from './groups';
import { simulatorClockFindings } from './simulatorClock';
import type { CheckInput, DesignCheck, DesignCheckMode } from './types';

function synthesisCheck({ view, overrides, simulatorClock }: CheckInput): DesignCheck {
  const clockReads = simulatorClock ? simulatorClockFindings(view, simulatorClock) : [];
  const findings = [...simOnlyFindings(view), ...clockReads].sort((a, b) => (a.fileId === b.fileId ? a.line - b.line : 0));
  return { findings, groups: codeGroups({ view, overrides, findings }), driverConflicts: driverConflicts(view) };
}

function simulationCheck({ view, overrides }: CheckInput): DesignCheck {
  return { findings: [], groups: groupsFromRoles(view, overrides), driverConflicts: [] };
}

export const DESIGN_CHECKS: Readonly<Record<DesignCheckMode, (input: CheckInput) => DesignCheck>> = {
  synthesis: synthesisCheck,
  simulation: simulationCheck,
};
