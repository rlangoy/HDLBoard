// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/* ------------------------------------------------------------------ *
 * A small Verilog tokenizer for the code editor's syntax colouring
 * (docs/verilog_syntax_colouring_imp.md).
 *
 * It takes all the lines of a file, not one line: a `/* … *\/` comment
 * can span lines, so the tokenizer carries one flag (inside a block
 * comment) from line to line. Nothing outside this module sees it.
 *
 * The words are Icarus Verilog's own 1364-2005 keyword table
 * (lexor_keyword.gperf, branch v13-branch), so the editor and the
 * compiler agree on what a keyword is. Verilog is case-sensitive.
 * ------------------------------------------------------------------ */

import type { Token, TokenType } from './vhdlHighlight';

/** Add a word here, not in the regex, to extend the highlighter. */
export const VERILOG_KEYWORDS: ReadonlySet<string> = new Set([
  'always', 'and', 'assign', 'automatic', 'begin', 'buf', 'bufif0', 'bufif1',
  'case', 'casex', 'casez', 'cell', 'cmos', 'config', 'deassign', 'default',
  'defparam', 'design', 'disable', 'edge', 'else', 'end', 'endcase',
  'endconfig', 'endfunction', 'endgenerate', 'endmodule', 'endprimitive',
  'endspecify', 'endtable', 'endtask', 'event', 'for', 'force', 'forever',
  'fork', 'function', 'generate', 'highz0', 'highz1', 'if', 'ifnone',
  'incdir', 'include', 'initial', 'inout', 'input', 'instance', 'join',
  'large', 'liblist', 'library', 'localparam', 'macromodule', 'medium',
  'module', 'nand', 'negedge', 'nmos', 'nor', 'noshowcancelled', 'not',
  'notif0', 'notif1', 'or', 'output', 'parameter', 'pmos', 'posedge',
  'primitive', 'pull0', 'pull1', 'pulldown', 'pullup', 'pulsestyle_onevent',
  'pulsestyle_ondetect', 'rcmos', 'release', 'repeat', 'rnmos', 'rpmos',
  'rtran', 'rtranif0', 'rtranif1', 'scalared', 'showcancelled', 'signed',
  'small', 'specify', 'specparam', 'strong0', 'strong1', 'table', 'task',
  'tran', 'tranif0', 'tranif1', 'unsigned', 'use', 'vectored', 'wait',
  'weak0', 'weak1', 'while', 'xnor', 'xor',
]);

export const VERILOG_TYPES: ReadonlySet<string> = new Set([
  'genvar', 'integer', 'real', 'realtime', 'reg', 'supply0', 'supply1',
  'time', 'tri', 'tri0', 'tri1', 'triand', 'trior', 'trireg', 'uwire',
  'wand', 'wire', 'wor',
]);

const BLOCK_COMMENT_START = '/*';
const BLOCK_COMMENT_END = '*/';

// One alternation, most specific first, so `4'b1010` is one number (the based
// form is tried before the plain one, which would take only the `4`). There is
// no `'…'` string alternative: a `'` in Verilog is only ever part of a number.
// The last group takes any other single character, so no character is dropped
// and every line's tokens put together are the line. Punctuation is one
// character at a time, so `;//` cannot hide the start of a comment.
const TOKEN_RE =
  /(\/\/[^\n]*)|(\/\*)|("(?:\\.|[^"\\])*"?)|(`[A-Za-z_][A-Za-z0-9_$]*)|(\$[A-Za-z_][A-Za-z0-9_$]*)|((?:\d[\d_]*)?'[sS]?[bBoOdDhH]\s*[0-9a-fA-FxXzZ?_]+)|(\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)|(\\\S+)|([A-Za-z_][A-Za-z0-9_$]*)|(\s+)|(\S)/g;

/** One line's tokens, and whether a block comment is still open where it ends. */
interface LineTokens {
  readonly tokens: Token[];
  readonly endsInBlockComment: boolean;
}

/** Where a block comment that is open at some point of a line stops. */
interface BlockCommentScan {
  /** Just after its closing mark, or the end of the line. */
  readonly end: number;
  readonly closed: boolean;
}

/** The tokens of each line, in order. Block comments may run across lines. */
export function tokenizeVerilog(lines: readonly string[]): Token[][] {
  let inBlockComment = false;
  return lines.map((line) => {
    const { tokens, endsInBlockComment } = tokenizeLine(line, inBlockComment);
    inBlockComment = endsInBlockComment;
    return tokens;
  });
}

function tokenizeLine(line: string, startsInBlockComment: boolean): LineTokens {
  const tokens: Token[] = [];
  let position = 0;
  if (startsInBlockComment) {
    const comment = scanBlockComment(line, 0);
    if (comment.end > 0) tokens.push({ text: line.slice(0, comment.end), type: 'comment' });
    if (!comment.closed) return { tokens, endsInBlockComment: true };
    position = comment.end;
  }
  TOKEN_RE.lastIndex = position;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(line))) {
    if (match[0] === BLOCK_COMMENT_START) {
      const comment = scanBlockComment(line, match.index + BLOCK_COMMENT_START.length);
      tokens.push({ text: line.slice(match.index, comment.end), type: 'comment' });
      if (!comment.closed) return { tokens, endsInBlockComment: true };
      TOKEN_RE.lastIndex = comment.end;
    } else {
      tokens.push(tokenOf(match));
    }
  }
  return { tokens, endsInBlockComment: false };
}

function scanBlockComment(line: string, from: number): BlockCommentScan {
  const closeAt = line.indexOf(BLOCK_COMMENT_END, from);
  return closeAt < 0
    ? { end: line.length, closed: false }
    : { end: closeAt + BLOCK_COMMENT_END.length, closed: true };
}

/** The token for a `TOKEN_RE` match other than a block comment's start. */
function tokenOf(match: RegExpExecArray): Token {
  const [text, lineComment, , str, directive, system, based, num, escaped, word, whitespace] = match;
  if (lineComment) return { text, type: 'comment' };
  if (str) return { text, type: 'string' };
  if (directive) return { text, type: 'directive' };
  if (system) return { text, type: 'system' };
  if (based || num) return { text, type: 'number' };
  if (escaped) return { text, type: 'identifier' };
  if (word) return { text, type: typeOfWord(word) };
  if (whitespace) return { text, type: 'whitespace' };
  return { text, type: 'punctuation' };
}

function typeOfWord(word: string): TokenType {
  if (VERILOG_KEYWORDS.has(word)) return 'keyword';
  if (VERILOG_TYPES.has(word)) return 'type';
  return 'identifier';
}
