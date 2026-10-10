// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Shared types for symbol occurrence highlighting
 * (docs/symbol_occurrence_highlighting.md). Pure data: no React, no DOM.
 *
 * Positions follow the editor's existing convention (vhdlHighlight.ts CharRange):
 * a 0-based line, and 0-based character offsets in that line, end exclusive.
 */

/** What a declaration declares. Only these kinds are highlighted. */
export type SymbolKind =
  // VHDL
  | 'signal'
  | 'variable'
  | 'constant'
  | 'generic'
  | 'port'
  | 'parameter'
  | 'alias'
  | 'type'
  | 'enum-literal'
  // Verilog
  | 'wire'
  | 'reg'
  | 'logic'
  | 'localparam'
  | 'genvar'
  | 'function'
  | 'task';

export type OccurrenceKind = 'declaration' | 'reference';

/** Where a name is written in the file. */
export interface SourceSpan {
  /** 0-based line. */
  readonly line: number;
  /** 0-based offset of the first character. */
  readonly start: number;
  /** 0-based offset just after the last character. */
  readonly end: number;
}

/** One declared name and every place that refers to it. */
export interface HdlSymbol {
  /** Stable within one analysis: the declaration's position, e.g. "4:11". */
  readonly id: string;
  /** As written at the declaration. */
  readonly name: string;
  readonly kind: SymbolKind;
  readonly declaration: SourceSpan;
  readonly references: readonly SourceSpan[];
}

/** A span to paint, and how. */
export interface Occurrence extends SourceSpan {
  readonly kind: OccurrenceKind;
}

/** The result of analysing one file. Built once per edit; hover only reads it. */
export interface SymbolIndex {
  /** The symbol whose declaration or reference covers this character, if any. */
  symbolAt(line: number, offset: number): HdlSymbol | undefined;
  /** Every declared symbol, in file order. */
  readonly symbols: readonly HdlSymbol[];
}
