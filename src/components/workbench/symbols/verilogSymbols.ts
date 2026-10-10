// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Verilog scopes and declarations, found by walking tokens rather than by parsing.
 * Only language facts live here; resolving names is symbolIndex.ts's job.
 *
 * Scopes: module … endmodule, function … endfunction, task … endtask,
 * begin … end (named or not) and fork … join.
 *
 * Declarations: the names after input / output / inout, parameter / localparam,
 * genvar, the net and variable types (wire, reg, integer, …) and SystemVerilog's
 * `logic`. The name-list rules are the ones verilogDeclaredNames.ts uses.
 * Verilog is case-sensitive.
 */

import { VERILOG_TYPES } from '../verilogHighlight';
import { isVerilogReservedWord } from '../verilogWords';
import { DeclarationMap, isIdentifier, ScopeTracker, type Analysis } from './analysis';
import type { SourceToken } from './sourceTokens';
import type { SymbolKind } from './types';

const SCOPE_OPENERS: ReadonlySet<string> = new Set(['module', 'macromodule', 'function', 'task', 'begin', 'fork']);
const SCOPE_CLOSERS: ReadonlySet<string> = new Set([
  'endmodule', 'endfunction', 'endtask', 'end', 'join', 'join_any', 'join_none',
]);
/** `begin : blink`, `end : blink`: the word after the `:` is a label. */
const LABELLED: ReadonlySet<string> = new Set(['begin', 'fork', 'end']);

/** Declaring words other than the types in VERILOG_TYPES. */
const DECLARING_KEYWORDS: ReadonlyMap<string, SymbolKind> = new Map([
  ['input', 'port'],
  ['output', 'port'],
  ['inout', 'port'],
  ['parameter', 'parameter'],
  ['localparam', 'localparam'],
  ['logic', 'logic'], // SystemVerilog; the tokenizer calls it an identifier
]);
const VARIABLE_TYPES: ReadonlySet<string> = new Set(['integer', 'real', 'realtime', 'time']);
/** Words that may sit between a declaring word and its names: `input wire signed [7:0] x`. */
const DECLARATION_MODIFIERS: ReadonlySet<string> = new Set(['signed', 'unsigned', 'scalared', 'vectored', 'automatic']);
/** What may follow a declared name after its dimensions: `a,` `a;` `a)` `a = 0`. */
const AFTER_A_NAME: ReadonlySet<string> = new Set([',', ';', ')', '=']);
const OPENING: ReadonlySet<string> = new Set(['(', '[', '{']);
const CLOSING: ReadonlySet<string> = new Set([')', ']', '}']);

export function analyzeVerilog(tokens: readonly SourceToken[]): Analysis {
  const scopes = new ScopeTracker();
  const declarations = new DeclarationMap();
  const ignored = new Set<number>();
  const tokenScopes: number[] = [];

  for (let i = 0; i < tokens.length; i++) {
    tokenScopes[i] = scopes.current;
    const { text } = tokens[i];

    if (SCOPE_OPENERS.has(text)) scopes.open();
    else if (SCOPE_CLOSERS.has(text)) scopes.close();

    const kind = declaringKind(text);
    if (kind) for (const j of declaredNames(tokens, i)) declarations.add(j, kind);

    if (tokens[i - 1]?.text === ':' && LABELLED.has(tokens[i - 2]?.text ?? '') && isIdentifier(tokens[i])) ignored.add(i);
  }

  return {
    scopeParents: scopes.scopeParents,
    tokenScopes,
    declarations: declarations.entries,
    ignored,
  };
}

/** The kind a declaring word declares, or undefined if the word declares nothing. */
function declaringKind(text: string): SymbolKind | undefined {
  const keywordKind = DECLARING_KEYWORDS.get(text);
  if (keywordKind) return keywordKind;
  if (!VERILOG_TYPES.has(text)) return undefined;
  if (text === 'reg') return 'reg';
  if (text === 'genvar') return 'genvar';
  if (VARIABLE_TYPES.has(text)) return 'variable';
  return 'wire'; // wire, tri, wand, supply0, …
}

/** A name the student chose: an identifier that is not a reserved word (nor `logic`). */
function isName(token: SourceToken | undefined): token is SourceToken {
  return isIdentifier(token) && !isVerilogReservedWord(token.text) && !DECLARING_KEYWORDS.has(token.text);
}

/** A reserved word that ends a declaration's name list: anything but a type or a modifier. */
function endsDeclaration(text: string): boolean {
  return isVerilogReservedWord(text) && !VERILOG_TYPES.has(text) && !DECLARATION_MODIFIERS.has(text);
}

/** Skips any `[ … ]` groups starting at `j`; returns the index after them. */
function afterDimensions(tokens: readonly SourceToken[], j: number): number {
  let next = j;
  while (tokens[next]?.text === '[') {
    let depth = 0;
    for (; next < tokens.length; next++) {
      if (tokens[next].text === '[') depth++;
      else if (tokens[next].text === ']' && --depth === 0) break;
    }
    next++;
  }
  return next;
}

/** A name is declared only where a name can end, so a misspelled keyword is not taken for one. */
function isDeclaredName(tokens: readonly SourceToken[], j: number): boolean {
  const next = tokens[afterDimensions(tokens, j + 1)];
  return isName(tokens[j]) && (next === undefined || AFTER_A_NAME.has(next.text));
}

/**
 * The comma-separated names after the declaring word at `i`, up to the `;` that
 * ends the declaration, the `)` that ends a port list, or the next keyword.
 * Ranges, parentheses and initial values (`= 4'b0`) are skipped.
 */
function declaredNames(tokens: readonly SourceToken[], i: number): number[] {
  const names: number[] = [];
  let depth = 0;
  let expectingName = true;
  for (let j = i + 1; j < tokens.length; j++) {
    const { text } = tokens[j];
    if (OPENING.has(text)) depth++;
    else if (CLOSING.has(text)) {
      if (depth === 0) break;
      depth--;
    } else if (depth > 0) continue;
    else if (text === ';') break;
    else if (text === ',') expectingName = true;
    else if (text === '=') expectingName = false;
    else if (endsDeclaration(text)) break;
    else if (expectingName && isDeclaredName(tokens, j)) {
      names.push(j);
      expectingName = false;
    }
  }
  return names;
}
