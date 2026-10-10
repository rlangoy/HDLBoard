// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The named connections of a file's instances, found by walking tokens:
 *
 *   uut : entity work.and_gate port map (a => a_in);    -- VHDL, also generic map
 *   and_gate #(.W(1)) uut (.a(a_in));                    // Verilog
 *
 * The formal names a port or generic of the instantiated unit, which is declared
 * in another file; the actual is an expression of this file. Positional
 * association is skipped. Pure.
 */

import type { Language } from '../fileKinds';
import { isIdentifier, matchingClose } from './analysis';
import type { SourceToken } from './sourceTokens';

export interface InstanceConnection {
  /** The instantiated entity, component or module, as written. */
  readonly unit: string;
  /** Token index of the formal's name. */
  readonly formal: number;
  /** Token indices [from, to) of the actual expression. */
  readonly actualFrom: number;
  readonly actualTo: number;
}

export function instanceConnections(language: Language | undefined, tokens: readonly SourceToken[]): InstanceConnection[] {
  return language === 'verilog' ? verilogConnections(tokens) : vhdlConnections(tokens);
}

/** An entity or module a file declares, and the stretch of text that belongs to it. */
export interface DeclaredUnit {
  /** As written. */
  readonly name: string;
  /** The declaring keyword's token index. */
  readonly from: number;
  /** The next unit's keyword, or the end of the file: an architecture belongs to the entity above it. */
  readonly to: number;
}

/** The entities (VHDL) or modules (Verilog) a file declares, in file order. */
export function declaredUnits(language: Language | undefined, tokens: readonly SourceToken[]): DeclaredUnit[] {
  const starts = tokens.flatMap((token, i) => {
    const name = tokens[i + 1];
    const declares =
      language === 'verilog'
        ? token.text === 'module' || token.text === 'macromodule'
        : lower(token) === 'entity' && lower(tokens[i + 2]) === 'is';
    return declares && isIdentifier(name) ? [{ name: name.text, from: i }] : [];
  });
  return starts.map((unit, k) => ({ ...unit, to: starts[k + 1]?.from ?? tokens.length }));
}

const lower = (token: SourceToken | undefined) => token?.text.toLowerCase();

/** `port map (` and `generic map (` of an instance. */
function vhdlConnections(tokens: readonly SourceToken[]): InstanceConnection[] {
  return tokens.flatMap((token, i) => {
    const isMap = lower(token) === 'map' && ['port', 'generic'].includes(lower(tokens[i - 1]) ?? '') && tokens[i + 1]?.text === '(';
    const unit = isMap ? instantiatedUnit(tokens, i - 1) : undefined;
    return unit ? associations(tokens, i + 1).map((item) => ({ ...item, unit })) : [];
  });
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
    else if (isIdentifier(tokens[j])) return text;
  }
  return undefined;
}

type Item = Omit<InstanceConnection, 'unit'>;

/** `formal => actual` items of the bracket at `open`; `q(0) => x` names formal `q`. */
function associations(tokens: readonly SourceToken[], open: number): Item[] {
  const close = matchingClose(tokens, open);
  const items: Item[] = [];
  let start = open + 1;
  for (let j = start; j <= close; j++) {
    if (tokens[j].text === '(') j = matchingClose(tokens, j);
    else if (tokens[j].text === ',' || j === close) {
      const arrow = tokens.slice(start, j).findIndex((t) => t.text === '=>');
      if (arrow > 0 && isIdentifier(tokens[start])) items.push({ formal: start, actualFrom: start + arrow + 1, actualTo: j });
      start = j + 1;
    }
  }
  return items;
}

/** `and_gate #(.W(1)) uut (.a(x));`: the parameter list, then the port list. */
function verilogConnections(tokens: readonly SourceToken[]): InstanceConnection[] {
  return tokens.flatMap((token, i) => {
    if (!isIdentifier(token) || !startsStatement(tokens, i)) return [];
    const unit = token.text;
    const items: Item[] = [];
    let next = i + 1;
    if (tokens[next]?.text === '#' && tokens[next + 1]?.text === '(') {
      items.push(...namedConnections(tokens, next + 1));
      next = matchingClose(tokens, next + 1) + 1;
    }
    if (isIdentifier(tokens[next]) && tokens[next + 1]?.text === '(') items.push(...namedConnections(tokens, next + 1));
    return items.map((item) => ({ ...item, unit }));
  });
}

/** A statement starts after `;`, a block keyword, or at the top of the file. */
function startsStatement(tokens: readonly SourceToken[], i: number): boolean {
  return i === 0 || [';', 'begin', 'end', 'endgenerate', 'generate'].includes(tokens[i - 1].text);
}

/** `.formal(actual)` items of the bracket at `open`. */
function namedConnections(tokens: readonly SourceToken[], open: number): Item[] {
  const close = matchingClose(tokens, open);
  const items: Item[] = [];
  for (let j = open + 1; j < close; j++) {
    const named = tokens[j].text === '.' && isIdentifier(tokens[j + 1]) && tokens[j + 2]?.text === '(';
    if (!named) continue;
    const actualClose = matchingClose(tokens, j + 2);
    items.push({ formal: j + 1, actualFrom: j + 3, actualTo: actualClose });
    j = actualClose;
  }
  return items;
}
