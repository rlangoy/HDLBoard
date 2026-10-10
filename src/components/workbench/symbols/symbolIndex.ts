// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Scope-aware name resolution for one file (docs/symbol_occurrence_highlighting.md).
 * A language analyser reports scopes and declarations; this module links every
 * other identifier to the declaration it means, walking from the identifier's
 * own scope outwards so an inner declaration shadows an outer one. Pure.
 */

import type { Language } from '../fileKinds';
import type { Token } from '../vhdlHighlight';
import { isIdentifier, type Analysis } from './analysis';
import { groupByLine } from './occurrences';
import { sourceTokens, type SourceToken } from './sourceTokens';
import type { HdlSymbol, SourceSpan, SymbolIndex } from './types';
import { analyzeVerilog } from './verilogSymbols';
import { analyzeVhdl } from './vhdlSymbols';

interface MutableSymbol extends HdlSymbol {
  readonly references: SourceSpan[];
}

/** One clickable name on a line: a declaration or a resolved reference. */
interface NameOnLine extends SourceSpan {
  readonly symbol: HdlSymbol;
}

/**
 * Analyses a file from the editor's tokens (`tokenizeSource`). Call it once per
 * edit (EditorSurface memoises it); hovering only calls `symbolAt`.
 */
export function buildSymbolIndex(language: Language | undefined, tokenLines: readonly (readonly Token[])[]): SymbolIndex {
  const tokens = sourceTokens(tokenLines);
  if (language === 'verilog') return indexFromAnalysis(tokens, analyzeVerilog(tokens), (name) => name);
  // Like the editor's colouring, a file of no known language is read as VHDL.
  return indexFromAnalysis(tokens, analyzeVhdl(tokens), (name) => name.toLowerCase());
}

function indexFromAnalysis(
  tokens: readonly SourceToken[],
  analysis: Analysis,
  keyOf: (name: string) => string,
): SymbolIndex {
  const tables = analysis.scopeParents.map(() => new Map<string, MutableSymbol>());
  const names: NameOnLine[] = [];
  const declared: MutableSymbol[] = [];

  const resolve = (key: string, scope: number): MutableSymbol | undefined => {
    for (let s = scope; s >= 0; s = analysis.scopeParents[s]) {
      const symbol = tables[s].get(key);
      if (symbol) return symbol;
    }
    return undefined;
  };

  // 1. Declarations, in file order: the first declaration of a name in a scope wins.
  const declarationIndices = [...analysis.declarations.keys()].sort((a, b) => a - b);
  for (const i of declarationIndices) {
    const token = tokens[i];
    const table = tables[analysis.tokenScopes[i]];
    const key = keyOf(token.text);
    const earlier = table.get(key);
    if (earlier) {
      // `output q; reg q;` declares q twice: the second is shown as a use of the first.
      earlier.references.push(spanOf(token));
      names.push({ ...spanOf(token), symbol: earlier });
      continue;
    }
    const symbol: MutableSymbol = {
      id: `${token.line}:${token.start}`,
      name: token.text,
      kind: analysis.declarations.get(i)!,
      declaration: spanOf(token),
      references: [],
    };
    table.set(key, symbol);
    declared.push(symbol);
    names.push({ ...spanOf(token), symbol });
  }

  // 2. References: every other identifier that resolves.
  tokens.forEach((token, i) => {
    if (!isReferenceCandidate(tokens, analysis, i)) return;
    const symbol = resolve(keyOf(token.text), analysis.tokenScopes[i]);
    if (!symbol) return;
    symbol.references.push(spanOf(token));
    names.push({ ...spanOf(token), symbol });
  });

  return lineLookup(names, declared);
}

/** An identifier that is not a declaration, not marked to skip, and not a selected name (`work.counter`, `.clk(`). */
function isReferenceCandidate(tokens: readonly SourceToken[], analysis: Analysis, i: number): boolean {
  return (
    isIdentifier(tokens[i]) &&
    !analysis.declarations.has(i) &&
    !analysis.ignored.has(i) &&
    tokens[i - 1]?.text !== '.'
  );
}

function spanOf(token: SourceToken): SourceSpan {
  return { line: token.line, start: token.start, end: token.end };
}

/** Groups the names by line so a hover looks at one short list. */
function lineLookup(names: readonly NameOnLine[], symbols: readonly HdlSymbol[]): SymbolIndex {
  const byLine = groupByLine(names);
  return {
    symbols,
    symbolAt(line, offset) {
      return byLine.get(line)?.find((name) => name.start <= offset && offset < name.end)?.symbol;
    },
  };
}
