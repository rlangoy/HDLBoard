// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which code is hardware (docs/impl_sim_only_warnings.md § 4): the roots — designs,
 * board designs, a testbench's resolved DUT, files the student marked — and every
 * unit they instantiate, outside code hidden from synthesis. The student's *Treat as
 * testbench* always wins. One answer for the warnings, the groups and pairing. Pure.
 */

import { unitKey } from '../tbDetect/analyzeProject';
import { contradictsCode, testbenchStem } from '../tbDetect/pairing';
import type { AnalyzedUnit, Language, ProjectAnalysis, TestbenchOverrides, UnitRole } from '../tbDetect/types';
import type { CodePart, HardwareView, ProjectParts } from './types';
import { definedUnitKey, fileOfKey, nameOfKey, unitRefKey } from './unitRef';

interface UnitEntry {
  readonly key: string;
  readonly fileId: string;
  readonly language: Language;
  readonly unit: AnalyzedUnit;
  /** The detector's role with the student's mark applied. */
  readonly role: UnitRole;
}

/** What the passes share: the project, the student's marks, and every unit and part by key. */
interface Project {
  readonly analysis: ProjectAnalysis;
  readonly overrides: TestbenchOverrides;
  readonly units: ReadonlyMap<string, UnitEntry>;
  readonly parts: ReadonlyMap<string, readonly CodePart[]>;
}

export function hardwareView(analysis: ProjectAnalysis, overrides: TestbenchOverrides, parts: ProjectParts): HardwareView {
  const project: Project = { analysis, overrides, units: unitEntries(analysis, overrides), parts: partsByUnit(analysis, parts) };
  const all = [...project.units.values()];
  const entries = all.filter((e) => !isMarkedTestbench(project, e.fileId));
  // A testbench the student marked is still a testbench: its DUT stays hardware.
  const dutOf = new Map(all.filter(isTestbench).flatMap((tb) => dutPair(project, tb)));
  const duts = [...dutOf.values()];
  const designs = entries.filter((e) => isDesignRoot(project, e)).map((e) => e.key);
  const boardDesigns = entries.filter((e) => e.unit.hasBoardPorts).map((e) => e.key);
  return {
    hardware: reachable(project, [...designs, ...duts]),
    dutOf,
    asDesign: new Set([...reachable(project, boardDesigns), ...duts]),
    testbenchFiles: new Set(Object.keys(overrides.roles).filter((fileId) => overrides.roles[fileId] === 'tb')),
  };
}

function unitEntries(analysis: ProjectAnalysis, overrides: TestbenchOverrides): Map<string, UnitEntry> {
  const entries = [...analysis.byFile.values()].flatMap((file) =>
    file.units.map((unit): UnitEntry => ({
      key: unitRefKey(file.fileId, file.language, unit.name),
      fileId: file.fileId,
      language: file.language,
      unit,
      role: overrides.roles[file.fileId] ?? unit.role,
    })),
  );
  return new Map(entries.map((e) => [e.key, e]));
}

/** Each unit's parts: its own code, and architectures of it in other files (§ 4.1). */
function partsByUnit(analysis: ProjectAnalysis, parts: ProjectParts): Map<string, CodePart[]> {
  const byUnit = new Map<string, CodePart[]>();
  for (const [fileId, fileParts] of parts) {
    const language = analysis.byFile.get(fileId)?.language;
    if (language === undefined) continue;
    for (const part of fileParts) {
      const key = part.ownsUnit ? unitRefKey(fileId, language, part.unitName) : definedUnitKey(analysis, language, part.unitName);
      if (key !== undefined) byUnit.set(key, [...(byUnit.get(key) ?? []), part]);
    }
  }
  return byUnit;
}

const isMarkedTestbench = (p: Project, fileId: string): boolean => p.overrides.roles[fileId] === 'tb';
const isSimModel = (p: Project, fileId: string): boolean => p.overrides.simModels?.[fileId] === true;
const isTestbench = (e: UnitEntry): boolean => e.role === 'tb';

/** Roots 1, 2 and 4 of § 4: a design, a board design, or a file the student marked as hardware. */
const isDesignRoot = (p: Project, e: UnitEntry): boolean => e.role === 'rtl' || e.unit.hasBoardPorts || isSimModel(p, e.fileId);

/** The units a unit instantiates, as the project defines them; `guarded` ones too only when asked. */
function instantiated(p: Project, key: string, withGuarded: boolean): string[] {
  const language = p.units.get(key)?.language;
  if (language === undefined) return [];
  // An architecture in another file the student marked *Treat as testbench* is not the unit's hardware: its instances don't count.
  const parts = (p.parts.get(key) ?? []).filter((part) => part.ownsUnit || !isMarkedTestbench(p, part.fileId));
  const instances = parts.flatMap((part) => part.instances).filter((i) => withGuarded || !i.guarded);
  const targets = instances.map((i) => definedUnitKey(p.analysis, language, i.name));
  return [...new Set(targets)].filter((k): k is string => k !== undefined && k !== key && !isMarkedTestbench(p, fileOfKey(k)));
}

/** Every unit reachable from `roots` through unguarded instances; cycles are cut here. */
function reachable(p: Project, roots: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const pending = [...roots];
  for (let key = pending.pop(); key !== undefined; key = pending.pop()) {
    if (seen.has(key)) continue;
    seen.add(key);
    pending.push(...instantiated(p, key, false));
  }
  return seen;
}

/** A testbench and the design it tests (§ 4.2), or nothing when that is ambiguous. */
function dutPair(p: Project, tb: UnitEntry): [string, string][] {
  const dut = resolvedDut(p, tb);
  return dut === undefined ? [] : [[tb.key, dut]];
}

/** In order: a stored pairing, the name (`counter_tb` -> `counter`), the only design, the only unit. */
function resolvedDut(p: Project, tb: UnitEntry): string | undefined {
  const candidates = instantiated(p, tb.key, true);
  return pairedByStudent(p, tb, candidates) ?? namedAfter(tb, candidates) ?? onlyOne(candidates.filter((k) => p.units.get(k)?.role === 'rtl')) ?? onlyOne(candidates);
}

function pairedByStudent(p: Project, tb: UnitEntry, candidates: readonly string[]): string | undefined {
  const designs = Object.keys(p.overrides.pairs).filter((designId) => p.overrides.pairs[designId] === tb.fileId);
  const kept = designs.filter((designId) => !contradictsCode(p.analysis, p.overrides, designId, tb.fileId));
  return candidates.find((k) => kept.includes(fileOfKey(k)));
}

function namedAfter(tb: UnitEntry, candidates: readonly string[]): string | undefined {
  const stem = unitKey(tb.language, testbenchStem(tb.unit.name));
  return candidates.find((k) => nameOfKey(k) === stem);
}

const onlyOne = (keys: readonly string[]): string | undefined => (keys.length === 1 ? keys[0] : undefined);
