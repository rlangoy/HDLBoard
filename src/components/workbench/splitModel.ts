// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The split view's questions about the project that are not about layout
 * (docs/impl_split_screen.md § 4.4, § 4.10): which files a pane can be paired
 * with, which testbench units can run a design, and which unit a pane shows.
 * Pure — the React side asks, and renders the answers.
 */

import type { PaneRole } from './editorView';
import { effectiveFile, findUnit, testbenchCandidates, unitKey } from './tbDetect';
import type {
  AnalyzedUnit, FileAnalysis, FileRole, PaneTarget, ProjectAnalysis, TestbenchOverrides, UnitRole,
} from './tbDetect/types';

export interface FileChoice {
  readonly fileId: string;
  readonly name: string;
  readonly role: FileRole | undefined;
}

/**
 * The same-language files a pane can be paired with: for the TB pane the designs,
 * for the RTL pane the testbenches — a file holding both counts as either.
 */
export function pairOptions(
  project: ProjectAnalysis,
  overrides: TestbenchOverrides,
  fileId: string,
  pane: PaneRole,
): FileChoice[] {
  const self = project.byFile.get(fileId);
  if (!self) return [];
  const wanted: readonly (FileRole | undefined)[] = pane === 'tb' ? ['rtl', 'mixed', undefined] : ['tb', 'mixed'];
  return [...project.byFile.keys()]
    .filter((id) => id !== fileId)
    .map((id) => effectiveFile(project, overrides, id))
    .filter((f): f is FileAnalysis => f !== undefined && f.language === self.language && wanted.includes(f.role))
    .map((f) => ({ fileId: f.fileId, name: f.name, role: f.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface TestbenchChoice extends FileChoice {
  readonly unitName: string;
}

/**
 * § 4.10's run check, for a design run: when the design has ports but no board
 * ports, the testbench units that instantiate it, best pair first (same file
 * included); empty when the board can drive it, or nothing tests it.
 */
export function testbenchesFor(
  project: ProjectAnalysis,
  overrides: TestbenchOverrides,
  fileId: string,
  unitName: string | null,
  recent: readonly string[],
): TestbenchChoice[] {
  const file = effectiveFile(project, overrides, fileId);
  const unit = file && unitName !== null ? findUnit(file, unitName) : undefined;
  if (!file || !unit || !unit.hasPorts || unit.hasBoardPorts) return [];
  const key = unitKey(file.language, unit.name);
  const drives = (u: AnalyzedUnit) => u.role === 'tb' && u.instances.some((i) => unitKey(file.language, i.name) === key);
  const ranked = [file, ...testbenchCandidates(file, project, overrides, recent).map((c) => c.file)];
  const others = [...project.byFile.keys()].map((id) => effectiveFile(project, overrides, id)).filter((f): f is FileAnalysis => !!f && f.language === file.language);
  const ordered = [...new Set([...ranked, ...others])];
  return ordered.flatMap((f) =>
    f.units.filter(drives).map((u) => ({ fileId: f.fileId, name: f.name, role: f.role, unitName: u.name })),
  );
}

/** The unit a pane target shows, from the current analysis. */
export function unitOf(project: ProjectAnalysis, overrides: TestbenchOverrides, target: PaneTarget | null): AnalyzedUnit | undefined {
  const file = target && effectiveFile(project, overrides, target.fileId);
  return file && target ? findUnit(file, target.unitName) ?? file.units[0] : undefined;
}

/** A pair override from a pane's "Pair with…": design -> testbench, one design per testbench. */
export function withPair(overrides: TestbenchOverrides, designId: string, tbId: string): TestbenchOverrides {
  const pairs = Object.fromEntries(Object.entries(overrides.pairs).filter(([, tb]) => tb !== tbId));
  return { ...overrides, pairs: { ...pairs, [designId]: tbId } };
}

/** A role override, or `undefined` to clear it. */
export function withRole(overrides: TestbenchOverrides, fileId: string, role: UnitRole | undefined): TestbenchOverrides {
  const roles = { ...overrides.roles };
  if (role === undefined) delete roles[fileId];
  else roles[fileId] = role;
  return { ...overrides, roles };
}

/** Overrides without any entry naming `fileId` (the file was deleted). */
export function withoutFile(overrides: TestbenchOverrides, fileId: string): TestbenchOverrides {
  const roles = { ...overrides.roles };
  delete roles[fileId];
  const pairs = Object.fromEntries(Object.entries(overrides.pairs).filter(([d, t]) => d !== fileId && t !== fileId));
  return { roles, pairs };
}
