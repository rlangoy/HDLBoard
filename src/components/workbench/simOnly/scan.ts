// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * One file as the design check reads it (docs/impl_sim_only_warnings.md § 4.1, § 4.3):
 * its blanked code, the lines hidden from synthesis, and its design units — the
 * file's own, and architectures of entities declared in another file. The detector
 * keeps no blanked code, so a file is blanked again here, once per content: the
 * scan is cached by the file's analysis object, which the detector reuses while the
 * content is unchanged. Pure.
 */

import { blankSource, type FullCaseMarks } from '../tbDetect/blank';
import { designUnits } from '../tbDetect/designUnits';
import { keepRanges, lineIndex, type LineOf } from '../tbDetect/lines';
import type { UnitText } from '../tbDetect/rules';
import type { DesignUnit, FileAnalysis, LineSpan } from '../tbDetect/types';

export interface ScannedUnit {
  readonly unit: DesignUnit;
  /** False for an architecture whose entity is declared in another file. */
  readonly ownsUnit: boolean;
}

export interface ScannedFile {
  readonly file: FileAnalysis;
  /** Same length as the source; comments, strings and character literals are spaces, but VHDL's `'0'` and `'1'` stay. */
  readonly code: string;
  readonly lineOf: LineOf;
  /** translate_off .. translate_on and `ifndef SYNTHESIS regions. */
  readonly hidden: readonly LineSpan[];
  /** Verilog: where the `full_case` marks of active code start (`blank.ts`). */
  readonly fullCase: FullCaseMarks;
  readonly units: readonly ScannedUnit[];
}

const cache = new WeakMap<FileAnalysis, ScannedFile>();

export function scannedFile(file: FileAnalysis): ScannedFile {
  const cached = cache.get(file);
  if (cached) return cached;
  const scan = scanFile(file);
  cache.set(file, scan);
  return scan;
}

function scanFile(file: FileAnalysis): ScannedFile {
  // As synthesis reads it: `ifdef SYNTHESIS code is checked, `ifndef SYNTHESIS (and the else of `ifdef SYNTHESIS) is not.
  const blanked = blankSource(file.language, file.content, 'synthesis');
  const base = { file, code: blanked.code, lineOf: lineIndex(blanked.code), hidden: blanked.simOnlyRegions, fullCase: blanked.fullCase };
  const own = synthesisUnits(file, blanked.code).map((unit) => ({ unit, ownsUnit: true }));
  const foreign = foreignArchitectures(base).map((unit) => ({ unit, ownsUnit: false }));
  return { ...base, units: [...own, ...foreign] };
}

/**
 * The file's units as synthesis sees them. VHDL has no preprocessor, so they are the
 * detector's; a Verilog `ifdef SYNTHESIS may hold blocks and instances the simulator's view lacks.
 */
function synthesisUnits(file: FileAnalysis, code: string): readonly DesignUnit[] {
  return file.language === 'vhdl' ? file.units : designUnits('verilog', code, new Set());
}

export const isHidden = (line: number, hidden: readonly LineSpan[]): boolean => hidden.some((s) => line >= s.start && line <= s.end);

/** The unit's slice of the file, gaps between its ranges blanked (as analyzeFile builds it for the rules). */
export function unitText(scan: ScannedFile, unit: DesignUnit): UnitText {
  const base = Math.min(...unit.ranges.map((r) => r.from));
  const end = Math.max(...unit.ranges.map((r) => r.to));
  const slice = scan.code.slice(base, end);
  const local = unit.ranges.map((r) => ({ from: r.from - base, to: r.to - base }));
  const code = unit.ranges.length === 1 ? slice : keepRanges(slice, local);
  return { unit, code, base, lineOf: scan.lineOf, simOnlyRegions: scan.hidden, fullCase: scan.fullCase };
}

const ARCHITECTURE_OF = /\barchitecture\s+\w+\s+of\s+(\w+)\s+is\b/gi;

/**
 * Architectures whose entity is not in this file (§ 4.1). The detector drops them;
 * here a stand-in entity is put after the code, so the detector's own scan gives
 * them their blocks, instances and ranges. Every offset before the stand-ins is the
 * file's own.
 */
function foreignArchitectures(scan: Omit<ScannedFile, 'units'>): DesignUnit[] {
  if (scan.file.language !== 'vhdl') return [];
  const own = new Set(scan.file.units.map((u) => u.name.toLowerCase()));
  const names = new Set([...scan.code.matchAll(ARCHITECTURE_OF)].map((m) => m[1].toLowerCase()).filter((n) => !own.has(n)));
  if (names.size === 0) return [];
  const standIns = [...names].map((name) => `\nentity ${name} is end;`).join('');
  return designUnits('vhdl', scan.code + standIns, new Set())
    .filter((unit) => names.has(unit.name.toLowerCase()))
    .map((unit) => ({ ...unit, ranges: unit.ranges.filter((r) => r.to <= scan.code.length) }))
    .filter((unit) => unit.ranges.length > 0);
}
