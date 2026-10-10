// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The split view's questions about the project that are not about layout
 * (docs/impl_split_screen.md § 4.4, § 4.10): which files a pane can be paired
 * with, which testbench units can run a design, and which unit a pane shows.
 * Pure — the React side asks, and renders the answers.
 */

import type { EditorView, PaneRole } from './editorView';
import { contradictsCode, effectiveFile, findUnit, testbenchCandidates, unitKey } from './tbDetect';
import type {
  AnalyzedUnit, EditorPair, FileAnalysis, FileRole, PaneTarget, ProjectAnalysis, TestbenchOverrides, UnitRole,
} from './tbDetect/types';

export interface FileChoice {
  readonly fileId: string;
  readonly name: string;
  readonly role: FileRole | undefined;
}

/**
 * The same-language files a pane can be paired with: for the TB pane the designs,
 * for the RTL pane the testbenches — a file holding both counts as either. A
 * pairing the code rules out (contradictsCode) is not offered.
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
  const contradicts = (otherId: string) =>
    pane === 'tb' ? contradictsCode(project, overrides, otherId, fileId) : contradictsCode(project, overrides, fileId, otherId);
  return [...project.byFile.keys()]
    .filter((id) => id !== fileId && !contradicts(id))
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

/**
 * Overrides without the pairings the code rules out (contradictsCode): run at
 * startup and after every analysis, so a stale pairing is neither shown nor saved.
 * The same object when nothing is dropped.
 */
export function withoutContradictedPairs(project: ProjectAnalysis, overrides: TestbenchOverrides): TestbenchOverrides {
  const kept = Object.entries(overrides.pairs).filter(([designId, tbId]) => !contradictsCode(project, overrides, designId, tbId));
  if (kept.length === Object.keys(overrides.pairs).length) return overrides;
  return { ...overrides, pairs: Object.fromEntries(kept) };
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

/** A role change that would leave the split with two designs or two testbenches side by side. */
export interface RoleConflict {
  /** The file shown in the other pane. */
  readonly otherFileId: string;
  /** The role both files would have. */
  readonly role: UnitRole;
}

/**
 * Whether giving `fileId` the overrides `next` would put two files of the same role
 * side by side (docs/impl_split_screen.md B1: a split is one testbench beside one
 * design). Only for two different files, both shown; a file with both a testbench
 * and a design in it never conflicts. Pure.
 */
export function roleConflict(
  project: ProjectAnalysis,
  next: TestbenchOverrides,
  pair: EditorPair,
  shown: EditorView,
  fileId: string,
): RoleConflict | null {
  const tbId = pair.tb?.fileId;
  const rtlId = pair.rtl?.fileId;
  if (shown !== 'both' || !tbId || !rtlId || tbId === rtlId) return null;
  if (fileId !== tbId && fileId !== rtlId) return null;
  const otherFileId = fileId === tbId ? rtlId : tbId;
  const role = effectiveFile(project, next, fileId)?.role;
  if (role === undefined || role === 'mixed' || effectiveFile(project, next, otherFileId)?.role !== role) return null;
  return { otherFileId, role };
}
