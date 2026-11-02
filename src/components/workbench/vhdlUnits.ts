// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The entities and architectures a VHDL file declares, read from their header
 * lines (`entity DE1_SoC is`, `architecture rtl of DE1_SoC is`), each on one
 * line as students write them. Pure.
 */

import { uniqueNearest } from './nearestWord';
import { splitLines } from './textLines';
import { architectureAbove } from './vhdlStructure';

const ENTITY_HEADER = /^\s*entity\s+(?<name>\w+)\s+is\b/i;
/** `before` runs up to the entity name, so its length is where that name starts. */
const ARCHITECTURE_HEADER = /^(?<before>\s*architecture\s+(?<name>\w+)\s+of\s+)(?<entity>\w+)\s+is\b/i;

export interface EntityHeader {
  readonly name: string;
  /** 1-based. */
  readonly line: number;
}

export interface ArchitectureHeader {
  readonly name: string;
  /** The entity it is `of`, as written. */
  readonly entity: string;
  /** 1-based. */
  readonly line: number;
  /** 0-based index of the entity name in its line. */
  readonly entityStart: number;
}

/** VHDL names are not case-sensitive. */
export function sameName(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Two architectures are one in the library when their entity and name match, in any case. */
export function architectureKey({ name, entity }: Pick<ArchitectureHeader, 'name' | 'entity'>): string {
  return `${entity}.${name}`.toLowerCase();
}

function codeOf(line: string): string {
  return line.replace(/--.*$/, '');
}

export function entityHeaders(content: string): EntityHeader[] {
  return splitLines(content).flatMap((text, i) => {
    const name = ENTITY_HEADER.exec(codeOf(text))?.groups?.name;
    return name === undefined ? [] : [{ name, line: i + 1 }];
  });
}

export function architectureHeaders(content: string): ArchitectureHeader[] {
  return splitLines(content).flatMap((text, i) => {
    const groups = ARCHITECTURE_HEADER.exec(codeOf(text))?.groups;
    if (groups === undefined) return [];
    return [{ name: groups.name, entity: groups.entity, line: i + 1, entityStart: groups.before.length }];
  });
}

/**
 * The last line of the architecture whose header is on `headerLine` (its
 * `end architecture;`). An architecture is open from its header to its end and
 * never again, so the first line it no longer encloses is found by halving.
 */
export function architectureLastLine(lines: readonly string[], headerLine: number): number {
  let inside = headerLine;
  let outside = lines.length + 1;
  while (outside - inside > 1) {
    const middle = Math.floor((inside + outside) / 2);
    if (architectureAbove(lines, middle)?.line === headerLine) inside = middle;
    else outside = middle;
  }
  return inside;
}

/** The entity a student probably meant by `written`: the nearest name, else the only entity there is. */
export function suggestedEntityName(written: string, entityNames: readonly string[]): string | undefined {
  const nearestName = uniqueNearest(written, entityNames);
  if (nearestName !== undefined) return nearestName;
  const distinct = new Set(entityNames.map((name) => name.toLowerCase()));
  return distinct.size === 1 ? entityNames[0] : undefined;
}
