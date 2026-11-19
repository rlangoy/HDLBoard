// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The code parts of a file and the simulation-only constructs in them
 * (docs/impl_sim_only_warnings.md § 4.1, § 4.3, § 5.1), cached with the file's scan.
 * Pure.
 */

import type { UnitText } from '../tbDetect/rules';
import type { FileAnalysis } from '../tbDetect/types';
import { CONSTRUCTS } from './catalogue';
import { isHidden, scannedFile, unitText, type ScannedFile, type ScannedUnit } from './scan';
import type { CodePart, ConstructMatch } from './types';

const cache = new WeakMap<FileAnalysis, readonly CodePart[]>();

/** The file's units, and its architectures of entities declared elsewhere, with their constructs. */
export function partsOf(file: FileAnalysis): readonly CodePart[] {
  const cached = cache.get(file);
  if (cached) return cached;
  const scan = scannedFile(file);
  const parts = scan.units.map((unit) => partOf(scan, unit));
  cache.set(file, parts);
  return parts;
}

function partOf(scan: ScannedFile, { unit, ownsUnit }: ScannedUnit): CodePart {
  return {
    fileId: scan.file.fileId,
    unitName: unit.name,
    ownsUnit,
    instances: unit.instances.map((i) => ({ ...i, guarded: isHidden(i.line, scan.hidden) })),
    blocks: unit.blocks,
    matches: constructsIn(unitText(scan, unit), scan),
  };
}

/** One match per construct and line, outside code hidden from synthesis (S6), in line order. */
function constructsIn(text: UnitText, scan: ScannedFile): ConstructMatch[] {
  const seen = new Set<string>();
  const matches = CONSTRUCTS[scan.file.language].flatMap((c) =>
    c.find(text).map((found): ConstructMatch =>
      typeof found === 'number' ? { construct: c.id, tier: c.tier, line: found } : { construct: c.id, tier: c.tier, ...found },
    ),
  );
  return matches
    .filter((m) => !isHidden(m.line, scan.hidden))
    .filter((m) => !seen.has(`${m.construct}:${m.line}`) && !!seen.add(`${m.construct}:${m.line}`))
    .sort((a, b) => a.line - b.line);
}
