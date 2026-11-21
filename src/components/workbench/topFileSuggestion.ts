// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Whether the file on screen looks like the Top-File while another file (or none) is
 * marked top: Start would run something else than the student is working on. A file
 * qualifies when it is a design that drives the board itself (a board port, not a
 * testbench), no other design uses it, and the current top's hierarchy does not use it
 * either: a sub-entity, or the DUT of a testbench that is top, never qualifies. Pure.
 */

import { hasTopDot } from './fileKinds';
import { effectiveFile } from './tbDetect/pairing';
import type { AnalyzedUnit, FileAnalysis, Language, ProjectAnalysis, TestbenchOverrides } from './tbDetect/types';
import { definedUnitKey, unitRefKey } from './simOnly/unitRef';

/** How many board ports the question names as its evidence: "uses SW, KEY and LEDR". */
export const MAX_PORTS_NAMED = 3;

/** The files the student kept off the Top-File this session: never suggested again until the top changes. */
export interface DeclinedFiles {
  readonly has: (fileId: string) => boolean;
  readonly with: (fileId: string) => DeclinedFiles;
}

export interface TopFileQuestion {
  /** The analysis with the role correction applied, as the run decisions use it. */
  readonly project: ProjectAnalysis;
  readonly overrides: TestbenchOverrides;
  /** Lower case, from `boardDesignPortNames`: the active board's names. */
  readonly boardPorts: ReadonlySet<string>;
  readonly shownFileId: string | null;
  readonly topFileId: string | null;
  readonly declined: DeclinedFiles;
}

export interface TopFileSuggestion {
  readonly fileId: string;
  readonly fileName: string;
  readonly unitName: string;
  readonly unitKind: AnalyzedUnit['kind'];
  /** The board ports the unit declares, as written, at most MAX_PORTS_NAMED. */
  readonly boardPorts: readonly string[];
}

export const NO_DECLINED_FILES: DeclinedFiles = declinedFiles(new Set());

export function topFileSuggestion(question: TopFileQuestion): TopFileSuggestion | null {
  const shownFile = candidateFile(question);
  const unit = shownFile && boardDesignUnit(shownFile);
  if (!shownFile || !unit) return null;
  const key = unitRefKey(shownFile.fileId, shownFile.language, unit.name);
  const isPartOfADesign = isInTopHierarchy(question, key) || isInstantiatedByADesign(question.project, key);
  return isPartOfADesign ? null : suggestionFor(shownFile, unit, question.boardPorts);
}

function declinedFiles(fileIds: ReadonlySet<string>): DeclinedFiles {
  return {
    has: (fileId) => fileIds.has(fileId),
    with: (fileId) => declinedFiles(new Set([...fileIds, fileId])),
  };
}

/** The shown file, when it is a design file that is not top yet and was not declined. */
function candidateFile({ project, overrides, shownFileId, topFileId, declined }: TopFileQuestion): FileAnalysis | undefined {
  const isOtherFile = shownFileId !== null && shownFileId !== topFileId;
  const file = isOtherFile ? effectiveFile(project, overrides, shownFileId) : undefined;
  const isOffered = file !== undefined && hasTopDot(file.folder) && !declined.has(file.fileId);
  return isOffered ? file : undefined;
}

/** The file's first unit that drives the board itself; a testbench never does, even with board names. */
function boardDesignUnit(file: FileAnalysis): AnalyzedUnit | undefined {
  return file.units.find((unit) => unit.hasBoardPorts && unit.role === 'rtl');
}

/** Whether `unitKey` is the top file's own unit or one its hierarchy instantiates, at any depth. */
function isInTopHierarchy({ project, overrides, topFileId }: TopFileQuestion, unitKey: string): boolean {
  const topFile = topFileId === null ? undefined : effectiveFile(project, overrides, topFileId);
  if (!topFile) return false;
  const roots = topFile.units.map((unit) => unitRefKey(topFile.fileId, topFile.language, unit.name));
  return instantiatedFrom(project, roots).has(unitKey);
}

/**
 * Whether another design uses the unit: then it is a part, and its parent is the top
 * candidate (Vivado's automatic hierarchy picks a root the same way). A testbench that
 * instantiates it does not count; testing a board design is no reason to keep it off top.
 */
function isInstantiatedByADesign(project: ProjectAnalysis, unitKey: string): boolean {
  const designs = [...unitsByKey(project).entries()].filter(([key, entry]) => key !== unitKey && entry.unit.role === 'rtl');
  return designs.some(([, entry]) => instancesOf(project, entry).includes(unitKey));
}

/** Every unit reachable from `roots` through the instances the simulator sees, the roots included. */
function instantiatedFrom(project: ProjectAnalysis, roots: readonly string[]): Set<string> {
  const units = unitsByKey(project);
  const seen = new Set<string>();
  const pending = [...roots];
  for (let key = pending.pop(); key !== undefined; key = pending.pop()) {
    if (seen.has(key)) continue;
    seen.add(key);
    pending.push(...instancesOf(project, units.get(key)));
  }
  return seen;
}

interface KeyedUnit {
  readonly language: Language;
  readonly unit: AnalyzedUnit;
}

function unitsByKey(project: ProjectAnalysis): Map<string, KeyedUnit> {
  const units = new Map<string, KeyedUnit>();
  for (const file of project.byFile.values()) {
    for (const unit of file.units) units.set(unitRefKey(file.fileId, file.language, unit.name), { language: file.language, unit });
  }
  return units;
}

/** The keys of the units `entry` instantiates; a VHDL design may instantiate a Verilog module and back. */
function instancesOf(project: ProjectAnalysis, entry: KeyedUnit | undefined): string[] {
  if (!entry) return [];
  const otherLanguage: Language = entry.language === 'vhdl' ? 'verilog' : 'vhdl';
  const keyOf = (name: string) => definedUnitKey(project, entry.language, name) ?? definedUnitKey(project, otherLanguage, name);
  return entry.unit.instances.map((instance) => keyOf(instance.name)).filter((key): key is string => key !== undefined);
}

function suggestionFor(file: FileAnalysis, unit: AnalyzedUnit, boardPorts: ReadonlySet<string>): TopFileSuggestion {
  const named = unit.portNames.filter((port) => boardPorts.has(port.toLowerCase()));
  return {
    fileId: file.fileId,
    fileName: file.name,
    unitName: unit.name,
    unitKind: unit.kind,
    boardPorts: named.slice(0, MAX_PORTS_NAMED),
  };
}
