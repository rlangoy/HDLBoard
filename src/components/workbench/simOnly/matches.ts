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
import { ALL_OVERRIDDEN, type OverriddenModules } from './parameterOverrides';
import { isHidden, scannedFile, unitText, type ScannedFile, type ScannedUnit } from './scan';
import type { CodePart, ConstructMatch } from './types';

/** The ports of an entity declared in another file of the project, by its name (§ 4.1). */
export type ForeignPorts = (entityName: string) => readonly string[];

const NO_PORTS: ForeignPorts = () => [];

/** Per file: its parts, and what of the rest of the project they were read with (foreign ports, overridden modules). */
const cache = new WeakMap<FileAnalysis, { readonly project: string; readonly parts: readonly CodePart[] }>();

/**
 * The file's units, and its architectures of entities declared elsewhere, with their
 * constructs. Such an architecture is read with its entity's ports (`portsOf`), which the
 * file alone does not have; a Verilog module with whether something in the project
 * overrides its parameters (`overridden`). When either changes, the file is read again.
 */
export function partsOf(file: FileAnalysis, portsOf: ForeignPorts = NO_PORTS, overridden: OverriddenModules = ALL_OVERRIDDEN): readonly CodePart[] {
  const scan = scannedFile(file);
  const foreign = scan.units.filter((u) => !u.ownsUnit).map((u) => `${u.unit.name}:${portsOf(u.unit.name).join(',')}`).join(';');
  const overrides = scan.units.map((u) => (overridden(u.unit.name) ? '1' : '0')).join('');
  const project = `${foreign}|${overrides}`;
  const cached = cache.get(file);
  if (cached?.project === project) return cached.parts;
  const parts = scan.units.map((unit) => partOf(scan, unit, { portsOf, overridden }));
  cache.set(file, { project, parts });
  return parts;
}

function partOf(scan: ScannedFile, { unit, ownsUnit }: ScannedUnit, project: { portsOf: ForeignPorts; overridden: OverriddenModules }): CodePart {
  const read = ownsUnit ? unit : { ...unit, portNames: project.portsOf(unit.name) };
  return {
    fileId: scan.file.fileId,
    unitName: unit.name,
    ownsUnit,
    instances: unit.instances.map((i) => ({ ...i, guarded: isHidden(i.line, scan.hidden) })),
    blocks: unit.blocks,
    matches: constructsIn(unitText(scan, read, { parametersFixed: !project.overridden(unit.name) }), scan),
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
