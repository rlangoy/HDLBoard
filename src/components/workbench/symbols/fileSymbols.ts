// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { languageOfName, type Language } from '../fileKinds';
import { tokenizeSource } from '../highlight';
import type { Token } from '../vhdlHighlight';
import { buildSymbolIndex } from './symbolIndex';
import type { SymbolIndex } from './types';

/** Everything the editor knows about one file's text: built once per edit, shared by its pane and the split view. */
export interface FileSymbols {
  readonly language: Language | undefined;
  readonly lines: readonly string[];
  /** The editor's tokens per line (`tokenizeSource`); together they are the lines. */
  readonly tokenLines: readonly (readonly Token[])[];
  readonly index: SymbolIndex;
}

/** Analyses one file. Pure; call it once per edit. */
export function analyzeFile(name: string, content: string): FileSymbols {
  const language = languageOfName(name);
  const lines = content.split('\n');
  // Whole file at once: a Verilog block comment runs across lines.
  const tokenLines = tokenizeSource(language, lines);
  return { language, lines, tokenLines, index: buildSymbolIndex(language, tokenLines) };
}
