// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Verilog scopes and declarations, found by walking tokens rather than by parsing.
 * Only language facts live here; resolving names is symbolIndex.ts's job.
 *
 * Scopes: module … endmodule, function … endfunction, task … endtask,
 * begin … end (named or not) and fork … join. A function's or task's own name
 * belongs to the module around it, so its scope opens just after the name.
 *
 * Declarations: function and task names, the names after input / output / inout, parameter / localparam,
 * genvar, the net and variable types (wire, reg, integer, …) and SystemVerilog's
 * `logic`. The name-list rules are verilogDeclaredNames.ts's, shared.
 * Verilog is case-sensitive.
 */

import { VERILOG_TYPES } from '../verilogHighlight';
import { declaredNameIndices } from '../verilogDeclaredNames';
import { DeclarationMap, isIdentifier, matchingClose, ScopeTracker, type Analysis } from './analysis';
import type { SourceToken } from './sourceTokens';
import type { SymbolKind } from './types';

const SCOPE_OPENERS: ReadonlySet<string> = new Set(['module', 'macromodule', 'begin', 'fork']);
/** `function integer clog2;`, `task automatic send(…)`: they open a scope after their name. */
const SUBPROGRAMS: ReadonlyMap<string, SymbolKind> = new Map([
  ['function', 'function'],
  ['task', 'task'],
]);
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

export function analyzeVerilog(tokens: readonly SourceToken[]): Analysis {
  const scopes = new ScopeTracker();
  const declarations = new DeclarationMap();
  const ignored = new Set<number>();
  const tokenScopes: number[] = [];
  /** The token at which a function's or task's scope opens: the one after its name. */
  let subprogramBodyAt: number | undefined;
  /** Inside a function or task, `input` declares an argument, not a module port. */
  let inSubprogram = false;

  for (let i = 0; i < tokens.length; i++) {
    if (i === subprogramBodyAt) scopes.open();
    tokenScopes[i] = scopes.current;
    const { text } = tokens[i];

    if (SCOPE_OPENERS.has(text)) scopes.open();
    else if (SCOPE_CLOSERS.has(text)) scopes.close();

    if (text === 'endfunction' || text === 'endtask') inSubprogram = false;
    const subprogramKind = SUBPROGRAMS.get(text);
    if (subprogramKind) {
      inSubprogram = true;
      const name = subprogramName(tokens, i);
      if (name === undefined) scopes.open();
      else {
        declarations.add(name, subprogramKind); // before the `integer` in its header can claim it
        subprogramBodyAt = name + 1;
      }
    }

    const kind = declaringKind(text, inSubprogram);
    if (kind) for (const j of declaredNameIndices(tokens, i)) declarations.add(j, kind);

    if (tokens[i - 1]?.text === ':' && LABELLED.has(tokens[i - 2]?.text ?? '') && isIdentifier(tokens[i])) ignored.add(i);
  }

  return {
    scopeParents: scopes.scopeParents,
    tokenScopes,
    declarations: declarations.entries,
    ignored,
  };
}

/**
 * The name in a function or task header: the first identifier after the keyword,
 * past `automatic`, a return type and a range, if a `;` or `(` follows it.
 */
function subprogramName(tokens: readonly SourceToken[], keyword: number): number | undefined {
  for (let j = keyword + 1; j < tokens.length; j++) {
    const { text } = tokens[j];
    if (text === '[') j = matchingClose(tokens, j, '[', ']');
    else if (text === ';' || text === '(') return undefined;
    else if (isIdentifier(tokens[j]) && !DECLARING_KEYWORDS.has(text)) {
      return tokens[j + 1]?.text === ';' || tokens[j + 1]?.text === '(' ? j : undefined;
    }
  }
  return undefined;
}

/** The kind a declaring word declares, or undefined if the word declares nothing. */
function declaringKind(text: string, inSubprogram: boolean): SymbolKind | undefined {
  const keywordKind = DECLARING_KEYWORDS.get(text);
  if (keywordKind === 'port' && inSubprogram) return 'argument';
  if (keywordKind) return keywordKind;
  if (!VERILOG_TYPES.has(text)) return undefined;
  if (text === 'reg') return 'reg';
  if (text === 'genvar') return 'genvar';
  if (VARIABLE_TYPES.has(text)) return 'variable';
  return 'wire'; // wire, tri, wand, supply0, …
}
