// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The simulator's own clock in hardware code (docs/impl_sim_only_warnings.md § 3.5).
 * HDLBoard gives every board a slow clock, `CLOCK_500Hz` unless the board names it
 * otherwise, so a design can count slowly enough to watch. The FPGA board has no
 * such pin, so a design that reads it only works in the simulator. Declaring the port
 * is harmless (the starter files do); reading it is the finding, once per unit, on the
 * first line that reads it. Pure.
 */

import type { UnitText } from '../tbDetect/rules';
import type { Language } from '../tbDetect/types';
import { partUnitKey } from './findings';
import { escapeRegExp } from './constructText';
import { isHidden, scannedFile, unitText, type ScannedFile } from './scan';
import type { BoardDefinition } from '../../../boards/types';
import type { CodePart, DesignView, SimOnlyFinding, SimulatorClock } from './types';

/** A board's simulator-only clock, and its real one for the fix. */
export const simulatorClockOf = (board: BoardDefinition): SimulatorClock => ({ name: board.ports.clock500Hz, board: board.ports.clock });

/** Where a unit's body starts: after the VHDL entity (at `architecture`), after the Verilog module header. */
function bodyStart(t: UnitText, language: Language): number | undefined {
  if (language === 'vhdl') {
    const at = t.code.search(/\barchitecture\b/i);
    return at < 0 ? undefined : at;
  }
  const module = t.code.search(/\bmodule\b/);
  const headerEnd = module < 0 ? -1 : t.code.indexOf(';', module);
  return headerEnd < 0 ? undefined : headerEnd + 1;
}

/** The clock to look for, in one file's language. */
interface Search {
  readonly language: Language;
  readonly name: string;
}

/** How far past a name to look for `:` or `=>`, which make it a declaration or a formal. */
const AFTER_NAME_CHARS = 8;

/**
 * Whether the name at `at` (offsets in `t.code`) is declared or named as a formal, which is
 * not a read: `CLOCK_500Hz : in std_logic` and `CLOCK_500Hz =>` in VHDL, `.CLOCK_500Hz(` and an
 * `input` declaration in Verilog. The actual of a port map is a read.
 */
function isDeclarationOrFormal(t: UnitText, language: Language, name: { readonly at: number; readonly length: number }): boolean {
  const end = name.at + name.length;
  if (language === 'vhdl') return /^\s*(?::(?!=)|=>)/.test(t.code.slice(end, end + AFTER_NAME_CHARS));
  const statement = t.code.slice(t.code.lastIndexOf(';', name.at) + 1, name.at);
  return /\.\s*$/.test(statement) || /^\s*(?:input|output|inout)\b/.test(statement);
}

/** The first line of the unit's body that reads the clock, outside code hidden from synthesis. */
function firstRead(t: UnitText, search: Search, hidden: ScannedFile['hidden']): number | undefined {
  const start = bodyStart(t, search.language);
  if (start === undefined) return undefined;
  const pattern = new RegExp(`(?<![\\w$])${escapeRegExp(search.name)}(?![\\w$])`, search.language === 'vhdl' ? 'gi' : 'g');
  for (const m of t.code.slice(start).matchAll(pattern)) {
    const at = start + (m.index ?? 0);
    const line = t.lineOf(t.base + at);
    if (!isDeclarationOrFormal(t, search.language, { at, length: m[0].length }) && !isHidden(line, hidden)) return line;
  }
  return undefined;
}

/** Whether the unit (or, for an architecture of § 4.1, its entity in another file) has the clock as a port. */
function hasClockPort(view: DesignView, part: CodePart, search: Search): boolean {
  const same = (n: string) => (search.language === 'vhdl' ? n.toLowerCase() === search.name.toLowerCase() : n === search.name);
  const named = (u: { readonly name: string }) => u.name.toLowerCase() === part.unitName.toLowerCase();
  const units = [...view.raw.byFile.values()].filter((f) => f.language === search.language).flatMap((f) => f.units.filter(named));
  return units.some((u) => u.portNames.some(same));
}

/** One finding per hardware unit that reads the board's simulator-only clock. */
export function simulatorClockFindings(view: DesignView, clock: SimulatorClock): SimOnlyFinding[] {
  return [...view.parts].flatMap(([fileId, parts]) => {
    const file = view.raw.byFile.get(fileId);
    if (!file) return [];
    const scan = scannedFile(file);
    const search: Search = { language: file.language, name: clock.name };
    return parts.flatMap((part): SimOnlyFinding[] => {
      const unitRef = partUnitKey(view, part);
      if (unitRef === undefined || !view.hardware.hardware.has(unitRef)) return [];
      if (!hasClockPort(view, part, search)) return [];
      const scanned = scan.units.find((u) => u.ownsUnit === part.ownsUnit && u.unit.name === part.unitName);
      const line = scanned && firstRead(unitText(scan, scanned.unit), search, scan.hidden);
      if (line === undefined) return [];
      return [{ construct: 'sim-clock', tier: 'never', line, fileId, unitName: part.unitName, unitRef, simulatorClock: clock }];
    });
  });
}
