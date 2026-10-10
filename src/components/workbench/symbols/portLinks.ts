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
 * Only named association is read (`formal => actual`, `.formal(actual)`). Pure.
 */

import type { Language } from '../fileKinds';
import { isIdentifier } from './analysis';
import type { FileSymbols } from './fileSymbols';
import { declaredUnits, instanceConnections } from './instances';
import { groupByLine } from './occurrences';
import { sourceTokens, type SourceToken } from './sourceTokens';
import type { HdlSymbol, Occurrence, SymbolKind } from './types';

/** One `formal => actual` of an instance. */
interface Connection {
  /** The instantiated entity, component or module, in lower case. */
  readonly unit: string;
  readonly formal: SourceToken;
  /** The first name in the actual that is a symbol of this file, if any (`sw(0)` → `sw`). */
  readonly actual: SourceToken | undefined;
}

/** What one file declares and instantiates. */
interface Wiring {
  /** The entities and modules it declares, in lower case. */
  readonly units: ReadonlySet<string>;
  readonly connections: readonly Connection[];
}

/** The kinds a port or generic map can name, per language. */
const CONNECTABLE: Readonly<Record<Language, ReadonlySet<SymbolKind>>> = {
  vhdl: new Set(['port', 'generic']),
  verilog: new Set(['port', 'parameter']),
};

const NOTHING: ReadonlyMap<number, readonly Occurrence[]> = new Map();

/**
 * What to paint in `target` for the symbol highlighted in `source`, by 0-based line:
 * - a design port or generic: the formals naming it in the target's instances, and
 *   every occurrence of the signals connected to them;
 * - a signal connected in an instance, or that connection's formal: every
 *   occurrence of the port it is wired to.
 */
export function linkedOccurrences(
  source: FileSymbols,
  symbol: HdlSymbol,
  target: FileSymbols,
): ReadonlyMap<number, readonly Occurrence[]> {
  const occurrences = [...portToConnections(source, symbol, target), ...connectionToPort(source, symbol, target)];
  return occurrences.length === 0 ? NOTHING : groupByLine(withoutDuplicates(occurrences));
}

/** Design → testbench: the instances of the source's units that connect `port`. */
function portToConnections(source: FileSymbols, port: HdlSymbol, target: FileSymbols): Occurrence[] {
  if (!isConnectable(source, port)) return [];
  const { units } = wiringOf(source);
  const key = nameKey(target.language, port.name);
  return wiringOf(target)
    .connections.filter((c) => units.has(c.unit) && nameKey(target.language, c.formal.text) === key)
    .flatMap((c) => [{ ...spanOf(c.formal), kind: 'reference' as const }, ...occurrencesOf(target, c.actual)]);
}

/** Testbench → design: the ports of the target's units that `symbol` (a connected signal or a formal) stands for. */
function connectionToPort(source: FileSymbols, symbol: HdlSymbol, target: FileSymbols): Occurrence[] {
  const { units } = wiringOf(target);
  const connects = (c: Connection) =>
    symbolAtToken(source, c.formal) === symbol || (c.actual !== undefined && symbolAtToken(source, c.actual) === symbol);
  const formals = wiringOf(source)
    .connections.filter((c) => units.has(c.unit) && connects(c))
    .map((c) => nameKey(target.language, c.formal.text));
  if (formals.length === 0) return [];
  return target.index.symbols
    .filter((s) => isConnectable(target, s) && formals.includes(nameKey(target.language, s.name)))
    .flatMap((s) => allOccurrences(s));
}

function isConnectable(file: FileSymbols, symbol: HdlSymbol): boolean {
  return CONNECTABLE[file.language ?? 'vhdl'].has(symbol.kind);
}

/** VHDL ignores case; Verilog does not. */
function nameKey(language: Language | undefined, name: string): string {
  return language === 'verilog' ? name : name.toLowerCase();
}

function occurrencesOf(file: FileSymbols, token: SourceToken | undefined): Occurrence[] {
  const symbol = token && symbolAtToken(file, token);
  return symbol ? allOccurrences(symbol) : [];
}

function allOccurrences(symbol: HdlSymbol): Occurrence[] {
  return [
    { ...symbol.declaration, kind: 'declaration' },
    ...symbol.references.map((span): Occurrence => ({ ...span, kind: 'reference' })),
  ];
}

function symbolAtToken(file: FileSymbols, token: SourceToken): HdlSymbol | undefined {
  return file.index.symbolAt(token.line, token.start);
}

function spanOf(token: SourceToken) {
  return { line: token.line, start: token.start, end: token.end };
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
  let wiring = wiringCache.get(file);
  if (!wiring) {
    const tokens = sourceTokens(file.tokenLines);
    wiring = {
      units: declaredUnits(file.language, tokens),
      connections: instanceConnections(file.language, tokens).map((c) => ({
        unit: c.unit,
        formal: tokens[c.formal],
        actual: firstSymbol(tokens.slice(c.actualFrom, c.actualTo), file),
      })),
    };
    wiringCache.set(file, wiring);
  }
  return wiring;
}

/** The first token that names a symbol of the file (`sw(0)` → `sw`). */
function firstSymbol(tokens: readonly SourceToken[], file: FileSymbols): SourceToken | undefined {
  return tokens.find((t) => isIdentifier(t) && symbolAtToken(file, t));
}
