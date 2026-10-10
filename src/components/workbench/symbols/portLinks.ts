// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Links a symbol in one file to the names it is connected to in another, through
 * the port and generic maps of an instance. With the testbench and the design side
 * by side, hovering a design port lights the testbench names wired to it, and
 * hovering a testbench signal lights the design port it drives:
 *
 *   uut : entity work.and_gate port map (a => a_in);    -- VHDL
 *   and_gate uut (.a(a_in));                             // Verilog
 *
 * Only named association is read (`formal => actual`, `.formal(actual)`). Pure.
 */

import type { Language } from '../fileKinds';
import { isIdentifier, matchingClose } from './analysis';
import type { FileSymbols } from './fileSymbols';
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
 * - a signal connected in an instance: every occurrence of the port it is wired to.
 */
export function linkedOccurrences(
  source: FileSymbols,
  symbol: HdlSymbol,
  target: FileSymbols,
): ReadonlyMap<number, readonly Occurrence[]> {
  const occurrences = [...portToConnections(source, symbol, target), ...signalToPort(source, symbol, target)];
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

/** Testbench → design: the ports of the target's units that `signal` is connected to. */
function signalToPort(source: FileSymbols, signal: HdlSymbol, target: FileSymbols): Occurrence[] {
  const { units } = wiringOf(target);
  const formals = wiringOf(source)
    .connections.filter((c) => units.has(c.unit) && c.actual && symbolAtToken(source, c.actual) === signal)
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
    wiring = file.language === 'verilog' ? verilogWiring(tokens, file) : vhdlWiring(tokens, file);
    wiringCache.set(file, wiring);
  }
  return wiring;
}

const lower = (token: SourceToken | undefined) => token?.text.toLowerCase();

/** `entity and_gate is` declares a unit; `port map (` / `generic map (` connect one. */
function vhdlWiring(tokens: readonly SourceToken[], file: FileSymbols): Wiring {
  const units = new Set<string>();
  const connections: Connection[] = [];
  tokens.forEach((token, i) => {
    if (lower(token) === 'entity' && isIdentifier(tokens[i + 1]) && lower(tokens[i + 2]) === 'is') {
      units.add(lower(tokens[i + 1])!);
    }
    const isMap = lower(token) === 'map' && ['port', 'generic'].includes(lower(tokens[i - 1]) ?? '') && tokens[i + 1]?.text === '(';
    const unit = isMap ? instantiatedUnit(tokens, i - 1) : undefined;
    if (unit) connections.push(...associations(tokens, i + 1, file).map((c) => ({ ...c, unit })));
  });
  return { units, connections };
}

/**
 * The unit an instance names, walking back from its `port` or `generic` keyword to
 * the label's `:`: the last name outside brackets (`entity work.and_gate(rtl)` → and_gate).
 */
function instantiatedUnit(tokens: readonly SourceToken[], keyword: number): string | undefined {
  let depth = 0;
  for (let j = keyword - 1; j >= 0; j--) {
    const { text } = tokens[j];
    if (text === ')') depth++;
    else if (text === '(') depth--;
    else if (depth > 0) continue;
    else if (text === ':' || text === ';') return undefined;
    else if (isIdentifier(tokens[j])) return text.toLowerCase();
  }
  return undefined;
}

/** `formal => actual` items of the bracket at `open`; positional items are skipped. */
function associations(tokens: readonly SourceToken[], open: number, file: FileSymbols): Omit<Connection, 'unit'>[] {
  const close = matchingClose(tokens, open);
  const items: Omit<Connection, 'unit'>[] = [];
  let start = open + 1;
  for (let j = start; j <= close; j++) {
    if (tokens[j].text === '(') j = matchingClose(tokens, j);
    else if (tokens[j].text === ',' || j === close) {
      const at = tokens.slice(start, j).findIndex((t) => t.text === '=>');
      if (at > 0 && isIdentifier(tokens[start])) {
        items.push({ formal: tokens[start], actual: firstSymbol(tokens, start + at + 1, j, file) });
      }
      start = j + 1;
    }
  }
  return items;
}

/** The first token in [from, to) that names a symbol of the file. */
function firstSymbol(tokens: readonly SourceToken[], from: number, to: number, file: FileSymbols): SourceToken | undefined {
  return tokens.slice(from, to).find((t) => isIdentifier(t) && file.index.symbolAt(t.line, t.start));
}

/** `module and_gate` declares a unit; `and_gate #(.N(4)) uut (.a(x));` connects one. */
function verilogWiring(tokens: readonly SourceToken[], file: FileSymbols): Wiring {
  const units = new Set<string>();
  const connections: Connection[] = [];
  tokens.forEach((token, i) => {
    if ((token.text === 'module' || token.text === 'macromodule') && isIdentifier(tokens[i + 1])) {
      units.add(tokens[i + 1].text.toLowerCase());
    }
    if (!isIdentifier(token) || !startsStatement(tokens, i)) return;
    const unit = token.text.toLowerCase();
    let next = i + 1;
    if (tokens[next]?.text === '#' && tokens[next + 1]?.text === '(') {
      connections.push(...namedConnections(tokens, next + 1, file).map((c) => ({ ...c, unit })));
      next = matchingClose(tokens, next + 1) + 1;
    }
    if (isIdentifier(tokens[next]) && tokens[next + 1]?.text === '(') {
      connections.push(...namedConnections(tokens, next + 1, file).map((c) => ({ ...c, unit })));
    }
  });
  return { units, connections };
}

/** A statement starts after `;`, a block keyword, or at the top of the file. */
function startsStatement(tokens: readonly SourceToken[], i: number): boolean {
  return i === 0 || [';', 'begin', 'end', 'endgenerate', 'generate'].includes(tokens[i - 1].text);
}

/** `.formal(actual)` items of the bracket at `open`. */
function namedConnections(tokens: readonly SourceToken[], open: number, file: FileSymbols): Omit<Connection, 'unit'>[] {
  const close = matchingClose(tokens, open);
  const items: Omit<Connection, 'unit'>[] = [];
  for (let j = open + 1; j < close; j++) {
    const named = tokens[j].text === '.' && isIdentifier(tokens[j + 1]) && tokens[j + 2]?.text === '(';
    if (!named) continue;
    const actualClose = matchingClose(tokens, j + 2);
    items.push({ formal: tokens[j + 1], actual: firstSymbol(tokens, j + 3, actualClose, file) });
    j = actualClose;
  }
  return items;
}
