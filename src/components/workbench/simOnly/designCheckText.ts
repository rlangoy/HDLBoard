// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The strings of the design check's UI (docs/impl_sim_only_warnings.md § 5.3, § 6):
 * the setting, the SIM-only label, badge, icon and menu. English. Pure.
 */

export const DESIGN_CHECK_TEXT = {
  title: 'Design check',
  synthesis: 'Synthesis',
  synthesisHint: 'Check designs for FPGA synthesis. Lines that only work in simulation get a warning, and the file is marked SIM-only.',
  simulation: 'Simulation only',
  simulationHint: "Don't check designs for synthesis. For models and exercises that never go to an FPGA.",
  simOnlyLabel: 'SIM-only',
  fileRoleSimOnly: 'Simulation-only design: runs in the simulator, not on the board',
  fileRoleMixedSimOnly: 'Simulation-only design + testbench',
  simModel: 'Simulation model',
  simModelHint: 'This code is meant for simulation only. Keep the SIM-only label, hide the line warnings.',
} as const;

/** The SIM-only badge's tooltip. */
export function simOnlyTooltip(lines: number): string {
  if (lines === 0) return 'Simulation-only design — marked as a simulation model';
  return `Simulation-only design — ${lines} ${lines === 1 ? 'line runs' : 'lines run'} in the simulator but not on the board`;
}

/** The badge menu's *Detected* line for a SIM-only design: the findings, so the student sees why. */
export function detectedSimOnly(findings: readonly { readonly title: string; readonly line: number }[]): string {
  const listed = findings.map((f) => `${f.title} (line ${f.line})`).join(', ');
  return listed === '' ? 'Detected: SIM-only design' : `Detected: SIM-only design — ${listed}`;
}

/** The polite announcement when the last finding is fixed, and when one appears. */
export const nowRtl = (fileName: string): string => `${fileName} is now RTL: it can run on the board`;
export const nowSimOnly = (fileName: string): string => `${fileName} is now SIM-only: it runs in the simulator but not on the board`;
