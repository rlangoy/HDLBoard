// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Builds the hierarchy while a file is read: a scope is opened, filled and closed in
 * file order, and at the end scopes with nothing in them – GHDL's package scopes
 * `standard`, `textio`, … – are dropped (docs/waveform_viewer_spec.md § 4, § 8.3). Pure.
 */

import type { Scope, ScopeKind, SignalRef, UnavailableSignal } from './model';

interface OpenScope {
  readonly name: string;
  readonly kind: ScopeKind;
  readonly scopes: OpenScope[];
  readonly signals: SignalRef[];
  readonly unavailable: UnavailableSignal[];
}

const openScope = (name: string, kind: ScopeKind): OpenScope => ({ name, kind, scopes: [], signals: [], unavailable: [] });

function close(scope: OpenScope): Scope | undefined {
  const scopes = scope.scopes.map(close).filter((s): s is Scope => s !== undefined);
  if (scopes.length === 0 && scope.signals.length === 0 && scope.unavailable.length === 0) return undefined;
  return { name: scope.name, kind: scope.kind, scopes, signals: scope.signals, unavailable: scope.unavailable };
}

export class ScopeTree {
  private readonly root = openScope('', 'design');
  private readonly stack: OpenScope[] = [this.root];

  private get current(): OpenScope {
    return this.stack[this.stack.length - 1];
  }

  get depth(): number {
    return this.stack.length - 1;
  }

  enter(name: string, kind: ScopeKind): void {
    const scope = openScope(name, kind);
    this.current.scopes.push(scope);
    this.stack.push(scope);
  }

  /** Leaves the current scope; extra `$upscope`s at the top are ignored. */
  leave(): void {
    if (this.stack.length > 1) this.stack.pop();
  }

  addSignal(signal: SignalRef): void {
    this.current.signals.push(signal);
  }

  addUnavailable(entry: UnavailableSignal): void {
    this.current.unavailable.push(entry);
  }

  build(): Scope {
    return close(this.root) ?? { name: '', kind: 'design', scopes: [], signals: [], unavailable: [] };
  }
}
