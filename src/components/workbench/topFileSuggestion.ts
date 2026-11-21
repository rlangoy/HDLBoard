// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Whether the unit the student works on looks like the Top-File while Start would run
 * something else. What it looks for follows the unit on screen (the testbench pane's
 * while one is shown, else the design pane's):
 *
 * - A design: one that drives the active board itself (one of its port
 *   names) and that no design uses, neither another design of the project nor the unit
 *   Start runs now, at any depth. A sub-entity, or the DUT of a testbench that is top,
 *   never qualifies.
 * - A testbench: that testbench, unless Start already runs it.
 *
 * Pure.
 */

import { routeRun, type WorkingPane } from './editorView';
import { hasTopDot, isVerilogHeader } from './fileKinds';
import type { DesignView, ProjectParts } from './simOnly/types';
import { definedUnitKey, unitRefKey } from './simOnly/unitRef';
import { findUnit } from './tbDetect/analyzeProject';
import { effectiveFile } from './tbDetect/pairing';
import type {
  AnalyzedUnit, FileAnalysis, Instance, Language, ProjectAnalysis, TestbenchOverrides, UnitRole,
} from './tbDetect/types';

/** How many board ports the question names as its evidence: "uses SW, KEY and LEDR". */
export const MAX_PORTS_NAMED = 3;

/** A unit to run as top: what both the chip and the question act on. */
export interface TopUnit {
  readonly fileId: string;
  readonly unitName: string;
}

/** The units the student kept off the Top-File: never suggested again until the Top-File changes. */
export interface DeclinedUnits {
  readonly has: (unit: TopUnit) => boolean;
  readonly with: (unit: TopUnit) => DeclinedUnits;
}

/** The project as the run decisions read it. */
export interface MarkedProject {
  /** The analysis with the role correction applied. */
  readonly project: ProjectAnalysis;
  /** The student's *Treat as testbench / design* marks. */
  readonly overrides: TestbenchOverrides;
  /** The design check's parts: they hold the architectures written in another file than their entity. */
  readonly parts: ProjectParts;
  /** Testbench unit key -> the design it tests, as the editor pairs them (the design check's `hardware.dutOf`). */
  readonly dutOf: ReadonlyMap<string, string>;
}

/** The project as the design check sees it, in the shape the offer reads. */
export function markedProjectOf(view: DesignView, overrides: TestbenchOverrides): MarkedProject {
  return { project: view.corrected, overrides, parts: view.parts, dutOf: view.hardware.dutOf };
}

export interface TopFileQuestion extends MarkedProject {
  /** The active board's own port names, lower case (`portKeysOf`), not the legacy ones every board accepts. */
  readonly boardPorts: ReadonlySet<string>;
  /** The pane the student works in; null while no file is shown. */
  readonly working: WorkingPane | null;
  readonly topFileId: string | null;
  /** The unit of the Top-File that Start runs, when one was chosen; null lets Start choose. */
  readonly topUnit: string | null;
  readonly declined: DeclinedUnits;
}

interface SuggestionBase extends TopUnit {
  readonly fileName: string;
  /** The file, or `file › unit` when the file holds more than one unit: what the student is asked about. */
  readonly label: string;
  readonly unitKind: AnalyzedUnit['kind'];
}

/** A design that drives the board itself. */
export interface BoardDesignSuggestion extends SuggestionBase {
  readonly kind: 'board-design';
  /** The board ports the unit declares, as written, at most MAX_PORTS_NAMED. */
  readonly boardPorts: readonly string[];
}

/** A testbench, which drives its design itself. */
export interface TestbenchSuggestion extends SuggestionBase {
  readonly kind: 'testbench';
  /** The design it instantiates, when the project defines one. */
  readonly dutName: string | null;
}

export type TopFileSuggestion = BoardDesignSuggestion | TestbenchSuggestion;

export const NO_DECLINED_UNITS: DeclinedUnits = declinedUnits(new Set());

export function topFileSuggestion(question: TopFileQuestion): TopFileSuggestion | null {
  const file = workingFile(question);
  if (!file || !question.working) return null;
  const graph = instanceGraph(question, runFileIds(question));
  const offer: Offer = { question, file, graph, running: reachableFrom(graph, runUnitKey(question)) };
  // The unit on screen decides: a testbench is one in either pane (shown alone, before the split opens).
  const suggestion = OFFERS[unitOnScreen(file, question.working)?.role ?? question.working.pane](offer);
  return suggestion && !question.declined.has(suggestion) ? suggestion : null;
}

function declinedUnits(keys: ReadonlySet<string>): DeclinedUnits {
  const keyOf = ({ fileId, unitName }: TopUnit) => `${fileId}\n${unitName}`;
  return {
    has: (unit) => keys.has(keyOf(unit)),
    with: (unit) => declinedUnits(new Set([...keys, keyOf(unit)])),
  };
}

/** The pane's unit as the split view picks it (`withCurrentUnit`): the named one, else one of the pane's role. */
function unitOnScreen(file: FileAnalysis, working: WorkingPane): AnalyzedUnit | undefined {
  return findUnit(file, working.unitName) ?? file.units.find((u) => u.role === working.pane) ?? file.units[0];
}

/** The working pane's file, when it is a design source a run can start from (no header). */
function workingFile({ project, overrides, working }: TopFileQuestion): FileAnalysis | undefined {
  const file = working ? effectiveFile(project, overrides, working.fileId) : undefined;
  return file && hasTopDot(file.folder) && !isVerilogHeader(file.name) ? file : undefined;
}

/** What one pane's offer reads. */
interface Offer {
  readonly question: TopFileQuestion;
  readonly file: FileAnalysis;
  readonly graph: ReadonlyMap<string, GraphNode>;
  /** The unit Start runs now and every unit it reaches. */
  readonly running: ReadonlySet<string>;
}

/** Each kind of unit has its own kind of offer. */
const OFFERS: Readonly<Record<UnitRole, (offer: Offer) => TopFileSuggestion | null>> = {
  rtl: boardDesignOffer,
  tb: testbenchOffer,
};

/**
 * The file's first design that drives the active board and that no design uses: a
 * part's parent is the top candidate (Vivado's automatic hierarchy picks a root the
 * same way). A testbench that is not top does not count: testing a board design is no
 * reason to keep it off top.
 */
function boardDesignOffer(offer: Offer): TopFileSuggestion | null {
  const { question, file, graph, running } = offer;
  // The Top-File's own designs are not offered: the file is top already, and another of
  // its units runs from its pane's Play. Offering one would make two designs take turns.
  if (file.fileId === question.topFileId) return null;
  const used = instantiatedByDesigns(graph);
  const isRoot = (key: string) => !used.has(key) && !running.has(key);
  const unit = file.units.find((u) => drivesTheBoard(u, question.boardPorts) && isRoot(keyOf(file, u)));
  return unit ? suggestionFor(offer, unit) : null;
}

/** The testbench the pane shows (else the file's first), unless Start runs it already. */
function testbenchOffer(offer: Offer): TopFileSuggestion | null {
  const { question, file, running } = offer;
  const unit = shownTestbench(file, question.working?.unitName ?? null);
  return unit && !running.has(keyOf(file, unit)) ? suggestionFor(offer, unit) : null;
}

/**
 * The offer as the run it starts: a unit with a port of the board runs on the board,
 * whatever its role (the backend's rule, server/src/engines), so a board design marked
 * *Treat as testbench* is described as the board run it gets.
 */
function suggestionFor({ question, file, graph }: Offer, unit: AnalyzedUnit): TopFileSuggestion {
  const base = suggestionBase(file, unit);
  const boardPorts = activeBoardPorts(unit, question.boardPorts);
  if (boardPorts.length > 0) return { kind: 'board-design', ...base, boardPorts: boardPorts.slice(0, MAX_PORTS_NAMED) };
  const dutKey = question.dutOf.get(keyOf(file, unit));
  return { kind: 'testbench', ...base, dutName: (dutKey && graph.get(dutKey)?.name) ?? null };
}

function shownTestbench(file: FileAnalysis, unitName: string | null): AnalyzedUnit | undefined {
  const shown = findUnit(file, unitName);
  return shown?.role === 'tb' ? shown : file.units.find((u) => u.role === 'tb');
}

function suggestionBase(file: FileAnalysis, unit: AnalyzedUnit): SuggestionBase {
  const label = file.units.length > 1 ? `${file.name} › ${unit.name}` : file.name;
  return { fileId: file.fileId, fileName: file.name, label, unitName: unit.name, unitKind: unit.kind };
}

const keyOf = (file: FileAnalysis, unit: AnalyzedUnit): string => unitRefKey(file.fileId, file.language, unit.name);

/** A design (never a testbench) that declares a port of the active board. */
function drivesTheBoard(unit: AnalyzedUnit, boardPorts: ReadonlySet<string>): boolean {
  return unit.role === 'rtl' && activeBoardPorts(unit, boardPorts).length > 0;
}

function activeBoardPorts(unit: AnalyzedUnit, boardPorts: ReadonlySet<string>): string[] {
  return unit.portNames.filter((port) => boardPorts.has(port.toLowerCase()));
}

/** Every unit a design instantiates (not one only a testbench does). */
function instantiatedByDesigns(graph: ReadonlyMap<string, GraphNode>): Set<string> {
  const used = new Set<string>();
  for (const [key, node] of graph) {
    if (node.role === 'rtl') node.targets.filter((target) => target !== key).forEach((target) => used.add(target));
  }
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
  /** As written. */
  readonly name: string;
  readonly role: AnalyzedUnit['role'];
  /** The keys of the units it instantiates, in its own file or in an architecture written elsewhere. */
  readonly targets: readonly string[];
}

/**
 * The files a run can include: the design folders, and the Top-File itself, which may be a
 * testbench in work/ that a pane's Play ran. Any other work/ file never runs, so a design it
 * instantiates is still a root.
 */
function runFileIds({ project, topFileId }: TopFileQuestion): Set<string> {
  const files = [...project.byFile.values()];
  const included = includedHeaders(files);
  const isCompiled = (f: FileAnalysis) => hasTopDot(f.folder) && (!isVerilogHeader(f.name) || included.has(f.name));
  return new Set(files.filter((f) => isCompiled(f) || f.fileId === topFileId).map((f) => f.fileId));
}

const INCLUDE = /`include\s+"([^"]+)"/g;

/**
 * The Verilog headers a source includes, directly or through another included header,
 * by file name: Icarus compiles a header only there, so one nobody includes never runs.
 */
function includedHeaders(files: readonly FileAnalysis[]): Set<string> {
  const byName = new Map(files.map((f) => [f.name, f]));
  const included = new Set<string>();
  const pending = files.filter((f) => f.language === 'verilog' && !isVerilogHeader(f.name));
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    const names = [...file.content.matchAll(INCLUDE)].map((m) => m[1].split('/').pop() ?? m[1]);
    for (const header of names.map((name) => byName.get(name)).filter((h): h is FileAnalysis => h !== undefined)) {
      if (!included.has(header.name)) pending.push(header);
      included.add(header.name);
    }
  }
  return included;
}

/** Each unit of the run's files with its role (the student's marks applied) and the units it instantiates. */
function instanceGraph(marked: MarkedProject, runFiles: ReadonlySet<string>): Map<string, GraphNode> {
  const { project, overrides } = marked;
  const graph = new Map<string, GraphNode>();
  const files = [...runFiles].map((fileId) => effectiveFile(project, overrides, fileId));
  for (const file of files.filter((f): f is FileAnalysis => f !== undefined)) {
    for (const unit of file.units) {
      const targets = keysOf(project, file.language, unit.instances);
      graph.set(keyOf(file, unit), { name: unit.name, role: unit.role, targets });
    }
  }
  for (const foreign of foreignArchitectures(marked, runFiles)) {
    const node = graph.get(foreign.ownerKey);
    if (node) graph.set(foreign.ownerKey, { ...node, targets: [...node.targets, ...foreign.targets] });
  }
  return graph;
}

/**
 * The instances in VHDL architectures written in another file than their entity: they
 * belong to the entity. One in a file the student marked *Treat as testbench* does not.
 */
function foreignArchitectures(marked: MarkedProject, runFiles: ReadonlySet<string>): { ownerKey: string; targets: string[] }[] {
  const { project, overrides, parts } = marked;
  return [...parts].flatMap(([fileId, fileParts]) => {
    const language = project.byFile.get(fileId)?.language;
    if (language === undefined || !runFiles.has(fileId) || overrides.roles[fileId] === 'tb') return [];
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
  const keyFor = (name: string) => definedUnitKey(project, language, name) ?? definedUnitKey(project, otherLanguage, name);
  return instances.map((instance) => keyFor(instance.name)).filter((key): key is string => key !== undefined);
}
