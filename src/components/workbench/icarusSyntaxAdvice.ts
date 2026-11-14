// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { Advice } from './diagnosticAdvice';
import type { LocatedDiagnostic } from './diagnosticLocation';
import { verilogAdviceText as text } from './diagnosticText';
import type { SourceToken } from './symbols/sourceTokens';
import { matchingClose } from './symbols/analysis';
import { needsPreprocessing } from './verilogDirectives';

interface Base {
  readonly radix: string;
  readonly allowed: RegExp;
  readonly digits: string;
}

const BASES: Readonly<Record<string, Base>> = {
  b: { radix: '2', allowed: /^[01xz?_]+$/i, digits: '0 or 1' },
  o: { radix: '8', allowed: /^[0-7xz?_]+$/i, digits: '0–7' },
  d: { radix: '10', allowed: /^(?:[0-9_]+|[xz?]_*)$/i, digits: '0–9' },
  h: { radix: '16', allowed: /^[0-9a-fxz?_]+$/i, digits: '0–9 or a–f' },
};

const BASED_LITERAL = /^(?:[\d_]+)?'[sS]?([bBoOdDhH])\s*(.+)$/;

/** Opening keyword → its closing keyword. A Map, so `constructor` or `toString` is never an opener. */
const CLOSERS: ReadonlyMap<string, string> = new Map([
  ['module', 'endmodule'], ['macromodule', 'endmodule'], ['begin', 'end'],
  ['case', 'endcase'], ['casex', 'endcase'], ['casez', 'endcase'],
  ['function', 'endfunction'], ['task', 'endtask'], ['generate', 'endgenerate'],
  ['fork', 'join'], ['primitive', 'endprimitive'], ['table', 'endtable'], ['specify', 'endspecify'],
]);
const CLOSING_WORDS: ReadonlySet<string> = new Set(CLOSERS.values());
/** `wait fork;` and `disable fork;` are statements, not a `fork` block. */
const NOT_A_BLOCK_AFTER: ReadonlySet<string> = new Set(['wait', 'disable']);
const CASE_WORDS: ReadonlySet<string> = new Set(['case', 'casex', 'casez', 'endcase']);
const NOT_ASSIGNMENT_BEFORE_EQUALS: ReadonlySet<string> = new Set(['=', '!', '<', '>']);

/** An `if` header and the two assignments that follow it. */
const UNBRACED_IF_LINES = 3;

/** The reported line, converted once to the tokens' 0-based line numbers. */
interface Context {
  readonly row: number;
  readonly tokens: readonly SourceToken[];
  readonly here: readonly SourceToken[];
}

/** Narrow source checks, only after Icarus has reported a syntax error. */
export function icarusSyntaxAdvice(diagnostic: LocatedDiagnostic, tokens: readonly SourceToken[]): Advice | undefined {
  if (needsPreprocessing(tokens)) return undefined;
  const row = diagnostic.line - 1;
  const context: Context = { row, tokens, here: tokens.filter((token) => token.line === row) };
  return badLiteral(context)
    ?? badOperator(context)
    ?? assignmentInCondition(context)
    ?? unclosedEvent(context)
    ?? missingCaseColon(context)
    ?? missingBlock(context)
    ?? unclosedConstruct(context);
}

/** Underlines `token` when it is on the reported line, otherwise points at its line. */
function atToken({ row }: Context, token: SourceToken, headline: string): Advice {
  return token.line === row
    ? { headline, span: { start: token.start, end: token.end } }
    : { headline, relatedLine: token.line + 1 };
}

function badLiteral(context: Context): Advice | undefined {
  for (const token of context.here) {
    if (token.type !== 'number') continue;
    const match = BASED_LITERAL.exec(token.text);
    if (!match) continue;
    const base = BASES[match[1].toLowerCase()];
    if (!base.allowed.test(match[2])) return atToken(context, token, text.invalidDigit(token.text, base.radix, base.digits));
  }
  return undefined;
}

function badOperator(context: Context): Advice | undefined {
  const { here } = context;
  const index = here.findIndex((token, i) => token.text === '=' && here[i + 1]?.text === '<' && here[i - 1]?.text !== '=');
  if (index < 0) return undefined;
  return atToken(context, { ...here[index], end: here[index + 1].end }, text.invalidOperator());
}

function assignmentInCondition(context: Context): Advice | undefined {
  const { here } = context;
  for (let i = 0; i < here.length; i++) {
    if (here[i].text !== 'if' || here[i + 1]?.text !== '(') continue;
    const close = matchingClose(here, i + 1);
    if (here[close].text !== ')') continue;
    const condition = here.slice(i + 2, close);
    const assignment = condition.find((_, index) => isAssignmentEquals(condition, index));
    if (assignment) return atToken(context, assignment, text.comparison());
  }
  return undefined;
}

/** A lone `=`: not part of `==`, `!=`, `<=` or `>=`, which the tokenizer splits. */
function isAssignmentEquals(tokens: readonly SourceToken[], index: number): boolean {
  return tokens[index].text === '='
    && !NOT_ASSIGNMENT_BEFORE_EQUALS.has(tokens[index - 1]?.text)
    && tokens[index + 1]?.text !== '=';
}

function lastEventControl(tokens: readonly SourceToken[]): number {
  for (let i = tokens.length - 2; i >= 0; i--) {
    if (tokens[i].text === '@' && tokens[i + 1].text === '(') return i;
  }
  return -1;
}

/** `@(posedge clk q <= d;`: the statement's `;` is inside the event control's parentheses. */
function unclosedEvent(context: Context): Advice | undefined {
  const upToHere = context.tokens.filter((token) => token.line <= context.row);
  const start = lastEventControl(upToHere);
  if (start < 0) return undefined;
  const close = matchingClose(upToHere, start + 1);
  const statementEnd = upToHere.slice(start + 1, close + 1).find((token) => token.text === ';');
  if (statementEnd?.line !== context.row) return undefined;
  return atToken(context, upToHere[start], text.unclosed('@(', ')', upToHere[start].line + 1));
}

/** `2'b01 q = 1;`: a case value directly followed by an assignment. */
function startsCaseAssignment(tokens: readonly SourceToken[]): boolean {
  return tokens[0]?.type === 'number' && tokens[1]?.type === 'identifier' && tokens[2]?.text === '=';
}

function missingCaseColon(context: Context): Advice | undefined {
  const { here, row } = context;
  if (!startsCaseAssignment(here)) return undefined;
  const lastCaseWord = context.tokens.filter((token) => token.line < row && CASE_WORDS.has(token.text)).at(-1);
  const insideCase = lastCaseWord !== undefined && lastCaseWord.text !== 'endcase';
  return insideCase ? atToken(context, here[0], text.caseColon()) : undefined;
}

function isSimpleAssignment(line: readonly SourceToken[]): boolean {
  return line[0]?.type === 'identifier' && line[1]?.text === '=' && line.at(-1)?.text === ';';
}

/** Procedures whose body is a single statement; a second statement then lands at module level. */
const PROCEDURES: ReadonlySet<string> = new Set(['initial', 'always']);

/**
 * `initial if (c)` then two assignments on their own lines, the second on the
 * reported line: the `if` is the whole procedure, so Icarus meets the second
 * assignment at module level. Inside a `begin` block the same lines are legal.
 */
function missingBlock({ tokens, row }: Context): Advice | undefined {
  const linesSoFar = [...new Set(tokens.filter((token) => token.line <= row).map((token) => token.line))];
  const lines = linesSoFar.slice(-UNBRACED_IF_LINES);
  if (lines.length !== UNBRACED_IF_LINES) return undefined;
  const [header, first, second] = lines.map((line) => tokens.filter((token) => token.line === line));
  const isIfHeader = PROCEDURES.has(header[0].text) && header.some((token) => token.text === 'if') && header.at(-1)?.text === ')';
  if (!isIfHeader || !isSimpleAssignment(first) || !isSimpleAssignment(second)) return undefined;
  return { headline: text.blockNeeded(), relatedLine: header[0].line + 1 };
}

interface UnclosedConstruct {
  readonly opener: SourceToken;
  /** A closer that belongs to an outer opener, met while `opener` was still open. */
  readonly conflicting?: SourceToken;
}

/** SystemVerilog's `join_any`/`join_none` close a `fork` too. */
function closingWord(word: string): string {
  return word === 'join_any' || word === 'join_none' ? 'join' : word;
}

function opensBlock(tokens: readonly SourceToken[], index: number): boolean {
  return CLOSERS.has(tokens[index].text) && !NOT_A_BLOCK_AFTER.has(tokens[index - 1]?.text);
}

function unmatchedConstruct(tokens: readonly SourceToken[]): UnclosedConstruct | undefined {
  const open: SourceToken[] = [];
  for (const [i, token] of tokens.entries()) {
    if (opensBlock(tokens, i)) {
      open.push(token);
      continue;
    }
    const closer = closingWord(token.text);
    if (!CLOSING_WORDS.has(closer)) continue;
    const opener = open.at(-1);
    if (!opener) return undefined;
    if (CLOSERS.get(opener.text) === closer) {
      open.pop();
      continue;
    }
    const closesOuter = open.some((outer) => CLOSERS.get(outer.text) === closer);
    return closesOuter ? { opener, conflicting: token } : undefined;
  }
  const opener = open.at(-1);
  return opener ? { opener } : undefined;
}

/** Only at end of file, or where an outer construct's closer arrives too early. */
function unclosedConstruct({ tokens, row }: Context): Advice | undefined {
  const unmatched = unmatchedConstruct(tokens);
  const last = tokens.at(-1);
  if (!unmatched || !last) return undefined;
  const { opener, conflicting } = unmatched;
  const atEndOfFile = row > last.line;
  const atConflict = conflicting?.line === row;
  if (!atEndOfFile && !atConflict) return undefined;
  const closer = CLOSERS.get(opener.text) ?? '';
  return { headline: text.unclosed(opener.text, closer, opener.line + 1), relatedLine: opener.line + 1 };
}
