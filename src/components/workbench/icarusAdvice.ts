// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Advice on top of Icarus Verilog's messages — docs/editor_diagnostics_verilog_research.md
 * § 3. The GHDL rules keep their letters, but Icarus prints no column, so every
 * rule works on whole lines: the reported line, and the previous line of code,
 * because Icarus often reports a mistake one code line late (§ 1, F3). The
 * compiler's text is never replaced: advice is added next to it. Pure.
 *
 * Only the files the snapshot names as Verilog come here (diagnosticAdvice.ts
 * picks the rules by file extension).
 */

import type { Advice, AdvisedDiagnostic } from './diagnosticAdvice';
import type { LocatedDiagnostic, RunSnapshot } from './diagnosticLocation';
import { adviceText } from './diagnosticText';
import { nearestInGroups, uniqueNearest } from './nearestWord';
import { verilogDeclaredNames } from './verilogDeclaredNames';
import { tokenizeVerilog } from './verilogHighlight';
import type { Token } from './vhdlHighlight';
import { SUGGESTED_VERILOG_KEYWORDS, SYSTEMVERILOG_WORDS, VERILOG_JOINED_KEYWORDS } from './verilogWords';

/** How the tooltip names the tool, and the headlines the language. */
const COMPILER = 'Icarus';
const LANGUAGE = 'Verilog';

/** Shorter words are "corrected" only to a keyword of their own length: `rge` → `reg`, `edn` → `end` (§ 7 #2). */
const MIN_KEYWORD_TYPO_LENGTH = 4;
const SHORT_KEYWORD_LENGTH = 3;
const SHORT_KEYWORDS: readonly string[] = SUGGESTED_VERILOG_KEYWORDS.filter((w) => w.length === SHORT_KEYWORD_LENGTH);
/** Rules C and G take names from 3 letters on, as GHDL's Rule C does. */
const MIN_NAME_TYPO_LENGTH = 3;

// ------------------------------------------------------------ Rule F (§ 3)

/** Icarus's wording when it could not parse a line, from the measured corpus. */
const SYNTAX_ERROR_PATTERNS: readonly RegExp[] = [
  /^syntax error$/, /^Syntax error /, /^Invalid module (instantiation|item\.)$/, /^Malformed /,
  /^Invalid event control\.$/, /^generate else is missing matching if\.$/,
];

/**
 * What Icarus prints while it skips ahead to find its place again. The first two
 * are also what a real second mistake produces (two-mistakes: a missing `;` on
 * line 41 is reported as `45: Invalid module item.`), so they are muted only when
 * the line above them looks finished — otherwise Rule D explains them.
 */
const LOST_PLACE_PATTERNS: readonly RegExp[] = [
  /^Invalid module instantiation$/, /^Invalid module item\.$/, /^generate else is missing matching if\.$/,
];

/**
 * Printed on line 1 after a syntax error in a declaration further down
 * (semicolon-decl), whatever line 1 holds. Only this measured message: a real
 * error can be on line 1 too. (`Errors in port declarations.` also goes to line
 * 1, but has no `error:` word, so the parser never makes a diagnostic of it.)
 */
const LINE_ONE_PATTERNS: readonly RegExp[] = [/^Syntax error in variable list\.$/];

const matchesAny = (patterns: readonly RegExp[], message: string): boolean => patterns.some((p) => p.test(message));

function isSyntaxError(message: string): boolean {
  return matchesAny(SYNTAX_ERROR_PATTERNS, message);
}

function isBogusLineOne(diagnostic: LocatedDiagnostic): boolean {
  return diagnostic.line === 1 && matchesAny(LINE_ONE_PATTERNS, diagnostic.message);
}

function isError(diagnostic: LocatedDiagnostic): boolean {
  return diagnostic.severity === 'error';
}

// ---------------------------------------------------------------- context

interface PositionedToken {
  readonly text: string;
  readonly type: Token['type'];
  readonly start: number;
  readonly end: number;
}

interface SourceFile {
  /** One entry per line, without whitespace; comments kept, so a code line can be told apart. */
  readonly tokens: readonly (readonly PositionedToken[])[];
  /** Names declared in this file, as written (the suggestions of Rules C and G). */
  readonly declared: readonly string[];
}

interface Project {
  /** Every name declared anywhere in the project, lower case (Rule B's exclusions). */
  readonly declared: ReadonlySet<string>;
  /** Per file, the lines with an error that is not muted. */
  readonly errorLines: ReadonlyMap<string, ReadonlySet<number>>;
}

function positioned(line: readonly Token[]): PositionedToken[] {
  const tokens: PositionedToken[] = [];
  let start = 0;
  for (const { text, type } of line) {
    if (type !== 'whitespace') tokens.push({ text, type, start, end: start + text.length });
    start += text.length;
  }
  return tokens;
}

function sourceFileOf(content: string): SourceFile {
  const lines = content.split('\n').map((line) => line.replace(/\r$/, ''));
  return { tokens: tokenizeVerilog(lines).map(positioned), declared: verilogDeclaredNames(content) };
}

function codeTokens(file: SourceFile, line: number): PositionedToken[] {
  return (file.tokens[line - 1] ?? []).filter((token) => token.type !== 'comment');
}

/** The nearest line above `line` that holds code; comments and blank lines are skipped, however many. */
function previousCodeLine(file: SourceFile, line: number): number | undefined {
  for (let above = line - 1; above >= 1; above--) if (codeTokens(file, above).length > 0) return above;
  return undefined;
}

/**
 * The words after which a `)` ends a header that goes on on the next line:
 * `always @(posedge clk)`, `if (x)`, `case (sel)`.
 */
const HEADER_WORDS: ReadonlySet<string> = new Set([
  'if', 'else', 'for', 'while', 'repeat', 'forever', 'always', 'initial', 'case', 'casex', 'casez', 'wait', '@', '#',
]);
/** Tokens a statement cannot end with, so the line is unfinished when it stops there without a `;`. */
const VALUE_TYPES: ReadonlySet<Token['type']> = new Set(['identifier', 'number', 'string', 'system']);
const CLOSING = new Set([')', ']', '}']);

/**
 * A line that should have ended with `;` (§ 3, Rule D): it ends in a name, a
 * number or a closing bracket. It is not unfinished when it ends in `;`, a
 * keyword (`begin`, `end`, `else`), an operator or `,` (the statement goes on),
 * or the `)` of an `if` or `always` header; a compiler-directive line never is.
 */
function looksUnfinished(tokens: readonly PositionedToken[]): boolean {
  const [first] = tokens;
  const last = tokens[tokens.length - 1];
  if (last === undefined || first.type === 'directive') return false;
  if (VALUE_TYPES.has(last.type)) return true;
  if (!CLOSING.has(last.text)) return false;
  return !(last.text === ')' && HEADER_WORDS.has(first.text));
}

function previousLineUnfinished(file: SourceFile, line: number): boolean {
  const previous = previousCodeLine(file, line);
  return previous !== undefined && looksUnfinished(codeTokens(file, previous));
}

const ASSIGNMENT_START: ReadonlySet<string> = new Set(['=', '<', '[']);

/**
 * The line starts a statement (§ 3, Rule D): a keyword (`assign`, `always`,
 * `end`, `reg`, …), a system task, or a name being assigned or instantiated.
 */
function startsStatement(tokens: readonly PositionedToken[]): boolean {
  const [first, second] = tokens;
  if (first === undefined) return false;
  if (first.type === 'keyword' || first.type === 'type' || first.type === 'system') return true;
  return first.type === 'identifier' && second !== undefined && (ASSIGNMENT_START.has(second.text) || second.type === 'identifier');
}

// ------------------------------------------------------------ muting

/**
 * The muted follow-on errors, each with the line of its file's first error.
 * After a syntax error: a later error on a line that already has one, a
 * lost-place message the line above does not explain, and the bogus line-1
 * messages. Nothing else, so an independent mistake stays visible.
 */
function followOns(located: readonly LocatedDiagnostic[], files: ReadonlyMap<string, SourceFile>): ReadonlyMap<LocatedDiagnostic, number> {
  const muted = new Map<LocatedDiagnostic, number>();
  for (const [fileId, file] of files) {
    const errors = located.filter((d) => d.fileId === fileId && isError(d)).sort((a, b) => a.line - b.line);
    const primary = errors.find((d) => !isBogusLineOne(d));
    if (primary === undefined || !isSyntaxError(primary.message)) continue;
    errors.forEach((error, i) => {
      if (error === primary) return;
      const lineHasEarlierError = i > 0 && errors[i - 1].line === error.line;
      const lostPlace = matchesAny(LOST_PLACE_PATTERNS, error.message) && !previousLineUnfinished(file, error.line);
      if (lineHasEarlierError || lostPlace || isBogusLineOne(error)) muted.set(error, primary.line);
    });
  }
  return muted;
}

function projectOf(
  located: readonly LocatedDiagnostic[],
  files: ReadonlyMap<string, SourceFile>,
  muted: ReadonlyMap<LocatedDiagnostic, number>,
): Project {
  const errorLines = new Map<string, ReadonlySet<number>>();
  for (const fileId of files.keys()) {
    const shown = located.filter((d) => d.fileId === fileId && isError(d) && !muted.has(d));
    errorLines.set(fileId, new Set(shown.map((d) => d.line)));
  }
  const declared = [...files.values()].flatMap((file) => file.declared.map((name) => name.toLowerCase()));
  return { declared: new Set(declared), errorLines };
}

// ------------------------------------------------------------ the rules

/** One message and the lines it is about. */
interface Place {
  readonly diagnostic: LocatedDiagnostic;
  readonly file: SourceFile;
  /** The reported line's code tokens. */
  readonly tokens: readonly PositionedToken[];
  readonly previousLine: number | undefined;
}

type Rule = (place: Place, project: Project) => Advice | undefined;

function spanOf(token: PositionedToken | undefined): Advice['span'] {
  return token && { start: token.start, end: token.end };
}

function tokenNamed(tokens: readonly PositionedToken[], name: string): PositionedToken | undefined {
  return tokens.find((token) => token.text === name);
}

/** A line Rules B and E look at, and whether it is the reported line. */
interface Looked {
  readonly line: number;
  readonly tokens: readonly PositionedToken[];
  readonly reported: boolean;
}

/**
 * The reported line, then the previous code line — but only when that line does
 * not end in `;`: a finished line would have been reported itself (research § 3, point 2).
 */
function linesToLook({ diagnostic, file, tokens, previousLine }: Place): Looked[] {
  const looked: Looked[] = [{ line: diagnostic.line, tokens, reported: true }];
  if (previousLine === undefined) return looked;
  const previous = codeTokens(file, previousLine);
  if (previous[previous.length - 1]?.text !== ';') looked.push({ line: previousLine, tokens: previous, reported: false });
  return looked;
}

/** The advice about a word on a looked-at line: underlined there, or pointed at from the reported line. */
function aboutWord(looked: Looked, token: PositionedToken, headlines: { here: string; there: string }): Advice {
  return looked.reported
    ? { headline: headlines.here, span: spanOf(token) }
    : { headline: headlines.there, relatedLine: looked.line };
}

function isStudentsName(token: PositionedToken, project: Project): boolean {
  return project.declared.has(token.text.toLowerCase()) || SYSTEMVERILOG_WORDS.has(token.text);
}

/** Rule E: `endif`, `elseif` on the reported line or the one before; the table is certain, so it goes first. */
const joinedKeyword: Rule = (place, project) => {
  if (!isSyntaxError(place.diagnostic.message)) return undefined;
  for (const looked of linesToLook(place)) {
    const token = looked.tokens.find((t) => VERILOG_JOINED_KEYWORDS.has(t.text) && !isStudentsName(t, project));
    const wanted = token && VERILOG_JOINED_KEYWORDS.get(token.text);
    if (token && wanted) {
      const headline = adviceText.joinedKeyword(token.text, looked.line, wanted, LANGUAGE);
      return aboutWord(looked, token, { here: headline, there: headline });
    }
  }
  return undefined;
};

/** Rule B's candidate test: a name the student did not declare, near exactly one keyword. */
function suggestedKeyword(token: PositionedToken, project: Project): string | undefined {
  if (token.type !== 'identifier' || isStudentsName(token, project)) return undefined;
  if (token.text.length >= MIN_KEYWORD_TYPO_LENGTH) {
    return uniqueNearest(token.text, SUGGESTED_VERILOG_KEYWORDS, { caseSensitive: true });
  }
  if (token.text.length === SHORT_KEYWORD_LENGTH) return uniqueNearest(token.text, SHORT_KEYWORDS, { caseSensitive: true });
  return undefined;
}

/**
 * Rule B: a misspelled keyword, which Icarus reads as a module instance
 * (`alwyas` → "Invalid module instantiation", § 1, F2). Every word of the
 * reported line, left to right; the previous code line only when the reported
 * line has none (begin-typo: `begn` on 31 is reported on 32).
 */
const misspelledKeyword: Rule = (place, project) => {
  if (!isSyntaxError(place.diagnostic.message)) return undefined;
  for (const looked of linesToLook(place)) {
    for (const token of looked.tokens) {
      const keyword = suggestedKeyword(token, project);
      if (keyword) {
        return aboutWord(looked, token, {
          here: adviceText.keywordTypo(token.text, keyword, LANGUAGE),
          there: adviceText.keywordTypoOnLine(token.text, looked.line, keyword, LANGUAGE),
        });
      }
    }
  }
  return undefined;
};

/** Undeclared names: 13.0 and 12.0 say `Unable to bind`; with `default_nettype none`, `is not defined`. */
const UNDECLARED: readonly RegExp[] = [
  /^Unable to bind wire\/reg\/memory `(?<name>[^']+)' in `/,
  /^Net (?<name>\S+) is not defined in this context\.$/,
];

function nameIn(patterns: readonly RegExp[], message: string): string | undefined {
  for (const pattern of patterns) {
    const name = pattern.exec(message)?.groups?.name;
    if (name !== undefined) return name;
  }
  return undefined;
}

/** A name from the file itself, then a keyword; Verilog names are case-sensitive, so `Counter` may mean `counter`. */
function suggestedName(name: string, file: SourceFile, groups: readonly (readonly string[])[]): string | undefined {
  if (name.length < MIN_NAME_TYPO_LENGTH) return undefined;
  return nearestInGroups(name, [file.declared, ...groups], { caseSensitive: true });
}

/** Rule C: "did you mean" for a name Icarus could not bind. */
const undeclaredName: Rule = ({ diagnostic, file, tokens }) => {
  const name = nameIn(UNDECLARED, diagnostic.message);
  const suggestion = name && suggestedName(name, file, [SUGGESTED_VERILOG_KEYWORDS]);
  if (!name || !suggestion) return undefined;
  return { headline: adviceText.undeclared(name, suggestion), span: spanOf(tokenNamed(tokens, name)) };
};

const IMPLICIT_WIRE = [/^implicit definition of wire '(?<name>[^']+)'\.$/];

/**
 * Rule G: a misspelled name on the left of `assign` compiles — Icarus makes a new
 * wire, warns only with -Wall, and the LEDs stay dark (§ 1, F4). Advice only when
 * the name is close to one the file declares; an intended implicit wire has none.
 */
const implicitWire = ({ diagnostic, file, tokens }: Place): Advice | undefined => {
  const name = nameIn(IMPLICIT_WIRE, diagnostic.message);
  const suggestion = name && suggestedName(name, file, []);
  if (!name || !suggestion) return undefined;
  return { headline: adviceText.implicitWire(name, suggestion), span: spanOf(tokenNamed(tokens, name)) };
};

/** 13.0: `Variable 'x' cannot be driven by a continuous assignment/module.`; 12.0: `reg x; cannot be driven by …` (§ 2.3). */
const REG_DRIVEN_BY_ASSIGN: readonly RegExp[] = [
  /^Variable '(?<name>[^']+)' cannot be driven by a continuous assignment/,
  /^reg (?<name>[^;\s]+); cannot be driven by primitives or continuous assignment/,
];
/** 13.0: `'x' is not a valid l-value …`; 12.0: `x is not a valid l-value …`. */
const NOT_AN_L_VALUE = [/^'?(?<name>[^'\s]+)'? is not a valid l-value/];
/** The note under it, when the name is a wire: `'x' is declared here as a wire.` (12.0: `as wire.`). */
const DECLARED_AS_WIRE = /is declared here as (a )?wire\.$/;

/**
 * Rule H: Icarus's own words, rewritten for a beginner. Its note for `assign` to a
 * `reg` says SystemVerilog would allow it (§ 1, F6), which is no help; and
 * "l-value" is compiler vocabulary.
 */
const regOrWireMisuse: Rule = ({ diagnostic, tokens }) => {
  const reg = nameIn(REG_DRIVEN_BY_ASSIGN, diagnostic.message);
  if (reg) return { headline: adviceText.regDrivenByAssign(reg), span: spanOf(tokenNamed(tokens, reg)) };
  const wire = nameIn(NOT_AN_L_VALUE, diagnostic.message);
  if (wire && diagnostic.details.some((detail) => DECLARED_AS_WIRE.test(detail))) {
    return { headline: adviceText.wireAssignedInAlways(wire), span: spanOf(tokenNamed(tokens, wire)) };
  }
  return undefined;
};

/**
 * Rule D: Icarus noticed the problem at the start of a statement, and the code
 * line before it looks unfinished — a missing `;`, reported one code line late
 * (§ 1, F3). Not when that line already shows an error of its own: that error is
 * the explanation (semicolon-assign's line 41).
 */
const causeOnPreviousLine: Rule = ({ diagnostic, file, tokens, previousLine }, project) => {
  if (!isSyntaxError(diagnostic.message) || !startsStatement(tokens) || previousLine === undefined) return undefined;
  if (project.errorLines.get(diagnostic.fileId)?.has(previousLine)) return undefined;
  if (!looksUnfinished(codeTokens(file, previousLine))) return undefined;
  return { headline: adviceText.missingAtEnd(';', previousLine), relatedLine: previousLine };
};

/** Tried in order; the first advice wins. The certain table (E) before the guesses. */
const RULES: readonly Rule[] = [joinedKeyword, misspelledKeyword, undeclaredName, implicitWire, regOrWireMisuse, causeOnPreviousLine];

// ------------------------------------------------------------ public

function placeOf(diagnostic: LocatedDiagnostic, file: SourceFile): Place {
  return {
    diagnostic,
    file,
    tokens: codeTokens(file, diagnostic.line),
    previousLine: previousCodeLine(file, diagnostic.line),
  };
}

function adviceFor(place: Place, project: Project): Advice | undefined {
  for (const rule of RULES) {
    const advice = rule(place, project);
    if (advice) return { ...advice, compiler: COMPILER };
  }
  return undefined;
}

/** Every file of the snapshot: Rule B's exclusions are the names declared anywhere in the project. */
function filesOf(snapshot: RunSnapshot): Map<string, SourceFile> {
  return new Map(snapshot.files.map((file) => [file.id, sourceFileOf(file.content)]));
}

/**
 * Adds advice to Icarus compile messages: a headline when a rule is confident
 * (B, C, D, E, G, H), the word to underline when it names one, and the muting of
 * follow-on errors (F). Keeps the input order; messages without advice come back
 * unchanged.
 */
export function adviseIcarusDiagnostics(located: readonly LocatedDiagnostic[], snapshot: RunSnapshot): AdvisedDiagnostic[] {
  const files = filesOf(snapshot);
  const muted = followOns(located, files);
  const project = projectOf(located, files, muted);
  return located.map((diagnostic) => {
    const file = files.get(diagnostic.fileId);
    if (file === undefined) return diagnostic;
    const primaryLine = muted.get(diagnostic);
    if (primaryLine !== undefined) {
      const headline = primaryLine === diagnostic.line ? adviceText.followOnSameLine() : adviceText.followOn(primaryLine);
      return { ...diagnostic, advice: { headline, followOnOf: primaryLine, compiler: COMPILER } };
    }
    const advice = adviceFor(placeOf(diagnostic, file), project);
    return advice ? { ...diagnostic, advice } : diagnostic;
  });
}

/**
 * Advice for LOG lines: only Rule G. A successful compile's warnings arrive as
 * LOG lines, and that is where an implicit wire is reported; every other LOG line
 * is the simulation's own output, which gets no advice (improvement plan § 4.12).
 */
export function adviseIcarusLog(located: readonly LocatedDiagnostic[], snapshot: RunSnapshot): AdvisedDiagnostic[] {
  const files = filesOf(snapshot);
  return located.map((diagnostic) => {
    const file = files.get(diagnostic.fileId);
    const advice = file && implicitWire(placeOf(diagnostic, file));
    return advice ? { ...diagnostic, advice: { ...advice, compiler: COMPILER } } : diagnostic;
  });
}
