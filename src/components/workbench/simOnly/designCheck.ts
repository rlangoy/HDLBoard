// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The two modes of Settings › Simulation › Design check (docs/impl_sim_only_warnings.md
 * § 6), as two functions in one table. *Synthesis* finds the simulation-only code and
 * the signals with more than one driver (§ 8.1), and reads of the board's simulator-only
 * clock (§ 3.5). *Simulation only* is the check that
 * finds nothing: no findings, so no warnings and no console summary, and the groups of
 * the roles alone, so no SIM-only label. Nothing downstream asks for the mode.
 *
 * The synthesis check at Start (§ 7) adds its findings that make a design SIM-only: with
 * the live ones they decide the groups. It only ever adds: a pass clears no live finding. Pure.
 */

import { driverConflicts } from './drivers';
import { simOnlyFindings } from './findings';
import { codeGroups, groupsFromRoles } from './groups';
import { simulatorClockFindings } from './simulatorClock';
import { isHardwareFinding } from './toolCheck/toolFindings';
import type { CheckInput, DesignCheck, DesignCheckMode, SimOnlyFinding, ToolFinding } from './types';

/** A tool finding as the groups count it: a finding of the `synth-check` construct at its tier. */
function groupedAs(finding: ToolFinding & { readonly tier: 'never' | 'ignored' }): SimOnlyFinding {
  const { fileId, line, tier, unitName, unitRef } = finding;
  return { construct: 'synth-check', tier, line, fileId, unitName, unitRef };
}

const makesSimOnly = (finding: ToolFinding): finding is ToolFinding & { readonly tier: 'never' | 'ignored' } => finding.tier !== undefined;

function synthesisCheck({ view, overrides, simulatorClock, toolFindings = [] }: CheckInput): DesignCheck {
  const clockReads = simulatorClock ? simulatorClockFindings(view, simulatorClock) : [];
  // Per file in line order: the summary's *Line n* is a file's first warned line.
  const findings = [...simOnlyFindings(view), ...clockReads].sort((a, b) => a.fileId.localeCompare(b.fileId) || a.line - b.line);
  // In code that is still hardware: the student may have marked its file *Treat as testbench* since.
  const tool = toolFindings.filter(makesSimOnly).filter((f) => isHardwareFinding(view, f));
  const groups = codeGroups({ view, overrides, findings: [...findings, ...tool.map(groupedAs)] });
  return { findings, groups, driverConflicts: driverConflicts(view), toolFindings: tool };
}

function simulationCheck({ view, overrides }: CheckInput): DesignCheck {
  return { findings: [], groups: groupsFromRoles(view, overrides), driverConflicts: [], toolFindings: [] };
}

export const DESIGN_CHECKS: Readonly<Record<DesignCheckMode, (input: CheckInput) => DesignCheck>> = {
  synthesis: synthesisCheck,
  simulation: simulationCheck,
};
