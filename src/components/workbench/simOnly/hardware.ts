// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which code is hardware (docs/impl_sim_only_warnings.md § 4): the roots — designs,
 * board designs, a testbench's resolved DUT, files the student marked — and every
 * unit they instantiate, outside code hidden from synthesis. The student's *Treat as
 * testbench* always wins. One answer for the warnings, the groups and pairing. Pure.
 *
 * Two views of the code meet here. The hardware walk follows the instances synthesis
 * sees (the parts, read with SYNTHESIS defined), so a module that exists only inside
 * `ifdef SYNTHESIS is checked too. A testbench's DUT is found from the instances the
 * simulator sees (the detector's units), so an instance inside `ifndef SYNTHESIS still
 * pairs the testbench with its design.
 */

import { unitKey } from '../tbDetect/analyzeProject';
import { contradictsCode, testbenchStem } from '../tbDetect/pairing';
import type { Instance, Language, ProjectAnalysis, TestbenchOverrides, UnitRole } from '../tbDetect/types';
import type { CodePart, HardwareView, ProjectParts } from './types';
import { definedUnitKey, fileOfKey, nameOfKey, unitRefKey } from './unitRef';

interface UnitEntry {
  readonly key: string;
  readonly fileId: string;
  readonly language: Language;
  readonly name: string;
  readonly hasBoardPorts: boolean;
  /** The detector's role with the student's mark applied; a unit only synthesis sees is a design. */
  readonly role: UnitRole;
  /** The instances the simulator sees; none for a unit only synthesis sees. */
  readonly simulatedInstances: readonly Instance[];
}

/** What the passes share: the project, the student's marks, and every unit and part by key. */
interface Project {
  readonly analysis: ProjectAnalysis;
  readonly overrides: TestbenchOverrides;
  readonly units: ReadonlyMap<string, UnitEntry>;
  readonly parts: ReadonlyMap<string, readonly CodePart[]>;
  /** The key of a unit by its name, as the language compares names: the detector's units, then those only synthesis sees. */
  readonly keyOf: (language: Language, name: string) => string | undefined;
}

export function hardwareView(analysis: ProjectAnalysis, overrides: TestbenchOverrides, parts: ProjectParts): HardwareView {
  const units = unitEntries(analysis, overrides, parts);
  const keyOf = unitIndex(analysis, units);
  const project: Project = { analysis, overrides, units, parts: partsByUnit(analysis, parts, keyOf), keyOf };
  const all = [...project.units.values()];
  const entries = all.filter((e) => !isMarkedTestbench(project, e.fileId));
  // A testbench the student marked is still a testbench: its DUT stays hardware.
  const dutOf = new Map(all.filter(isTestbench).flatMap((tb) => dutPair(project, tb)));
  const duts = [...dutOf.values()];
  const designs = entries.filter((e) => isDesignRoot(project, e)).map((e) => e.key);
  const boardDesigns = entries.filter((e) => e.hasBoardPorts).map((e) => e.key);
  return {
    hardware: reachable(project, [...designs, ...duts]),
    dutOf,
    asDesign: new Set([...reachable(project, boardDesigns), ...duts]),
    testbenchFiles: new Set(Object.keys(overrides.roles).filter((fileId) => overrides.roles[fileId] === 'tb')),
  };
}

/** The detector's units, and the units only synthesis sees (a module inside `ifdef SYNTHESIS). */
function unitEntries(analysis: ProjectAnalysis, overrides: TestbenchOverrides, parts: ProjectParts): Map<string, UnitEntry> {
  const detected = [...analysis.byFile.values()].flatMap((file) =>
    file.units.map((unit): UnitEntry => ({
      key: unitRefKey(file.fileId, file.language, unit.name),
      fileId: file.fileId,
      language: file.language,
      name: unit.name,
      hasBoardPorts: unit.hasBoardPorts,
      role: overrides.roles[file.fileId] ?? unit.role,
      simulatedInstances: unit.instances,
    })),
  );
  const entries = new Map(detected.map((e) => [e.key, e]));
  for (const [fileId, fileParts] of parts) {
    const language = analysis.byFile.get(fileId)?.language;
    if (language === undefined) continue;
    for (const part of fileParts.filter((p) => p.ownsUnit)) {
      const key = unitRefKey(fileId, language, part.unitName);
      if (entries.has(key)) continue;
      const role = overrides.roles[fileId] ?? 'rtl';
      entries.set(key, { key, fileId, language, name: part.unitName, hasBoardPorts: false, role, simulatedInstances: [] });
    }
  }
  return entries;
}

/** Names to keys: the project's own index first (what the simulator defines), then the units only synthesis sees. */
function unitIndex(analysis: ProjectAnalysis, units: ReadonlyMap<string, UnitEntry>): Project['keyOf'] {
  const synthesisOnly = new Map<string, string>();
  for (const e of units.values()) {
    const name = `${e.language}:${unitKey(e.language, e.name)}`;
    if (definedUnitKey(analysis, e.language, e.name) === undefined && !synthesisOnly.has(name)) synthesisOnly.set(name, e.key);
  }
  return (language, name) => definedUnitKey(analysis, language, name) ?? synthesisOnly.get(`${language}:${unitKey(language, name)}`);
}

/** Each unit's parts: its own code, and architectures of it in other files (§ 4.1). */
function partsByUnit(analysis: ProjectAnalysis, parts: ProjectParts, keyOf: Project['keyOf']): Map<string, CodePart[]> {
  const byUnit = new Map<string, CodePart[]>();
  for (const [fileId, fileParts] of parts) {
    const language = analysis.byFile.get(fileId)?.language;
    if (language === undefined) continue;
    for (const part of fileParts) {
      const key = part.ownsUnit ? unitRefKey(fileId, language, part.unitName) : keyOf(language, part.unitName);
      if (key !== undefined) byUnit.set(key, [...(byUnit.get(key) ?? []), part]);
    }
  }
  return byUnit;
}

const isMarkedTestbench = (p: Project, fileId: string): boolean => p.overrides.roles[fileId] === 'tb';
const isSimModel = (p: Project, fileId: string): boolean => p.overrides.simModels?.[fileId] === true;
const isTestbench = (e: UnitEntry): boolean => e.role === 'tb';

/** Roots 1, 2 and 4 of § 4: a design, a board design, or a file the student marked as hardware. */
const isDesignRoot = (p: Project, e: UnitEntry): boolean => e.role === 'rtl' || e.hasBoardPorts || isSimModel(p, e.fileId);

/** Instances as unit keys, the unit itself and units in files marked *Treat as testbench* left out. */
function targetsOf(p: Project, key: string, instances: readonly Instance[]): string[] {
  const language = p.units.get(key)?.language;
  if (language === undefined) return [];
  const targets = instances.map((i) => p.keyOf(language, i.name));
  return [...new Set(targets)].filter((k): k is string => k !== undefined && k !== key && !isMarkedTestbench(p, fileOfKey(k)));
}

/** The units a unit instantiates as synthesis sees it, outside code hidden from synthesis. */
function instantiated(p: Project, key: string): string[] {
  // An architecture in another file the student marked *Treat as testbench* is not the unit's hardware: its instances don't count.
  const parts = (p.parts.get(key) ?? []).filter((part) => part.ownsUnit || !isMarkedTestbench(p, part.fileId));
  return targetsOf(p, key, parts.flatMap((part) => part.instances).filter((i) => !i.guarded));
}

/** Every unit reachable from `roots` through the instances synthesis sees; cycles are cut here. */
function reachable(p: Project, roots: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const pending = [...roots];
  for (let key = pending.pop(); key !== undefined; key = pending.pop()) {
    if (seen.has(key)) continue;
    seen.add(key);
    pending.push(...instantiated(p, key));
  }
  return seen;
}

/** A testbench and the design it tests (§ 4.2), or nothing when that is ambiguous. */
function dutPair(p: Project, tb: UnitEntry): [string, string][] {
  const dut = resolvedDut(p, tb);
  return dut === undefined ? [] : [[tb.key, dut]];
}

/**
 * The units a testbench may test: every instance the simulator runs, guarded or not, in
 * any of its architectures (an `ifndef SYNTHESIS around the DUT instance changes nothing).
 */
function simulatedTargets(p: Project, tb: UnitEntry): string[] {
  const inParts = (p.parts.get(tb.key) ?? []).flatMap((part) => part.instances);
  return targetsOf(p, tb.key, [...tb.simulatedInstances, ...inParts]);
}

/** In order: a stored pairing, the name (`counter_tb` -> `counter`), the only design, the only unit. */
function resolvedDut(p: Project, tb: UnitEntry): string | undefined {
  const candidates = simulatedTargets(p, tb);
  return pairedByStudent(p, tb, candidates) ?? namedAfter(tb, candidates) ?? onlyOne(candidates.filter((k) => p.units.get(k)?.role === 'rtl')) ?? onlyOne(candidates);
}

function pairedByStudent(p: Project, tb: UnitEntry, candidates: readonly string[]): string | undefined {
  const designs = Object.keys(p.overrides.pairs).filter((designId) => p.overrides.pairs[designId] === tb.fileId);
  const kept = designs.filter((designId) => !contradictsCode(p.analysis, p.overrides, designId, tb.fileId));
  return candidates.find((k) => kept.includes(fileOfKey(k)));
}

function namedAfter(tb: UnitEntry, candidates: readonly string[]): string | undefined {
  const stem = unitKey(tb.language, testbenchStem(tb.name));
  return candidates.find((k) => nameOfKey(k) === stem);
}

const onlyOne = (keys: readonly string[]): string | undefined => (keys.length === 1 ? keys[0] : undefined);
