// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Links a symbol in one file to the names it is connected to in another, through
 * the port and generic maps of an instance. With the testbench and the design side
 * by side, hovering a design port lights the testbench names wired to it, and
 * hovering a testbench signal, or the port-map formal, lights the design port:
 *
 *   uut : entity work.and_gate port map (a => a_in);    -- VHDL
 *   and_gate uut (.a(a_in));                             // Verilog
 *
 * A port belongs to the unit (entity or module) it is declared in, and only that
 * unit's instances link to it. Only named association is read. Pure.
 */

import { isIdentifier } from './analysis';
import type { FileSymbols } from './fileSymbols';
import { declaredUnits, instanceConnections, type DeclaredUnit } from './instances';
import { groupByLine, occurrencesOf } from './occurrences';
import { sourceTokens, spanOf, type SourceToken } from './sourceTokens';
import type { HdlSymbol, Occurrence, SourceSpan, SymbolKind } from './types';

/** One `formal => actual` of an instance. */
interface Connection {
  /** The instantiated entity, component or module, as written. */
  readonly unit: string;
  readonly formal: SourceToken;
  /** The first name in the actual that is a symbol of this file, if any (`sw(0)` → `sw`). */
  readonly actual: SourceToken | undefined;
}

/** A declared unit and where its text runs, as spans. */
interface UnitText {
  readonly name: string;
  readonly from: SourceSpan;
  /** Undefined: to the end of the file. */
  readonly to: SourceSpan | undefined;
}

/** What one file declares and instantiates. */
interface Wiring {
  readonly units: readonly UnitText[];
  readonly connections: readonly Connection[];
}

/** The kinds a port or generic map can name. Function and task arguments are not among them. */
const CONNECTABLE: ReadonlySet<SymbolKind> = new Set(['port', 'generic', 'parameter']);

const NOTHING: ReadonlyMap<number, readonly Occurrence[]> = new Map();

/**
 * What to paint in `target` for the symbol highlighted in `source`, by 0-based line:
 * - a design port or generic: the formals naming it in the target's instances of
 *   its unit, and every occurrence of the signals connected to them;
 * - a signal connected in an instance, or that connection's formal: every
 *   occurrence of the port it is wired to.
 */
export function linkedOccurrences(
  source: FileSymbols,
  symbol: HdlSymbol,
  target: FileSymbols,
): ReadonlyMap<number, readonly Occurrence[]> {
  const names = nameRule(source, target);
  const occurrences = [...portToConnections(source, symbol, target, names), ...connectionToPort(source, symbol, target, names)];
  return occurrences.length === 0 ? NOTHING : groupByLine(withoutDuplicates(occurrences));
}

/** Design → testbench: the formals of instances of the port's unit that name it, and what they connect. */
function portToConnections(source: FileSymbols, port: HdlSymbol, target: FileSymbols, names: NameRule): Occurrence[] {
  if (!CONNECTABLE.has(port.kind)) return [];
  const unit = wiringOf(source).units.find((u) => contains(u, port.declaration));
  if (!unit) return [];
  return wiringOf(target)
    .connections.filter((c) => names.same(c.unit, unit.name) && names.same(c.formal.text, port.name))
    .flatMap((c) => [{ ...spanOf(c.formal), kind: 'reference' as const }, ...occurrencesAt(target, c.actual)]);
}

/** Testbench → design: the port each connection of `symbol` (a connected signal or a formal) is wired to. */
function connectionToPort(source: FileSymbols, symbol: HdlSymbol, target: FileSymbols, names: NameRule): Occurrence[] {
  const { units } = wiringOf(target);
  // By id: after an edit the caller may still hold the symbol from the previous analysis.
  const isThisSymbol = (token: SourceToken | undefined) => token !== undefined && symbolAt(source, token)?.id === symbol.id;
  return wiringOf(source)
    .connections.filter((c) => isThisSymbol(c.formal) || isThisSymbol(c.actual))
    .flatMap((c) => {
      const unit = units.find((u) => names.same(u.name, c.unit));
      if (!unit) return [];
      return target.index.symbols.filter(
        (s) => CONNECTABLE.has(s.kind) && contains(unit, s.declaration) && names.same(s.name, c.formal.text),
      );
    })
    .flatMap(occurrencesOf);
}

interface NameRule {
  same(a: string, b: string): boolean;
}

/** VHDL ignores case; names only match exactly when both files are Verilog. */
function nameRule(source: FileSymbols, target: FileSymbols): NameRule {
  const caseSensitive = source.language === 'verilog' && target.language === 'verilog';
  return { same: (a, b) => (caseSensitive ? a === b : a.toLowerCase() === b.toLowerCase()) };
}

function contains(unit: UnitText, span: SourceSpan): boolean {
  return !isBefore(span, unit.from) && (unit.to === undefined || isBefore(span, unit.to));
}

function isBefore(a: SourceSpan, b: SourceSpan): boolean {
  return a.line < b.line || (a.line === b.line && a.start < b.start);
}

function occurrencesAt(file: FileSymbols, token: SourceToken | undefined): Occurrence[] {
  const symbol = token && symbolAt(file, token);
  return symbol ? occurrencesOf(symbol) : [];
}

function symbolAt(file: FileSymbols, token: SourceToken): HdlSymbol | undefined {
  return file.index.symbolAt(token.line, token.start);
}

/** One occurrence per place; a declaration wins over a reference at the same place. */
function withoutDuplicates(occurrences: readonly Occurrence[]): Occurrence[] {
  const byPlace = new Map<string, Occurrence>();
  for (const occurrence of occurrences) {
    const place = `${occurrence.line}:${occurrence.start}`;
    if (byPlace.get(place)?.kind !== 'declaration') byPlace.set(place, occurrence);
  }
  return [...byPlace.values()];
}

const wiringCache = new WeakMap<FileSymbols, Wiring>();

/** The file's wiring, worked out once per analysis. */
function wiringOf(file: FileSymbols): Wiring {
  const cached = wiringCache.get(file);
  if (cached) return cached;
  const tokens = sourceTokens(file.tokenLines);
  const wiring: Wiring = {
    units: declaredUnits(file.language, tokens).map((unit) => unitText(unit, tokens)),
    connections: instanceConnections(file.language, tokens).map((c) => ({
      unit: c.unit,
      formal: tokens[c.formal],
      actual: tokens.slice(c.actualFrom, c.actualTo).find((t) => isIdentifier(t) && symbolAt(file, t)),
    })),
  };
  wiringCache.set(file, wiring);
  return wiring;
}

function unitText(unit: DeclaredUnit, tokens: readonly SourceToken[]): UnitText {
  const end = tokens[unit.to];
  return { name: unit.name, from: spanOf(tokens[unit.from]), to: end && spanOf(end) };
}
