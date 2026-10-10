// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { Token, TokenType } from '../vhdlHighlight';
import type { SourceSpan } from './types';

/** A token the symbol analysis looks at, with its position in the file. */
export interface SourceToken extends SourceSpan {
  readonly text: string;
  readonly type: TokenType;
}

/** Tokens that can never name or mark a declaration. */
const IGNORED: ReadonlySet<TokenType> = new Set(['whitespace', 'comment', 'string']);

/**
 * The VHDL tokenizer joins neighbouring punctuation (`);`, `),`, `:=`). The analysis
 * needs single characters, except for these operators, which keep their meaning
 * only as a pair: `:=` is not `:`, and `=>` marks a formal in a port map.
 */
const PUNCTUATION_PIECE = /:=|=>|<=|>=|\/=|\*\*|[\s\S]/g;

/**
 * Every significant token of a file, in order, from the editor's own tokenizer
 * output (`tokenizeSource`). Whitespace, comments and strings are dropped, and
 * punctuation is split so that `(` `)` `;` `,` are always tokens of their own.
 */
export function sourceTokens(tokenLines: readonly (readonly Token[])[]): SourceToken[] {
  const result: SourceToken[] = [];
  tokenLines.forEach((tokens, line) => {
    let offset = 0;
    for (const token of tokens) {
      if (!IGNORED.has(token.type)) result.push(...piecesOf(token, line, offset));
      offset += token.text.length;
    }
  });
  return result;
}

/** Where a token is written. */
export function spanOf(token: SourceToken): SourceSpan {
  return { line: token.line, start: token.start, end: token.end };
}

function piecesOf(token: Token, line: number, start: number): SourceToken[] {
  if (token.type !== 'punctuation') {
    return [{ text: token.text, type: token.type, line, start, end: start + token.text.length }];
  }
  return [...token.text.matchAll(PUNCTUATION_PIECE)].map((match) => {
    const pieceStart = start + (match.index ?? 0);
    return { text: match[0], type: token.type, line, start: pieceStart, end: pieceStart + match[0].length };
  });
}
