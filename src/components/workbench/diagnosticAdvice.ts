// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Advice on top of GHDL's messages, where the measured output shows GHDL's words
 * mislead but its column does not — docs/editor_diagnostics_improvement_plan.md
 * § 4. The compiler's text is never replaced: advice is added next to it. Pure.
 *
 * Only GHDL compile errors get advice: they are the only diagnostics with a
 * column, and `useDiagnostics` runs this on ERROR frames only, never on the
 * runtime LOG lines (§ 4.12).
 */

import { declaredNames } from './declaredNames';
import { firstRevealTarget, type LocatedDiagnostic, type RunSnapshot } from './diagnosticLocation';
import { isFollowOn } from './diagnosticStore';
import { adviceText } from './diagnosticText';
import { osaDistance } from './editDistance';
import { ghdlColumnToIndex } from './ghdlColumn';
import { tokenizeVhdlLine, type Token } from './vhdlHighlight';
import {
  isLibraryName,
  isReservedWord,
  JOINED_KEYWORDS,
  LIBRARY_NAMES,
  SUGGESTED_KEYWORDS,
} from './vhdlWords';

/** A range in one line of the snapshot: 0-based character offsets, end exclusive. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/** What HDLBoard adds to a compiler message. */
export interface Advice {
  /** One sentence shown after the line in place of the compiler's text (§ 4.9). Absent: underline only. */
  readonly headline?: string;
  /** The word to underline on this line. */
  readonly span?: Span;
  /** Another line the advice is about (Rule D: the previous code line; Rule E: the `endif`). */
  readonly relatedLine?: number;
  /** Set on muted follow-on errors (Rule F): the line of the first error. */
  readonly followOnOf?: number;
}

export interface AdvisedDiagnostic extends LocatedDiagnostic {
  readonly advice?: Advice;
}

/** Rule B looks this many tokens either side of GHDL's caret, nearest first (§ 4.4). */
const KEYWORD_SEARCH_TOKENS = 3;
/** Shorter words are not "corrected" to a keyword: `rtl` is one edit from `rol`. */
const MIN_KEYWORD_TYPO_LENGTH = 4;
/** Rule C also takes 3-letter words: `inn` → `in`. */
const MIN_UNDECLARED_TYPO_LENGTH = 3;
/** From this length on, two edits are allowed: `rttange` → `range`. */
const TWO_EDIT_WORD_LENGTH = 6;
/** Rules D and E reveal the line they name when it is this close to GHDL's line (§ 4.10). */
const REVEAL_RELATED_WITHIN_LINES = 10;

// ------------------------------------------------------------ Rule F (§ 4.8)

/**
 * GHDL's wording for a syntax error, from the measured corpus. `unit name
 * expected, found …` is what GHDL says for a missing `;` before an assignment.
 */
const SYNTAX_ERROR_PATTERNS: readonly RegExp[] = [
  / expected\b/, /^missing /, /^unexpected token /, /is expected/, /^object class keyword/,
  /must be followed by/, /must have a label/, /^incorrect constraint/, /^misspelling/,
];

/**
 * Messages GHDL prints only while it skips ahead to find its place again after a
 * syntax error. Short on purpose: `misspelling, "x" expected` and `'end' is
 * expected instead of …` also appear in cascades, but a student's own mistake
 * (`end architecture rtll;`) produces them too, so they stay visible.
 */
const LOST_PLACE_PATTERNS: readonly RegExp[] = [
  /^missing entity, architecture, package or configuration$/,
  /in a concurrent statement list$/,
  /^a generate statement must have a label$/,
  /^'generate' is expected instead of /,
  /^missing ";" at end of (architecture|entity|generate statement body)$/,
  /^"end" must be followed by /,
];

/** Follows from an earlier error in the same file whatever that error is (mode-typo). */
const NOT_ANALYSED = /^entity ".+" was not analysed$/;

export function isSyntaxError(message: string): boolean {
  return SYNTAX_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function isLostPlace(message: string): boolean {
  return LOST_PLACE_PATTERNS.some((pattern) => pattern.test(message));
}

function isAdvisable(diagnostic: LocatedDiagnostic): boolean {
  return diagnostic.severity === 'error' && diagnostic.column !== undefined;
}

function byPosition(a: LocatedDiagnostic, b: LocatedDiagnostic): number {
  return a.line - b.line || (a.column ?? 0) - (b.column ?? 0);
}

/**
 * The muted follow-on errors, each with the line of its file's first error.
 * GHDL does not print errors in position order (downto-typo prints 13:52 before
 * 13:44), so each file's errors are sorted first. Only what cannot be an
 * independent mistake is muted: a later error on a line that already has one,
 * and a lost-place message — measured on 29 captures, this hides no second
 * mistake (§ 2.6).
 */
function followOns(located: readonly LocatedDiagnostic[]): ReadonlyMap<LocatedDiagnostic, number> {
  const muted = new Map<LocatedDiagnostic, number>();
  for (const fileId of new Set(located.map((d) => d.fileId))) {
    const errors = located.filter((d) => d.fileId === fileId && isAdvisable(d)).sort(byPosition);
    const primary = errors.find((d) => !NOT_ANALYSED.test(d.message));
    if (primary === undefined) continue;
    const afterSyntaxError = isSyntaxError(primary.message);
    errors.forEach((error, i) => {
      if (error === primary) return;
      const lineHasEarlierError = i > 0 && errors[i - 1].line === error.line;
      const cascade = afterSyntaxError && (lineHasEarlierError || isLostPlace(error.message));
      if (cascade || NOT_ANALYSED.test(error.message)) muted.set(error, primary.line);
    });
  }
  return muted;
}

// ---------------------------------------------------------------- context

interface PositionedToken {
  readonly text: string;
  readonly type: Token['type'];
  readonly start: number;
  readonly end: number;
}

interface SourceFile {
  /** The file as GHDL saw it, one entry per line, without a trailing `\r`. */
  readonly lines: readonly string[];
  /** Names declared in this file, as written (Rule C's suggestions). */
  readonly declared: readonly string[];
  /** Lines with an error that is not muted. */
  readonly errorLines: ReadonlySet<number>;
}

interface Project {
  readonly files: ReadonlyMap<string, SourceFile>;
  /** Every name declared anywhere in the project, lower case (Rule B's exclusions). */
  readonly declared: ReadonlySet<string>;
}

/** One error, with its line's tokens and the token GHDL's column points at. */
interface Place {
  readonly diagnostic: LocatedDiagnostic;
  readonly file: SourceFile;
  /** The line's tokens, without whitespace. */
  readonly tokens: readonly PositionedToken[];
  /** The character GHDL's column falls on (§ 4.2). */
  readonly index: number;
  /** Index into `tokens` of the anchor (§ 4.3), or -1. */
  readonly anchor: number;
}

function projectOf(
  located: readonly LocatedDiagnostic[],
  snapshot: RunSnapshot,
  muted: ReadonlyMap<LocatedDiagnostic, number>,
): Project {
  const files = new Map<string, SourceFile>();
  for (const file of snapshot.files) {
    const errorLines = located.filter((d) => d.fileId === file.id && isAdvisable(d) && !muted.has(d));
    files.set(file.id, {
      lines: file.content.split('\n').map((line) => line.replace(/\r$/, '')),
      declared: declaredNames(file.content),
      errorLines: new Set(errorLines.map((d) => d.line)),
    });
  }
  const declared = [...files.values()].flatMap((file) => file.declared.map((name) => name.toLowerCase()));
  return { files, declared: new Set(declared) };
}

function positionedTokens(line: string): PositionedToken[] {
  const positioned: PositionedToken[] = [];
  let start = 0;
  for (const { text, type } of tokenizeVhdlLine(line)) {
    if (type !== 'whitespace') positioned.push({ text, type, start, end: start + text.length });
    start += text.length;
  }
  return positioned;
}

/**
 * The token GHDL's column is on; else the one that ends exactly there, because
 * for `missing ";" at end of …` GHDL points just after the last token it
 * accepted (§ 1). A column on whitespace between two unrelated tokens has none.
 */
function anchorToken(tokens: readonly PositionedToken[], index: number): number {
  const on = tokens.findIndex((token) => token.start <= index && index < token.end);
  return on >= 0 ? on : tokens.findIndex((token) => token.end === index);
}

function placeOf(diagnostic: LocatedDiagnostic, file: SourceFile): Place {
  const line = file.lines[diagnostic.line - 1] ?? '';
  const tokens = positionedTokens(line);
  const index = ghdlColumnToIndex(line, diagnostic.column ?? 1);
  return { diagnostic, file, tokens, index, anchor: anchorToken(tokens, index) };
}

function spanOf(token: PositionedToken | undefined): Span | undefined {
  return token && { start: token.start, end: token.end };
}

const WORD_TYPES: ReadonlySet<Token['type']> = new Set(['keyword', 'type', 'identifier']);

function isWord(token: PositionedToken): boolean {
  return WORD_TYPES.has(token.type);
}

// ------------------------------------------------------------ suggestions

function maxEdits(word: string): number {
  return word.length >= TWO_EDIT_WORD_LENGTH ? 2 : 1;
}

interface Nearest {
  readonly distance: number;
  /** Every candidate at that distance: a tie when there is more than one. */
  readonly names: readonly string[];
}

/**
 * The candidates nearest to `word` within its edit allowance, starting with the
 * same letter (every measured keyword typo keeps its first letter, and the test
 * removes `clock` → `block` and `dout` → `out`, § 2.7). The word itself is never
 * its own suggestion.
 */
function nearest(word: string, candidates: readonly string[]): Nearest | undefined {
  const lower = word.toLowerCase();
  const allowed = maxEdits(word);
  const scored = candidates
    .filter((name) => name.toLowerCase() !== lower && name[0]?.toLowerCase() === lower[0])
    .map((name) => ({ name, distance: osaDistance(word, name, allowed) }))
    .filter(({ distance }) => distance <= allowed);
  if (scored.length === 0) return undefined;
  const distance = Math.min(...scored.map((s) => s.distance));
  return { distance, names: scored.filter((s) => s.distance === distance).map((s) => s.name) };
}

/** Rule B's candidate test (§ 4.4). */
function suggestedKeyword(token: PositionedToken, project: Project): string | undefined {
  const { text } = token;
  const excluded = isReservedWord(text) || isLibraryName(text) || project.declared.has(text.toLowerCase());
  if (!isWord(token) || excluded || text.length < MIN_KEYWORD_TYPO_LENGTH) return undefined;
  const found = nearest(text, SUGGESTED_KEYWORDS);
  return found?.names.length === 1 ? found.names[0] : undefined;
}

/**
 * Rule C (§ 4.5): the nearest of the same file's names, the library names and
 * the keywords. A tie between groups goes to the earlier group; a tie inside the
 * winning group gives no suggestion.
 */
function suggestedName(word: string, file: SourceFile): string | undefined {
  if (word.length < MIN_UNDECLARED_TYPO_LENGTH) return undefined;
  const groups = [file.declared, LIBRARY_NAMES, SUGGESTED_KEYWORDS].map((names) => nearest(word, names));
  const distances = groups.flatMap((group) => (group ? [group.distance] : []));
  const winner = groups.find((group) => group?.distance === Math.min(...distances));
  return winner?.names.length === 1 ? winner.names[0] : undefined;
}

// ------------------------------------------------------------ the rules

type Rule = (place: Place, project: Project) => Advice | undefined;

/** Rule E stops at the start of the design unit the error is in. */
const DESIGN_UNIT_KEYWORDS: ReadonlySet<string> = new Set(['architecture', 'entity', 'package', 'configuration']);

/** Rule E (§ 4.7): `endif` as the first word of a line, from the error line up to the start of its design unit. */
const joinedKeyword: Rule = ({ diagnostic, file }) => {
  if (!isSyntaxError(diagnostic.message)) return undefined;
  for (let line = diagnostic.line; line >= 1; line--) {
    const [first] = positionedTokens(file.lines[line - 1]);
    const word = first?.text ?? '';
    const wanted = JOINED_KEYWORDS.get(word.toLowerCase());
    if (wanted) return { headline: adviceText.joinedKeyword(word, line, wanted), relatedLine: line };
    if (DESIGN_UNIT_KEYWORDS.has(word.toLowerCase())) return undefined;
  }
  return undefined;
};

/** The anchor, then its neighbours nearest first; on a tie the one after the anchor first. */
function aroundAnchor({ tokens, anchor }: Place): PositionedToken[] {
  if (anchor < 0) return [];
  const order = [anchor];
  for (let step = 1; step <= KEYWORD_SEARCH_TOKENS; step++) order.push(anchor + step, anchor - step);
  return order.flatMap((i) => (tokens[i] ? [tokens[i]] : []));
}

/** Rule B (§ 4.4): a misspelled keyword near GHDL's caret. */
const misspelledKeyword: Rule = (place, project) => {
  if (!isSyntaxError(place.diagnostic.message)) return undefined;
  for (const token of aroundAnchor(place)) {
    const keyword = suggestedKeyword(token, project);
    if (keyword) return { headline: adviceText.keywordTypo(token.text, keyword), span: spanOf(token) };
  }
  return undefined;
};

const NO_DECLARATION = /^no declaration for "(?<name>.+)"$/;

/** Rule C (§ 4.5): "did you mean" for an undeclared name, named as the student wrote it. */
const undeclaredName: Rule = (place) => {
  const name = NO_DECLARATION.exec(place.diagnostic.message)?.groups?.name;
  if (name === undefined) return undefined;
  const written = aroundAnchor(place).find((token) => token.text.toLowerCase() === name.toLowerCase());
  const word = written?.text ?? name;
  const suggestion = suggestedName(word, place.file);
  return suggestion ? { headline: adviceText.undeclared(word, suggestion), span: spanOf(written) } : undefined;
};

/**
 * A line may legitimately end with these and go on on the next line; any other
 * ending without `;` is unfinished (§ 4.6). Punctuation other than `)` counts as
 * going on: `(`, `,`, `=>`, `<=`, `+`, `&`.
 */
const CONTINUING_WORDS: ReadonlySet<string> = new Set([
  'is', 'begin', 'then', 'else', 'generate', 'loop',
  'and', 'or', 'nand', 'nor', 'xor', 'xnor', 'not', 'mod', 'rem', 'abs',
  'sll', 'srl', 'sla', 'sra', 'rol', 'ror',
]);

function isCodeLine(line: string): boolean {
  return positionedTokens(line).some((token) => token.type !== 'comment');
}

/** The nearest line above `line` that holds code; comments and blank lines are skipped, however many. */
function previousCodeLine(file: SourceFile, line: number): number | undefined {
  for (let above = line - 1; above >= 1; above--) if (isCodeLine(file.lines[above - 1])) return above;
  return undefined;
}

function looksUnfinished(line: string): boolean {
  const code = positionedTokens(line).filter((token) => token.type !== 'comment');
  const last = code[code.length - 1];
  if (last === undefined || last.text.endsWith(';')) return false;
  if (last.type === 'punctuation') return last.text.endsWith(')');
  return !CONTINUING_WORDS.has(last.text.toLowerCase());
}

const EXPECTED_WORD = /^['"](?<symbol>[^'"]+)['"] is expected/;
const MISSING_SEMICOLON = /';' expected|missing ";"|unit name expected/;

function previousLineHeadline(message: string, line: number): string {
  const symbol = EXPECTED_WORD.exec(message)?.groups?.symbol ?? (MISSING_SEMICOLON.test(message) ? ';' : undefined);
  return symbol ? adviceText.missingAtEnd(symbol, line) : adviceText.checkEndOfLine(line);
}

/**
 * Rule D (§ 4.6): GHDL's caret is on the first word of its line, and the code
 * line before it looks unfinished. Not when that line already shows an error of
 * its own: that error is the explanation, and a second one would contradict it
 * (process-typo would add "missing `<=` at the end of line 38" under the
 * `proces` advice on line 38).
 */
const causeOnPreviousLine: Rule = ({ diagnostic, file, tokens, index }) => {
  const caretStartsLine = tokens[0]?.start === index;
  if (!isSyntaxError(diagnostic.message) || !caretStartsLine) return undefined;
  const previous = previousCodeLine(file, diagnostic.line);
  if (previous === undefined || file.errorLines.has(previous)) return undefined;
  if (!looksUnfinished(file.lines[previous - 1])) return undefined;
  return { headline: previousLineHeadline(diagnostic.message, previous), relatedLine: previous };
};

/** Tried in order; the first advice wins. The table is certain where distance is a guess, so E is first. */
const RULES: readonly Rule[] = [joinedKeyword, misspelledKeyword, undeclaredName, causeOnPreviousLine];

// ------------------------------------------------------------ public

function adviceFor(place: Place, project: Project): Advice | undefined {
  const underline = spanOf(place.tokens[place.anchor]);
  for (const rule of RULES) {
    const advice = rule(place, project);
    if (advice) return { ...advice, span: advice.span ?? underline };
  }
  return underline && { span: underline };
}

/**
 * Adds advice to GHDL compile errors (§ 4.1): the word to underline (Rule A),
 * a headline when a rule is confident (B–E), and the muting of follow-on errors
 * (F). Keeps the input order; diagnostics without advice come back unchanged.
 */
export function adviseDiagnostics(located: readonly LocatedDiagnostic[], snapshot: RunSnapshot): AdvisedDiagnostic[] {
  const muted = followOns(located);
  const project = projectOf(located, snapshot, muted);
  return located.map((diagnostic) => {
    const file = project.files.get(diagnostic.fileId);
    if (!isAdvisable(diagnostic) || file === undefined) return diagnostic;
    const primaryLine = muted.get(diagnostic);
    if (primaryLine !== undefined) {
      const headline = primaryLine === diagnostic.line ? adviceText.followOnSameLine() : adviceText.followOn(primaryLine);
      return { ...diagnostic, advice: { headline, followOnOf: primaryLine } };
    }
    const advice = adviceFor(placeOf(diagnostic, file), project);
    return advice ? { ...diagnostic, advice } : diagnostic;
  });
}

/**
 * Where to take the student after a failed compile: the first error as before
 * (muted follow-ons never lead), or the line Rules D and E name when it is close
 * enough that both stay in view (§ 4.10).
 */
export function revealTarget(advised: readonly AdvisedDiagnostic[]): Pick<LocatedDiagnostic, 'fileId' | 'line'> | undefined {
  const target = firstRevealTarget(advised.filter((d) => !isFollowOn(d)));
  if (target === undefined) return undefined;
  const related = target.advice?.relatedLine;
  const bothInView = related !== undefined && Math.abs(target.line - related) <= REVEAL_RELATED_WITHIN_LINES;
  return { fileId: target.fileId, line: bothInView ? related : target.line };
}
