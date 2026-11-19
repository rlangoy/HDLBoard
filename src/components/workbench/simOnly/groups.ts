// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The code groups RTL / SIM-only / TB (docs/impl_sim_only_warnings.md § 2.1, § 5.1).
 * The group follows the findings, never the role: hardware code with a finding that
 * keeps it off the board is SIM-only, so the label and the line warnings always agree.
 * Pure.
 */

import { effectiveFile } from '../tbDetect/pairing';
import type { FileAnalysis, TestbenchOverrides, TestbenchRegion } from '../tbDetect/types';
import { makesSimOnly, partUnitKey } from './findings';
import type { CodeGroup, CodeGroups, DesignView, FileGroup, SimOnlyFinding } from './types';
import { fileOfKey, unitRefKey } from './unitRef';

export interface GroupInput {
  readonly view: DesignView;
  readonly overrides: TestbenchOverrides;
  readonly findings: readonly SimOnlyFinding[];
}

/** The input, and the units whose findings make them SIM-only. */
interface GroupContext extends GroupInput {
  readonly simOnlyUnits: ReadonlySet<string>;
}

export function codeGroups(input: GroupInput): CodeGroups {
  const simOnlyUnits = new Set(input.findings.filter(makesSimOnly).map((f) => f.unitRef));
  const groupOf = (key: string, files: UnitFiles) => unitGroup({ ...input, simOnlyUnits }, key, files);
  const byFile = new Map<string, FileGroup>();
  for (const file of input.view.corrected.byFile.values()) {
    const group = fileGroupOf(unitGroupsIn(input, file, groupOf));
    if (group !== undefined) byFile.set(file.fileId, group);
  }
  return { byFile, simOnlyRegions: simOnlyRegions(input, simOnlyUnits) };
}

/** Groups from the roles alone: what the files show with the check off (*Simulation only*). */
export function groupsFromRoles(view: DesignView, overrides: TestbenchOverrides): CodeGroups {
  const byFile = new Map<string, FileGroup>();
  for (const file of view.corrected.byFile.values()) {
    const role = effectiveFile(view.corrected, overrides, file.fileId)?.role;
    if (role !== undefined) byFile.set(file.fileId, role);
  }
  return { byFile, simOnlyRegions: new Map() };
}

/** Where a unit is declared, and the file of the code being grouped: another file for an architecture of § 4.1. */
interface UnitFiles {
  readonly unit: string;
  readonly code: string;
}

/** A unit's group: the student's *Treat as testbench* of the code's file first, then hardware by its findings, else its role. */
function unitGroup(context: GroupContext, key: string, files: UnitFiles): CodeGroup {
  const { view, overrides, simOnlyUnits } = context;
  if (overrides.roles[files.code] === 'tb') return 'tb';
  if (!view.hardware.hardware.has(key)) return roleOfUnit(view, key, files.unit);
  const simOnly = simOnlyUnits.has(key) || overrides.simModels?.[files.code] === true;
  return simOnly ? 'sim-only' : 'rtl';
}

function roleOfUnit(view: DesignView, key: string, fileId: string): CodeGroup {
  const file = view.corrected.byFile.get(fileId);
  const unit = file?.units.find((u) => unitRefKey(fileId, file.language, u.name) === key);
  return unit?.role === 'tb' ? 'tb' : 'rtl';
}

/** The groups of a file's units, and of its architectures of entities in other files (§ 4.1). */
function unitGroupsIn(input: GroupInput, file: FileAnalysis, groupOf: (key: string, files: UnitFiles) => CodeGroup): CodeGroup[] {
  // The units the simulator sees, and those only synthesis sees (a module inside `ifdef SYNTHESIS).
  const fileParts = input.view.parts.get(file.fileId) ?? [];
  const ownNames = [...file.units.map((u) => u.name), ...fileParts.filter((p) => p.ownsUnit).map((p) => p.unitName)];
  const ownKeys = new Set(ownNames.map((name) => unitRefKey(file.fileId, file.language, name)));
  const own = [...ownKeys].map((key) => groupOf(key, { unit: file.fileId, code: file.fileId }));
  const foreign = fileParts.filter((p) => !p.ownsUnit).flatMap((part) => {
    const key = partUnitKey(input.view, part);
    return key === undefined ? [] : [groupOf(key, { unit: fileOfKey(key), code: file.fileId })];
  });
  return [...own, ...foreign];
}

/** `tb` with a SIM-only design is `mixed-sim-only`; a design part is SIM-only when any of it is. */
export function fileGroupOf(groups: readonly CodeGroup[]): FileGroup | undefined {
  if (groups.length === 0) return undefined;
  const design = groups.includes('sim-only') ? 'sim-only' : groups.includes('rtl') ? 'rtl' : undefined;
  if (!groups.includes('tb')) return design;
  if (design === undefined) return 'tb';
  return design === 'sim-only' ? 'mixed-sim-only' : 'mixed';
}

/** Per file: each block of a SIM-only unit that holds a finding, in line order (§ 5.3). */
function simOnlyRegions(input: GroupInput, simOnlyUnits: ReadonlySet<string>): Map<string, TestbenchRegion[]> {
  const regions = new Map<string, TestbenchRegion[]>();
  for (const part of [...input.view.parts.values()].flat()) {
    const key = partUnitKey(input.view, part);
    if (key === undefined || !simOnlyUnits.has(key)) continue;
    const lines = input.findings.filter((f) => f.fileId === part.fileId && f.unitRef === key && makesSimOnly(f)).map((f) => f.line);
    const held = part.blocks.filter((b) => lines.some((line) => line >= b.span.start && line <= b.span.end));
    const found = held.map((b) => ({ unitName: part.unitName, label: b.label, span: b.span }));
    regions.set(part.fileId, [...(regions.get(part.fileId) ?? []), ...found].sort((a, b) => a.span.start - b.span.start));
  }
  return regions;
}
