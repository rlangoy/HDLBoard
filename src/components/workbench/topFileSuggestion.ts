// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Whether the file on screen looks like the Top-File while another file (or none) is
 * marked top: Start would run something else than the student is working on. A unit
 * qualifies when it is a design that drives the active board itself (one of its port
 * names, not a testbench) and no design uses it: neither another design of the project
 * nor the unit Start runs now, at any depth. A sub-entity, or the DUT of a testbench
 * that is top, never qualifies. Pure.
 */

import { routeRun } from './editorView';
import { hasTopDot } from './fileKinds';
import type { ProjectParts } from './simOnly/types';
import { definedUnitKey, unitRefKey } from './simOnly/unitRef';
import { effectiveFile } from './tbDetect/pairing';
import type { AnalyzedUnit, FileAnalysis, Instance, Language, ProjectAnalysis, TestbenchOverrides } from './tbDetect/types';

/** How many board ports the question names as its evidence: "uses SW, KEY and LEDR". */
export const MAX_PORTS_NAMED = 3;

/** The files the student kept off the Top-File this session: never suggested again until the top changes. */
export interface DeclinedFiles {
  readonly has: (fileId: string) => boolean;
  readonly with: (fileId: string) => DeclinedFiles;
}

/** The project as the run decisions read it. */
export interface MarkedProject {
  /** The analysis with the role correction applied. */
  readonly project: ProjectAnalysis;
  /** The student's *Treat as testbench / design* marks. */
  readonly overrides: TestbenchOverrides;
  /** The design check's parts: they hold the architectures written in another file than their entity. */
  readonly parts: ProjectParts;
}

export interface TopFileQuestion extends MarkedProject {
  /** The active board's own port names, lower case (`portKeysOf`), not the legacy ones every board accepts. */
  readonly boardPorts: ReadonlySet<string>;
  readonly shownFileId: string | null;
  readonly topFileId: string | null;
  /** The unit of the Top-File that Start runs, when one was chosen; null lets Start choose. */
  readonly topUnit: string | null;
  readonly declined: DeclinedFiles;
}

/** A unit to run as top: what both the chip and the question act on. */
export interface TopUnit {
  readonly fileId: string;
  readonly unitName: string;
}

export interface TopFileSuggestion extends TopUnit {
  readonly fileName: string;
  readonly unitKind: AnalyzedUnit['kind'];
  /** The board ports the unit declares, as written, at most MAX_PORTS_NAMED. */
  readonly boardPorts: readonly string[];
}

export const NO_DECLINED_FILES: DeclinedFiles = declinedFiles(new Set());

export function topFileSuggestion(question: TopFileQuestion): TopFileSuggestion | null {
  const shownFile = candidateFile(question);
  if (!shownFile) return null;
  const used = unitsUsedByDesigns(question);
  const isRoot = (unit: AnalyzedUnit) => !used.has(unitRefKey(shownFile.fileId, shownFile.language, unit.name));
  const unit = shownFile.units.find((u) => drivesTheBoard(u, question.boardPorts) && isRoot(u));
  return unit ? suggestionFor(shownFile, unit, question.boardPorts) : null;
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

/** A design (never a testbench) that declares a port of the active board. */
function drivesTheBoard(unit: AnalyzedUnit, boardPorts: ReadonlySet<string>): boolean {
  return unit.role === 'rtl' && activeBoardPorts(unit, boardPorts).length > 0;
}

function activeBoardPorts(unit: AnalyzedUnit, boardPorts: ReadonlySet<string>): string[] {
  return unit.portNames.filter((port) => boardPorts.has(port.toLowerCase()));
}

/**
 * Every unit a design instantiates, and every unit the run's unit reaches: these are
 * parts, and their parent is the top candidate (Vivado's automatic hierarchy picks a
 * root the same way). A testbench that is not top does not count: testing a board
 * design is no reason to keep it off top.
 */
function unitsUsedByDesigns(question: TopFileQuestion): Set<string> {
  const graph = instanceGraph(question);
  const used = new Set<string>();
  for (const [key, node] of graph) {
    if (node.role === 'rtl') node.targets.filter((target) => target !== key).forEach((target) => used.add(target));
  }
  for (const key of reachableFrom(graph, runUnitKey(question))) used.add(key);
  return used;
}

/** The key of the unit Start runs now, as Start chooses it; none without a Top-File. */
function runUnitKey({ project, overrides, topFileId, topUnit }: TopFileQuestion): string | undefined {
  const topFile = topFileId === null ? undefined : effectiveFile(project, overrides, topFileId);
  const unitName = routeRun(topFile, topUnit).unitName;
  return topFile && unitName !== null ? unitRefKey(topFile.fileId, topFile.language, unitName) : undefined;
}

/** Every unit reachable from `root` through the instances the simulator sees, the root included. */
function reachableFrom(graph: ReadonlyMap<string, GraphNode>, root: string | undefined): Set<string> {
  const seen = new Set<string>();
  const pending = root === undefined ? [] : [root];
  for (let key = pending.pop(); key !== undefined; key = pending.pop()) {
    if (seen.has(key)) continue;
    seen.add(key);
    pending.push(...(graph.get(key)?.targets ?? []));
  }
  return seen;
}

interface GraphNode {
  readonly role: AnalyzedUnit['role'];
  /** The keys of the units it instantiates, in its own file or in an architecture written elsewhere. */
  readonly targets: readonly string[];
}

/** Each unit with its role (the student's marks applied) and the units it instantiates. */
function instanceGraph({ project, overrides, parts }: MarkedProject): Map<string, GraphNode> {
  const graph = new Map<string, GraphNode>();
  const files = [...project.byFile.keys()].map((fileId) => effectiveFile(project, overrides, fileId));
  for (const file of files.filter((f): f is FileAnalysis => f !== undefined)) {
    for (const unit of file.units) {
      const targets = keysOf(project, file.language, unit.instances);
      graph.set(unitRefKey(file.fileId, file.language, unit.name), { role: unit.role, targets });
    }
  }
  for (const foreign of foreignArchitectures({ project, overrides, parts })) {
    const node = graph.get(foreign.ownerKey);
    if (node) graph.set(foreign.ownerKey, { ...node, targets: [...node.targets, ...foreign.targets] });
  }
  return graph;
}

/**
 * The instances in VHDL architectures written in another file than their entity: they
 * belong to the entity. One in a file the student marked *Treat as testbench* does not.
 */
function foreignArchitectures({ project, overrides, parts }: MarkedProject): { ownerKey: string; targets: string[] }[] {
  return [...parts].flatMap(([fileId, fileParts]) => {
    const language = project.byFile.get(fileId)?.language;
    if (language === undefined || overrides.roles[fileId] === 'tb') return [];
    return fileParts
      .filter((part) => !part.ownsUnit)
      .flatMap((part) => {
        const ownerKey = definedUnitKey(project, language, part.unitName);
        return ownerKey === undefined ? [] : [{ ownerKey, targets: keysOf(project, language, part.instances) }];
      });
  });
}

/** The keys of the instantiated units; a VHDL design may instantiate a Verilog module and back. */
function keysOf(project: ProjectAnalysis, language: Language, instances: readonly Instance[]): string[] {
  const otherLanguage: Language = language === 'vhdl' ? 'verilog' : 'vhdl';
  const keyOf = (name: string) => definedUnitKey(project, language, name) ?? definedUnitKey(project, otherLanguage, name);
  return instances.map((instance) => keyOf(instance.name)).filter((key): key is string => key !== undefined);
}

function suggestionFor(file: FileAnalysis, unit: AnalyzedUnit, boardPorts: ReadonlySet<string>): TopFileSuggestion {
  return {
    fileId: file.fileId,
    fileName: file.name,
    unitName: unit.name,
    unitKind: unit.kind,
    boardPorts: activeBoardPorts(unit, boardPorts).slice(0, MAX_PORTS_NAMED),
  };
}
