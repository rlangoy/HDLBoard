// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { SourceToken } from './sourceTokens';
import type { SymbolKind } from './types';

/**
 * What a language analyser (vhdlSymbols.ts, verilogSymbols.ts) reports about a
 * file. It holds only language facts: scopes, declarations, names to skip.
 * Name resolution is shared and lives in symbolIndex.ts.
 */
export interface Analysis {
  /** The parent of each scope. Scope 0 is the whole file; its parent is -1. */
  readonly scopeParents: readonly number[];
  /** The scope each token is in, by token index. */
  readonly tokenScopes: readonly number[];
  /** Token index → the kind of symbol that token declares. */
  readonly declarations: ReadonlyMap<number, SymbolKind>;
  /** Token indices of names that are neither declarations nor references (a port-map formal, say). */
  readonly ignored: ReadonlySet<number>;
}

export const FILE_SCOPE = 0;
const NO_PARENT = -1;

/** A stack of open scopes that also remembers every scope's parent. */
export class ScopeTracker {
  private readonly parents: number[] = [NO_PARENT];
  private readonly stack: number[] = [FILE_SCOPE];

  get current(): number {
    return this.stack[this.stack.length - 1];
  }

  /** Opens a new scope inside `parent` (normally the current one) and enters it. */
  open(parent: number = this.current): number {
    const id = this.parents.length;
    this.parents.push(parent);
    this.stack.push(id);
    return id;
  }

  /** Leaves the current scope. The file scope is never closed, so unbalanced code is safe. */
  close(): void {
    if (this.stack.length > 1) this.stack.pop();
  }

  get scopeParents(): readonly number[] {
    return this.parents;
  }
}

/** Collects declarations; the first kind recorded for a token wins. */
export class DeclarationMap {
  readonly entries = new Map<number, SymbolKind>();

  add(tokenIndex: number, kind: SymbolKind): void {
    if (!this.entries.has(tokenIndex)) this.entries.set(tokenIndex, kind);
  }
}

/** The index of the bracket that closes the one at `open`, or the last token if it is never closed. */
export function matchingClose(tokens: readonly SourceToken[], open: number, opening = '(', closing = ')'): number {
  let depth = 0;
  for (let j = open; j < tokens.length; j++) {
    if (tokens[j].text === opening) depth++;
    else if (tokens[j].text === closing && --depth === 0) return j;
  }
  return tokens.length - 1;
}

/** The index of the bracket that opens the one at `close`, or 0 if it is never opened. */
export function matchingOpen(tokens: readonly SourceToken[], close: number, opening = '(', closing = ')'): number {
  let depth = 0;
  for (let j = close; j >= 0; j--) {
    if (tokens[j].text === closing) depth++;
    else if (tokens[j].text === opening && --depth === 0) return j;
  }
  return 0;
}

export function isIdentifier(token: SourceToken | undefined): token is SourceToken {
  return token?.type === 'identifier';
}
