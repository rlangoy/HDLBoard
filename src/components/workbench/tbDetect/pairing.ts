// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Which testbench goes with which design (docs/impl_split_screen.md § 5.8, D17,
 * D22). Deterministic: overrides first, then a file holding both, then
 * instantiation and naming, with a tie-break chain. Pairing only decides what
 * the panes show — never whether the split opens (B2). Pure.
 */

import { findUnit, unitKey, withRoleOverride } from './analyzeProject';
import { maxConfidence } from './score';
import type {
  AnalyzedUnit, Confidence, EditorPair, FileAnalysis, PaneTarget, ProjectAnalysis, TestbenchOverrides,
} from './types';

export function findPair(
  anchorId: string,
  analysis: ProjectAnalysis,
  overrides: TestbenchOverrides,
  recentFileIds: readonly string[],
): EditorPair {
  const anchor = effectiveFile(analysis, overrides, anchorId);
  if (!anchor) return { anchorId, tb: null, rtl: null, tbConfidence: 'low', missingDut: null };
  const paired = pairFromOverride(anchor, analysis, overrides);
  if (paired) return paired;
  if (anchor.role === 'mixed') return selfPair(anchor);
  if (anchor.role === 'tb') return pairForTestbench(anchor, analysis, overrides);
  return pairForDesign(anchor, analysis, overrides, recentFileIds);
}

/** The file as overrides make it: a role override replaces every unit's role. */
export function effectiveFile(analysis: ProjectAnalysis, overrides: TestbenchOverrides, fileId: string): FileAnalysis | undefined {
  const file = analysis.byFile.get(fileId);
  return file && withRoleOverride(file, overrides.roles[fileId]);
}

const tbUnits = (file: FileAnalysis): AnalyzedUnit[] => file.units.filter((u) => u.role === 'tb');
const rtlUnits = (file: FileAnalysis): AnalyzedUnit[] => file.units.filter((u) => u.role === 'rtl');
const tbConfidenceOf = (file: FileAnalysis): Confidence => maxConfidence(tbUnits(file).map((u) => u.confidence));

/** The TB pane's target: `unit` (default: the first testbench unit) at its first region. */
export function tbTarget(file: FileAnalysis, unit = tbUnits(file)[0] ?? file.units[0]): PaneTarget {
  const region = file.regions.find((r) => r.unitName === unit?.name);
  return { fileId: file.fileId, line: region?.span.start ?? unit?.declLine ?? 1, unitName: unit?.name ?? null };
}

/** The RTL pane's target: the first design unit, at its `entity` / `module` line. */
export function rtlTarget(file: FileAnalysis, unit = rtlUnits(file)[0] ?? file.units[0]): PaneTarget {
  return { fileId: file.fileId, line: unit?.declLine ?? 1, unitName: unit?.name ?? null };
}

function pairFromOverride(anchor: FileAnalysis, analysis: ProjectAnalysis, overrides: TestbenchOverrides): EditorPair | undefined {
  const tbId = overrides.pairs[anchor.fileId];
  const designId = Object.keys(overrides.pairs).find((id) => overrides.pairs[id] === anchor.fileId);
  const [design, tb] =
    tbId !== undefined
      ? [anchor, effectiveFile(analysis, overrides, tbId)]
      : [designId === undefined ? undefined : effectiveFile(analysis, overrides, designId), anchor];
  if (!tb || !design || contradictsCode(analysis, overrides, design.fileId, tb.fileId)) return undefined;
  return { anchorId: anchor.fileId, tb: tbTarget(tb), rtl: rtlTarget(design), tbConfidence: 'high', missingDut: null };
}

/**
 * A pairing the code rules out: the testbench instantiates designs that other
 * project files define, and none of them is in the design's file - `adder4_tb`,
 * which instantiates `adder4`, paired with `keyCouter2Led.vhdl`. Such a pair was
 * stored for code that has since changed, or picked by mistake, so it is never
 * offered, used or kept. A testbench that instantiates nothing the project
 * defines (yet) contradicts nothing.
 */
export function contradictsCode(analysis: ProjectAnalysis, overrides: TestbenchOverrides, designId: string, tbId: string): boolean {
  const design = effectiveFile(analysis, overrides, designId);
  const tb = effectiveFile(analysis, overrides, tbId);
  if (!design || !tb || design.language !== tb.language) return false;
  const key = (name: string) => unitKey(tb.language, name);
  const designUnits = new Set(design.units.map((u) => key(u.name)));
  const drivers = tbUnits(tb).length > 0 ? tbUnits(tb) : tb.units;
  const instances = drivers.flatMap((u) => u.instances.map((i) => i.name));
  const definedInAnotherFile = (name: string) => {
    const fileId = definingFile(analysis, tb, name);
    return fileId !== undefined && fileId !== tbId;
  };
  const testsThisDesign = instances.some((name) => designUnits.has(key(name)));
  return !testsThisDesign && instances.some(definedInAnotherFile);
}

function selfPair(anchor: FileAnalysis): EditorPair {
  return { anchorId: anchor.fileId, tb: tbTarget(anchor), rtl: rtlTarget(anchor), tbConfidence: tbConfidenceOf(anchor), missingDut: null };
}

/** Rule 4: the DUT is the instance named like the testbench, else the first one the project defines. */
function pairForTestbench(anchor: FileAnalysis, analysis: ProjectAnalysis, overrides: TestbenchOverrides): EditorPair {
  const unit = tbUnits(anchor)[0];
  const base = { anchorId: anchor.fileId, tb: tbTarget(anchor, unit), tbConfidence: tbConfidenceOf(anchor) };
  const names = unit.instances.map((i) => i.name);
  const stem = testbenchStem(unit.name);
  const defined = names.filter((n) => definingFile(analysis, anchor, n) !== undefined);
  const dut = defined.find((n) => unitKey(anchor.language, n) === unitKey(anchor.language, stem)) ?? defined[0];
  if (dut === undefined) return { ...base, rtl: null, missingDut: names[0] ?? null };
  const design = effectiveFile(analysis, overrides, definingFile(analysis, anchor, dut) ?? '');
  return { ...base, rtl: design ? rtlTarget(design, findUnit(design, dut)) : null, missingDut: null };
}

const definingFile = (analysis: ProjectAnalysis, from: FileAnalysis, unitName: string): string | undefined =>
  analysis.unitIndex[from.language].get(unitKey(from.language, unitName));

const TB_AFFIX = /^(?:tb_|test_)|(?:_tb|_test|_testbench)$/i;

/** `counter_tb` -> `counter`. */
export const testbenchStem = (name: string): string => name.replace(TB_AFFIX, '');

const fileStem = (name: string): string => name.replace(/\.[^.]*$/, '');

export interface PairCandidate {
  readonly file: FileAnalysis;
  readonly points: number;
}

/** Rule 3: same-language files with a testbench unit, best first; only those with >= 50 points. */
export function testbenchCandidates(
  anchor: FileAnalysis,
  analysis: ProjectAnalysis,
  overrides: TestbenchOverrides,
  recentFileIds: readonly string[],
): PairCandidate[] {
  const candidates = [...analysis.byFile.keys()]
    .filter((id) => id !== anchor.fileId)
    .map((id) => effectiveFile(analysis, overrides, id))
    .filter((f): f is FileAnalysis => f !== undefined && f.language === anchor.language && tbUnits(f).length > 0)
    .map((file) => ({ file, points: pairPoints(anchor, file) }))
    .filter((c) => c.points >= 50);
  return candidates.sort((a, b) => compareCandidates(a, b, recentFileIds));
}

function pairPoints(anchor: FileAnalysis, tb: FileAnalysis): number {
  const key = (n: string) => unitKey(anchor.language, n);
  const anchorUnits = new Set(anchor.units.map((u) => key(u.name)));
  const instantiates = tbUnits(tb).some((u) => u.instances.some((i) => anchorUnits.has(key(i.name))));
  const stems = new Set([fileStem(anchor.name), ...anchor.units.map((u) => u.name)].map((s) => s.toLowerCase()));
  const tbStem = fileStem(tb.name).toLowerCase();
  const named = TB_AFFIX.test(tbStem) && stems.has(testbenchStem(tbStem));
  return (instantiates ? 100 : 0) + (named ? 50 : 0) + (tb.folder === 'work' ? 10 : 0);
}

function compareCandidates(a: PairCandidate, b: PairCandidate, recent: readonly string[]): number {
  if (a.points !== b.points) return b.points - a.points;
  const rank = (id: string) => (recent.includes(id) ? recent.indexOf(id) : Number.MAX_SAFE_INTEGER);
  const byRecent = rank(a.file.fileId) - rank(b.file.fileId);
  return byRecent !== 0 ? byRecent : a.file.name.localeCompare(b.file.name);
}

function pairForDesign(
  anchor: FileAnalysis,
  analysis: ProjectAnalysis,
  overrides: TestbenchOverrides,
  recentFileIds: readonly string[],
): EditorPair {
  const rtl = rtlTarget(anchor);
  const best = testbenchCandidates(anchor, analysis, overrides, recentFileIds)[0]?.file;
  if (!best) return { anchorId: anchor.fileId, tb: null, rtl, tbConfidence: 'low', missingDut: null };
  const anchorUnits = new Set(anchor.units.map((u) => unitKey(anchor.language, u.name)));
  const driver = tbUnits(best).find((u) => u.instances.some((i) => anchorUnits.has(unitKey(anchor.language, i.name))));
  return { anchorId: anchor.fileId, tb: tbTarget(best, driver), rtl, tbConfidence: tbConfidenceOf(best), missingDut: null };
}
