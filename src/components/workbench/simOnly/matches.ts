// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The code parts of a file and the constructs in them (docs/impl_sim_only_warnings.md
 * § 4.1, § 4.3, § 5.1). The detector keeps no blanked code, so a file is blanked
 * again here — once per content: the result is cached by the file's analysis
 * object, which the detector reuses while the content is unchanged. Pure.
 */

import { blankSource } from '../tbDetect/blank';
import { designUnits } from '../tbDetect/designUnits';
import { keepRanges, lineIndex, type LineOf } from '../tbDetect/lines';
import type { UnitText } from '../tbDetect/rules';
import type { DesignUnit, FileAnalysis, LineSpan } from '../tbDetect/types';
import { CONSTRUCTS } from './catalogue';
import type { CodePart, ConstructMatch } from './types';

const cache = new WeakMap<FileAnalysis, readonly CodePart[]>();

/** The file's units, and its architectures of entities declared elsewhere, with their constructs. */
export function partsOf(file: FileAnalysis): readonly CodePart[] {
  const cached = cache.get(file);
  if (cached) return cached;
  const parts = scanParts(file);
  cache.set(file, parts);
  return parts;
}

interface ScannedFile {
  readonly file: FileAnalysis;
  readonly code: string;
  readonly lineOf: LineOf;
  readonly hidden: readonly LineSpan[];
}

function scanParts(file: FileAnalysis): CodePart[] {
  const blanked = blankSource(file.language, file.content);
  const scan: ScannedFile = { file, code: blanked.code, lineOf: lineIndex(blanked.code), hidden: blanked.simOnlyRegions };
  const own = file.units.map((unit) => partOf(scan, unit, true));
  const foreign = foreignArchitectures(scan).map((unit) => partOf(scan, unit, false));
  return [...own, ...foreign];
}

const isHidden = (line: number, hidden: readonly LineSpan[]): boolean => hidden.some((s) => line >= s.start && line <= s.end);

function partOf(scan: ScannedFile, unit: DesignUnit, ownsUnit: boolean): CodePart {
  const text = unitText(scan, unit);
  return {
    fileId: scan.file.fileId,
    unitName: unit.name,
    ownsUnit,
    instances: unit.instances.map((i) => ({ ...i, guarded: isHidden(i.line, scan.hidden) })),
    blocks: unit.blocks,
    matches: constructsIn(text, scan),
  };
}

/** The unit's slice of the file, gaps between its ranges blanked (as analyzeFile builds it for the rules). */
function unitText(scan: ScannedFile, unit: DesignUnit): UnitText {
  const base = Math.min(...unit.ranges.map((r) => r.from));
  const end = Math.max(...unit.ranges.map((r) => r.to));
  const slice = scan.code.slice(base, end);
  const local = unit.ranges.map((r) => ({ from: r.from - base, to: r.to - base }));
  const code = unit.ranges.length === 1 ? slice : keepRanges(slice, local);
  return { unit, code, base, lineOf: scan.lineOf, simOnlyRegions: scan.hidden };
}

/** One match per construct and line, outside code hidden from synthesis (S6), in line order. */
function constructsIn(text: UnitText, scan: ScannedFile): ConstructMatch[] {
  const seen = new Set<string>();
  const matches = CONSTRUCTS[scan.file.language].flatMap((c) =>
    c.find(text).map((line): ConstructMatch => ({ construct: c.id, tier: c.tier, line })),
  );
  return matches
    .filter((m) => !isHidden(m.line, scan.hidden))
    .filter((m) => !seen.has(`${m.construct}:${m.line}`) && !!seen.add(`${m.construct}:${m.line}`))
    .sort((a, b) => a.line - b.line);
}

const ARCHITECTURE_OF = /\barchitecture\s+\w+\s+of\s+(\w+)\s+is\b/gi;

/**
 * Architectures whose entity is not in this file (§ 4.1). The detector drops them;
 * here a stand-in entity is put after the code, so the detector's own scan gives
 * them their blocks, instances and ranges. Every offset before the stand-ins is the
 * file's own.
 */
function foreignArchitectures(scan: ScannedFile): DesignUnit[] {
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
