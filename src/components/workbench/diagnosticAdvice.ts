// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Advice on top of GHDL's messages, where the measured output shows GHDL's words
 * mislead but its column does not — docs/editor_diagnostics_improvement_plan.md
 * § 4. The compiler's text is never replaced: advice is added next to it. Pure.
 *
 * GHDL's rules need its column, so they only take GHDL compile errors. Verilog
 * files get Icarus's line-level rules instead (icarusAdvice.ts,
 * docs/editor_diagnostics_verilog_research.md). `useDiagnostics` runs this on
 * ERROR frames; runtime LOG lines get no advice (§ 4.12), except Icarus's
 * implicit-wire warning (`adviseLogDiagnostics`).
 */

import { declaredNames } from './declaredNames';
import { firstRevealTarget, type LocatedDiagnostic, type RunSnapshot } from './diagnosticLocation';
import { isMuted } from './diagnosticStore';
import { adviceText } from './diagnosticText';
import { languageOfName } from './fileKinds';
import { ghdlColumnToIndex } from './ghdlColumn';
import { adviseIcarusDiagnostics, adviseIcarusLog } from './icarusAdvice';
import {
  architectureAbove,
  architectureBegin,
  architectureMissingBegin,
  DECLARATION_WORDS,
  designUnitEnd,
  loneWord,
  statementRegionHome,
} from './vhdlStructure';
import { nearestInGroups, uniqueNearest } from './nearestWord';
import { splitLines } from './textLines';
import { addUseClause, clashingPackageInUse } from './useClauseFix';
import { tokenizeVhdlLine, type Token } from './vhdlHighlight';
import { packageDeclaring, type VhdlPackage } from './vhdlPackages';
import {
  isLibraryName,
  isReservedWord,
  JOINED_KEYWORDS,
  LIBRARY_NAMES,
  SUGGESTED_KEYWORDS,
} from './vhdlWords';
import { architectureHeaders, entityHeaders, sameName, suggestedEntityName } from './vhdlUnits';

/** A range in one line of the snapshot: 0-based character offsets, end exclusive. */
export interface Span {
  readonly start: number;
  readonly end: number;
}

/**
 * A change HDLBoard can make for the student, like VS Code's Quick Fix: add the
 * missing `use` clause, or insert the `begin` an architecture's statements lack,
 * or put it in place of the misspelled word written there, or name the entity
 * an architecture meant.
 */
export type QuickFix =
  | { readonly kind: 'addUseClause'; readonly pkg: VhdlPackage }
  | { readonly kind: 'insertBegin' }
  | { readonly kind: 'replaceWithBegin' }
  | { readonly kind: 'replaceEntityName'; readonly written: string; readonly entity: string };

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
  /** Who printed the message, as the tooltip names it (`Icarus`); absent for GHDL, whose advice came first. */
  readonly compiler?: string;
  /** Offered next to the message; applied only when the student asks. */
  readonly fix?: QuickFix;
  /** A few words shown on `relatedLine` itself, saying why it is pointed at. */
  readonly relatedNote?: string;
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
  // GHDL is still in the declarations because of the earlier error (a missing or misspelled `begin`).
  /^'begin' is expected instead of /,
];

/**
 * Follows from an earlier error in the same file whatever that error is
 * (mode-typo) — unless no file declares that entity at all (`unknownEntity`).
 */
const NOT_ANALYSED = /^entity "(?<name>.+)" was not analysed$/;

/** An entity declared in the project: `entity DE1_SoC is` on `line` of file `fileId`. */
interface DeclaredEntity {
  readonly name: string;
  readonly fileId: string;
  readonly line: number;
}

function entitiesOf(snapshot: RunSnapshot): DeclaredEntity[] {
  return snapshot.files.flatMap(({ id, content }) => entityHeaders(content).map((entity) => ({ ...entity, fileId: id })));
}

/**
 * `architecture rtl of DE1_SdddoC`: the entity GHDL names is declared nowhere in
 * the project, so the name is the student's mistake, not a follow-on of an error
 * in the entity. Undefined when the message is not that, or the entity exists.
 */
function unknownEntity(message: string, entities: readonly DeclaredEntity[]): string | undefined {
  const name = NOT_ANALYSED.exec(message)?.groups?.name;
  if (name === undefined) return undefined;
  return entities.some((entity) => entity.name.toLowerCase() === name.toLowerCase()) ? undefined : name;
}

export function isSyntaxError(message: string): boolean {
  return SYNTAX_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

/** `unexpected token 'signal' in a concurrent statement list`: GHDL names the word it stopped at. */
const UNEXPECTED_IN_CONCURRENT = /^unexpected token '(?<word>\w+)' in a concurrent statement list$/;

/** A declaration after `begin`: each one is the student's own mistake, never GHDL losing its place. */
function isMisplacedDeclaration(message: string): boolean {
  const word = UNEXPECTED_IN_CONCURRENT.exec(message)?.groups?.word;
  return word !== undefined && DECLARATION_WORDS.has(word.toLowerCase());
}

/** `architecture rtl2 of …` written inside an open architecture: GHDL stops at its first word. */
const NESTED_DESIGN_UNIT =
  /^unexpected token '(?<unit>architecture|entity|package|configuration|context)' in a concurrent statement list$/;

/**
 * A design unit started inside an architecture. GHDL then reads the rest of the
 * file as nonsense, so every later error in the file follows from this one.
 */
function nestedDesignUnit(message: string): string | undefined {
  return NESTED_DESIGN_UNIT.exec(message)?.groups?.unit;
}

function isLostPlace(message: string): boolean {
  return !isMisplacedDeclaration(message) && LOST_PLACE_PATTERNS.some((pattern) => pattern.test(message));
}

function isAdvisable(diagnostic: LocatedDiagnostic): boolean {
  return diagnostic.severity === 'error' && diagnostic.column !== undefined;
}

function byPosition(a: LocatedDiagnostic, b: LocatedDiagnostic): number {
  return a.line - b.line || (a.column ?? 0) - (b.column ?? 0);
}

/**
 * One file's muted follow-on errors (`errors` in position order), each with the
 * line of the error it follows from: the nearest earlier cause, so
 * that after two mistakes a cascade names the second. Only what cannot be an
 * independent mistake is muted: a later error on a line that already has one,
 * and a lost-place message — measured on 29 captures, this hides no second
 * mistake (§ 2.6). Everything after a design unit started inside an
 * architecture is muted too: GHDL reads the rest of the file wrongly.
 * `ownMistakes` are never muted otherwise.
 */
function followOnsInFile(
  errors: readonly LocatedDiagnostic[],
  ownMistakes: ReadonlySet<LocatedDiagnostic>,
  muted: Map<LocatedDiagnostic, number>,
): void {
  const primary = errors.find((d) => !NOT_ANALYSED.test(d.message));
  if (primary === undefined) return;
  const afterSyntaxError = isSyntaxError(primary.message);
  // After an earlier syntax error, GHDL may meet `architecture` only because it lost its place.
  const nested = errors.find((d) => nestedDesignUnit(d.message) !== undefined && (d === primary || !afterSyntaxError));
  // A cause is the first error or a mistake of its own after it; other errors left shown are no cause:
  // in a cascade GHDL prints some that no pattern mutes. An unknown entity before `primary` is none either.
  const isFollowOn = (error: LocatedDiagnostic, i: number): boolean => {
    if (nested !== undefined && byPosition(nested, error) < 0) return true;
    if (error === primary || ownMistakes.has(error)) return false;
    const lineHasEarlierError = i > 0 && errors[i - 1].line === error.line;
    const cascade = afterSyntaxError && (lineHasEarlierError || isLostPlace(error.message));
    return cascade || NOT_ANALYSED.test(error.message);
  };
  let cause: LocatedDiagnostic = primary;
  errors.forEach((error, i) => {
    if (isFollowOn(error, i)) muted.set(error, cause.line);
    else if (ownMistakes.has(error) && byPosition(error, primary) > 0) cause = error;
  });
}

/**
 * The muted follow-on errors of every file. GHDL does not print errors in
 * position order (downto-typo prints 13:52 before 13:44), so each file's errors
 * are sorted first.
 */
function followOns(
  located: readonly LocatedDiagnostic[],
  ownMistakes: ReadonlySet<LocatedDiagnostic>,
): ReadonlyMap<LocatedDiagnostic, number> {
  const muted = new Map<LocatedDiagnostic, number>();
  for (const fileId of new Set(located.map((d) => d.fileId))) {
    const errors = located.filter((d) => d.fileId === fileId && isAdvisable(d)).sort(byPosition);
    followOnsInFile(errors, ownMistakes, muted);
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
  /** Every `entity … is` in the project: an architecture of another is an unknown entity. */
  readonly entities: readonly DeclaredEntity[];
  /** Mistakes found from the source before any error was muted (`ownMistakesOf`). */
  readonly own: OwnMistakes;
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
  entities: readonly DeclaredEntity[],
  own: OwnMistakes,
): Project {
  const files = new Map<string, SourceFile>();
  for (const file of snapshot.files) {
    const errorLines = located.filter((d) => d.fileId === file.id && isAdvisable(d) && !muted.has(d));
    files.set(file.id, {
      lines: splitLines(file.content),
      declared: declaredNames(file.content),
      errorLines: new Set(errorLines.map((d) => d.line)),
    });
  }
  const declared = [...files.values()].flatMap((file) => file.declared.map((name) => name.toLowerCase()));
  return { files, declared: new Set(declared), entities, own };
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

/** Rule B's candidate test (§ 4.4). */
function suggestedKeyword(token: PositionedToken, project: Project): string | undefined {
  const { text } = token;
  const excluded = isReservedWord(text) || isLibraryName(text) || project.declared.has(text.toLowerCase());
  if (!isWord(token) || excluded || text.length < MIN_KEYWORD_TYPO_LENGTH) return undefined;
  return uniqueNearest(text, SUGGESTED_KEYWORDS);
}

/**
 * Rule C (§ 4.5): the nearest of the same file's names, the library names and
 * the keywords. A tie between groups goes to the earlier group; a tie inside the
 * winning group gives no suggestion.
 */
/**
 * The package table holds everyday words (`input`, `width`, `line`): a near miss of a
 * name the student declared (`input` for `inputs`) is a typo, not a forgotten `use`.
 */
function isNearDeclaredName(word: string, file: SourceFile): boolean {
  return word.length >= MIN_UNDECLARED_TYPO_LENGTH && nearestInGroups(word, [file.declared]) !== undefined;
}

function suggestedName(word: string, file: SourceFile): string | undefined {
  if (word.length < MIN_UNDECLARED_TYPO_LENGTH) return undefined;
  return nearestInGroups(word, [file.declared, LIBRARY_NAMES, SUGGESTED_KEYWORDS]);
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

/** The name GHDL could not find, as the student wrote it, and where (when it is near GHDL's caret). */
function undeclaredWord(place: Place): { readonly word: string; readonly span?: Span } | undefined {
  const name = NO_DECLARATION.exec(place.diagnostic.message)?.groups?.name;
  if (name === undefined) return undefined;
  const written = aroundAnchor(place).find((token) => token.text.toLowerCase() === name.toLowerCase());
  return { word: written?.text ?? name, span: spanOf(written) };
}

/**
 * The missing package: `unsigned` without `use ieee.numeric_std.all;`. Offers the
 * `use` clause as a Quick Fix, or, when the file uses a package that clashes with
 * it (`std_logic_arith`), says so instead. No advice when the package is used
 * already: then the name is missing for another reason.
 */
const missingPackage: Rule = (place) => {
  const undeclared = undeclaredWord(place);
  const pkg = undeclared && packageDeclaring(undeclared.word);
  if (undeclared === undefined || pkg === undefined || isNearDeclaredName(undeclared.word, place.file)) return undefined;
  const { word, span } = undeclared;
  const { line } = place.diagnostic;
  const content = place.file.lines.join('\n');
  const clash = clashingPackageInUse(content, pkg, line);
  if (clash) return { headline: adviceText.packageClash(word, pkg, clash), span };
  if (addUseClause(content, pkg, line) === undefined) return undefined;
  return { headline: adviceText.missingPackage(word, pkg), span, fix: { kind: 'addUseClause', pkg } };
};

/** Rule C (§ 4.5): "did you mean" for an undeclared name, named as the student wrote it. */
const undeclaredName: Rule = (place) => {
  const undeclared = undeclaredWord(place);
  const suggestion = undeclared && suggestedName(undeclared.word, place.file);
  return suggestion ? { headline: adviceText.undeclared(undeclared.word, suggestion), span: undeclared.span } : undefined;
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
function previousCodeLine(file: Pick<SourceFile, 'lines'>, line: number): number | undefined {
  for (let above = line - 1; above >= 1; above--) if (isCodeLine(file.lines[above - 1])) return above;
  return undefined;
}

/** The nearest line below `line` that holds code; comments and blank lines are skipped. */
function nextCodeLine(file: Pick<SourceFile, 'lines'>, line: number): number | undefined {
  for (let below = line + 1; below <= file.lines.length; below++) if (isCodeLine(file.lines[below - 1])) return below;
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

/** How the advice names a declaration, from the word that starts it. */
function declarationKind(word: string): string {
  const lower = word.toLowerCase();
  if (lower === 'shared') return 'shared variable';
  if (lower === 'impure' || lower === 'pure') return `${word} function`;
  return word;
}

/** The advice, pointing at `line` (the `begin`) when there is one. */
function pointingAt(headline: string, line: number | undefined): Advice {
  return line === undefined ? { headline } : { headline, relatedLine: line };
}

// ------------------------------------------------- how the code is nested
// A declaration after `begin`, a design unit inside an architecture, an unknown
// entity: read from GHDL's own words and the shape of the code (vhdlStructure.ts).

/** `word` as the student wrote it, when GHDL's caret is on it; else `word` as GHDL printed it. */
function asWritten({ tokens, anchor }: Place, word: string): string {
  const atCaret = tokens[anchor]?.text;
  return atCaret?.toLowerCase() === word.toLowerCase() ? atCaret : word;
}

/** A declaration among an architecture's statements (`unexpected token 'signal' in a concurrent statement list`). */
const declarationInArchitectureBody: Rule = (place) => {
  const word = UNEXPECTED_IN_CONCURRENT.exec(place.diagnostic.message)?.groups?.word;
  if (word === undefined || !isMisplacedDeclaration(place.diagnostic.message)) return undefined;
  const written = asWritten(place, word);
  if (written.toLowerCase() === 'variable') return { headline: adviceText.variableInArchitecture() };
  const begin = architectureBegin(place.file.lines, place.diagnostic.line);
  return pointingAt(adviceText.declarationAfterBegin(declarationKind(written), 'is', begin), begin);
};

const DECLARATION_IN_STATEMENTS = 'declaration not allowed within statements';

/** A declaration among a process's or subprogram's statements. */
const declarationInStatements: Rule = ({ diagnostic, file, tokens, anchor }) => {
  const written = tokens[anchor]?.text;
  if (diagnostic.message !== DECLARATION_IN_STATEMENTS || written === undefined) return undefined;
  if (!DECLARATION_WORDS.has(written.toLowerCase())) return undefined;
  const home = statementRegionHome(file.lines, diagnostic.line);
  if (home === undefined) return undefined;
  if (written.toLowerCase() === 'signal' && home.region === 'process') {
    const begin = architectureBegin(file.lines, diagnostic.line);
    return pointingAt(adviceText.signalInProcess(begin), begin);
  }
  const opener = home.region === 'process' ? 'process' : 'is';
  return pointingAt(adviceText.declarationAfterBegin(declarationKind(written), opener, home.beginLine), home.beginLine);
};

const OBJECT_CLASS_EXPECTED = "object class keyword such as 'variable' is expected";
/** GHDL still reads the architecture's declarations and meets a statement. */
const BEGIN_EXPECTED = /^'begin' is expected instead of /;

/** The first pattern a line's code matches names the statement it starts, in the advice's words. */
const STATEMENT_KINDS: readonly (readonly [RegExp, string])[] = [
  [/^\s*(\w+\s*:\s*)?(postponed\s+)?process\b/i, 'process'],
  [/^\s*\w+\s*:\s*(entity|component|configuration)\b|\bport\s+map\b/i, 'instance'],
  [/^\s*\w+\s*:\s*(if|for|case)\b|\bgenerate\b/i, 'generate statement'],
  [/^\s*(\w+\s*:\s*)?(postponed\s+)?assert\b/i, 'assertion'],
  [/^\s*(\w+\s*:\s*)?with\b|<=/, 'assignment'],
];

/** The statement a line starts (`assignment`, `process` …); undefined when the line does not look like one. */
function statementKind(line: string): string | undefined {
  const code = line.replace(/--.*$/, '');
  return STATEMENT_KINDS.find(([pattern]) => pattern.test(code))?.[1];
}

/** What the advice calls the line GHDL asked for `begin` on when it starts no statement it knows. */
const ANY_LINE = 'line';

/**
 * How an architecture's `begin` went missing: never written before the first
 * statement (`assignment`, `process` …), or written wrong (`begisasa`).
 */
type MissingBegin =
  | { readonly kind: 'notWritten'; readonly beforeStatement: string }
  | { readonly kind: 'misspelled'; readonly word: string };

/** A line that ends what is open: here, the architecture with no statements yet. */
const STARTS_WITH_END = /^\s*end\b/i;

/**
 * The word alone on `line` where `begin` belongs: the next code line starts a
 * statement, or ends the architecture. Any word, however far from `begin`.
 */
function misspelledBeginOn(lines: readonly string[], line: number): string | undefined {
  const lone = loneWord(lines[line - 1] ?? '');
  if (lone === undefined || isReservedWord(lone.word)) return undefined;
  const next = nextCodeLine({ lines }, line);
  const nextText = next === undefined ? '' : lines[next - 1];
  const beginBelongsHere = statementKind(nextText) !== undefined || STARTS_WITH_END.test(nextText);
  return beginBelongsHere ? lone.word : undefined;
}

/**
 * An architecture's `begin` that is missing where GHDL reports `error`: it still
 * reads declarations, so it asks for an object class keyword such as
 * `variable`, or for `begin`. Only the first error in the architecture
 * (`earlier`, all the file's errors before this one): after another one, that
 * one explains it.
 */
function missingBeginAt(
  error: LocatedDiagnostic,
  lines: readonly string[],
  earlier: readonly LocatedDiagnostic[],
): MissingBegin | undefined {
  const asksForBegin = BEGIN_EXPECTED.test(error.message);
  if (!asksForBegin && error.message !== OBJECT_CLASS_EXPECTED) return undefined;
  const header = architectureMissingBegin(lines, error.line);
  if (header === undefined || earlier.some((d) => d.line >= header)) return undefined;
  const statement = statementKind(lines[error.line - 1] ?? '');
  if (statement !== undefined) return { kind: 'notWritten', beforeStatement: statement };
  const misspelled = misspelledBeginOn(lines, error.line);
  if (misspelled !== undefined) return { kind: 'misspelled', word: misspelled };
  return asksForBegin ? { kind: 'notWritten', beforeStatement: ANY_LINE } : undefined;
}

/** The missing `begin`, with a Quick Fix that inserts it, or puts it in place of the misspelled word. */
const missingArchitectureBegin: Rule = ({ diagnostic }, project) => {
  const missing = project.own.missingBegins.get(diagnostic);
  if (missing === undefined) return undefined;
  switch (missing.kind) {
    case 'misspelled':
      return { headline: adviceText.misspelledBegin(missing.word), fix: { kind: 'replaceWithBegin' } };
    case 'notWritten':
      return { headline: adviceText.missingBegin(missing.beforeStatement), fix: { kind: 'insertBegin' } };
  }
};

/**
 * `architecture rtl2 of …` inside `rtl`, which has no `end architecture;` yet:
 * says so on the inner `architecture`, and points at the outer one's header.
 */
const designUnitInsideArchitecture: Rule = ({ diagnostic, file }) => {
  const unit = nestedDesignUnit(diagnostic.message);
  if (unit === undefined) return undefined;
  const outer = architectureAbove(file.lines, diagnostic.line);
  const headline = adviceText.unitInsideArchitecture(unit.toLowerCase(), outer?.name);
  if (outer === undefined) return { headline };
  return { headline, relatedLine: outer.line, relatedNote: adviceText.alreadyInsideArchitecture() };
};

/**
 * `architecture rtl of DE1_SdddoC` when no file declares that entity. Suggests
 * the nearest entity name, or the project's only entity, and points at its
 * declaration when it is in the same file, with a Quick Fix that writes that name.
 */
const entityNotFound: Rule = (place, project) => {
  const name = unknownEntity(place.diagnostic.message, project.entities);
  if (name === undefined) return undefined;
  const written = asWritten(place, name);
  const entity = suggestedEntity(written, project.entities);
  const lineInThisFile = entity?.fileId === place.diagnostic.fileId ? entity.line : undefined;
  const advice = pointingAt(adviceText.unknownEntity(written, entity?.name, lineInThisFile), lineInThisFile);
  if (entity === undefined || !namesEntityAfterOf(place, written)) return advice;
  return { ...advice, fix: { kind: 'replaceEntityName', written, entity: entity.name } };
};

/** The Quick Fix's line holds the whole `architecture rtl of <written> is`: only there can it change the name. */
function namesEntityAfterOf({ file, diagnostic }: Place, written: string): boolean {
  return architectureHeaders(file.lines[diagnostic.line - 1] ?? '').some((header) => sameName(header.entity, written));
}

/** The entity the student probably meant: the nearest name, else the project's only entity. */
function suggestedEntity(written: string, entities: readonly DeclaredEntity[]): DeclaredEntity | undefined {
  const name = suggestedEntityName(written, entities.map((entity) => entity.name));
  return entities.find((entity) => entity.name === name);
}

const NO_DESIGN_UNIT = 'missing entity, architecture, package or configuration';

interface ExtraEnd {
  /** The line that closed the design unit. */
  readonly closedLine: number;
  /** What it closed, as that line says (`architecture`). */
  readonly kind?: string;
}

/**
 * An extra `end architecture;`: GHDL finds no design unit to close, and the code
 * line before it is the error-free end of one — or another extra `end`
 * (`extraBefore`, by line). `errorLines`: every line of the file with an error.
 */
function extraEndAt(
  error: LocatedDiagnostic,
  lines: readonly string[],
  errorLines: ReadonlySet<number>,
  extraBefore: ReadonlyMap<number, ExtraEnd>,
): ExtraEnd | undefined {
  if (error.message !== NO_DESIGN_UNIT || designUnitEnd(lines[error.line - 1] ?? '') === undefined) return undefined;
  const previous = previousCodeLine({ lines }, error.line);
  const closing = previous === undefined ? undefined : designUnitEnd(lines[previous - 1]);
  if (previous === undefined || closing === undefined) return undefined;
  const genuine = errorLines.has(previous) ? undefined : { closedLine: previous, kind: closing.kind };
  return extraBefore.get(previous) ?? genuine;
}

/** The code of a line, without its comment, to underline. */
function codeSpan(line: string): Span | undefined {
  const code = positionedTokens(line).filter((token) => token.type !== 'comment');
  return code.length === 0 ? undefined : { start: code[0].start, end: code[code.length - 1].end };
}

/** The extra `end`, underlined whole, pointing at the line that closed the design unit. */
const extraEnd: Rule = ({ diagnostic, file }, project) => {
  const extra = project.own.extraEnds.get(diagnostic);
  if (extra === undefined) return undefined;
  const span = codeSpan(file.lines[diagnostic.line - 1] ?? '');
  return { headline: adviceText.extraEnd(extra.closedLine, extra.kind), relatedLine: extra.closedLine, ...(span && { span }) };
};

/**
 * The student's own mistakes, read from the source before any error is muted:
 * each is a cause the follow-ons after it are named after, and is never muted
 * as a cascade itself.
 */
interface OwnMistakes {
  /** The line each extra `end`'s design unit was closed on, and its kind. */
  readonly extraEnds: ReadonlyMap<LocatedDiagnostic, ExtraEnd>;
  /** How the `begin` went missing, for each error it explains. */
  readonly missingBegins: ReadonlyMap<LocatedDiagnostic, MissingBegin>;
  /** These two, the misplaced declarations and the unknown entities. */
  readonly all: ReadonlySet<LocatedDiagnostic>;
}

function ownMistakesOf(
  located: readonly LocatedDiagnostic[],
  snapshot: RunSnapshot,
  entities: readonly DeclaredEntity[],
): OwnMistakes {
  const extraEnds = new Map<LocatedDiagnostic, ExtraEnd>();
  const missingBegins = new Map<LocatedDiagnostic, MissingBegin>();
  for (const { id, content } of snapshot.files) {
    const lines = splitLines(content);
    const errors = located.filter((d) => d.fileId === id && isAdvisable(d)).sort(byPosition);
    const errorLines = new Set(errors.map((d) => d.line));
    const extraByLine = new Map<number, ExtraEnd>();
    errors.forEach((error, i) => {
      const extra = extraEndAt(error, lines, errorLines, extraByLine);
      if (extra !== undefined) {
        extraByLine.set(error.line, extra);
        extraEnds.set(error, extra);
      }
      const missing = missingBeginAt(error, lines, errors.slice(0, i));
      if (missing !== undefined) missingBegins.set(error, missing);
    });
  }
  const isNamedFromMessage = (d: LocatedDiagnostic): boolean =>
    isMisplacedDeclaration(d.message) || unknownEntity(d.message, entities) !== undefined;
  const all = new Set([...located.filter(isNamedFromMessage), ...extraEnds.keys(), ...missingBegins.keys()]);
  return { extraEnds, missingBegins, all };
}

/**
 * Tried in order; the first advice wins. The tables are certain where distance is a
 * guess, so E is first, and the missing package comes before Rule C's "did you mean".
 * The rules read from GHDL's own words and the shape of the code go before all.
 */
const RULES: readonly Rule[] = [
  extraEnd,
  entityNotFound,
  designUnitInsideArchitecture,
  declarationInArchitectureBody,
  declarationInStatements,
  missingArchitectureBegin,
  joinedKeyword,
  misspelledKeyword,
  missingPackage,
  undeclaredName,
  causeOnPreviousLine,
];

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
function adviseGhdlDiagnostics(located: readonly LocatedDiagnostic[], snapshot: RunSnapshot): AdvisedDiagnostic[] {
  const entities = entitiesOf(snapshot);
  const own = ownMistakesOf(located, snapshot, entities);
  const muted = followOns(located, own.all);
  const project = projectOf(located, snapshot, muted, entities, own);
  return withQuietRedefinitions(located).map((diagnostic) => {
    const file = project.files.get(diagnostic.fileId);
    if (!isAdvisable(diagnostic) || file === undefined) return diagnostic;
    const causeLine = muted.get(diagnostic);
    if (causeLine !== undefined) {
      const headline = causeLine === diagnostic.line ? adviceText.followOnSameLine() : adviceText.followOn(causeLine);
      return { ...diagnostic, advice: { headline, followOnOf: causeLine } };
    }
    const advice = adviceFor(placeOf(diagnostic, file), project);
    return advice ? { ...diagnostic, advice } : diagnostic;
  });
}

/** GHDL's pair of warnings for a second architecture of one name in one file. */
const ARCHITECTURE_REDEFINED = /^architecture ".+" of ".+" defined at line \d+:\d+ is now architecture /;
const UNIT_REDEFINED = /^redefinition of a library unit in same design file/;

/**
 * GHDL's warnings about a second architecture of one name in one file, made
 * quiet (tooltip only): HDLBoard's own check at Start (duplicateArchitectures.ts)
 * already says it in plain words on the same line. The unit warning stays when
 * it is about something else, an entity declared twice.
 */
function withQuietRedefinitions(located: readonly LocatedDiagnostic[]): LocatedDiagnostic[] {
  const lineKey = (d: LocatedDiagnostic): string => `${d.fileId}:${d.line}`;
  const isArchitectureRedefined = (d: LocatedDiagnostic): boolean => ARCHITECTURE_REDEFINED.test(d.message);
  const isRedefinition = (d: LocatedDiagnostic): boolean => isArchitectureRedefined(d) || UNIT_REDEFINED.test(d.message);
  const linesWithRedefinedArchitecture = new Set(located.filter(isArchitectureRedefined).map(lineKey));
  const saidByHdlBoard = (d: LocatedDiagnostic): boolean => linesWithRedefinedArchitecture.has(lineKey(d)) && isRedefinition(d);
  return located.map((d) => (saidByHdlBoard(d) ? { ...d, quiet: true } : d));
}

type Advisor = (located: readonly LocatedDiagnostic[], snapshot: RunSnapshot) => AdvisedDiagnostic[];

const noAdvice: Advisor = (located) => [...located];

/**
 * Each file's messages go to its language's advisor, picked by the file's name
 * (docs/editor_diagnostics_verilog_research.md § 6): the parser still does not
 * know which tool ran, but the snapshot knows each file's language. Each advisor
 * sees only its own language's files. Keeps the input order.
 */
function byLanguage(
  located: readonly LocatedDiagnostic[],
  snapshot: RunSnapshot,
  advisors: { readonly verilog: Advisor; readonly other: Advisor },
): AdvisedDiagnostic[] {
  const isVerilogFile = (file: RunSnapshot['files'][number]): boolean => languageOfName(file.name) === 'verilog';
  const verilogIds = new Set(snapshot.files.filter(isVerilogFile).map((file) => file.id));
  const isVerilog = (diagnostic: LocatedDiagnostic): boolean => verilogIds.has(diagnostic.fileId);
  const verilogSnapshot = { files: snapshot.files.filter(isVerilogFile) };
  const otherSnapshot = { files: snapshot.files.filter((file) => !isVerilogFile(file)) };
  const verilog = advisors.verilog(located.filter(isVerilog), verilogSnapshot)[Symbol.iterator]();
  const other = advisors.other(located.filter((diagnostic) => !isVerilog(diagnostic)), otherSnapshot)[Symbol.iterator]();
  return located.map((diagnostic) => (isVerilog(diagnostic) ? verilog : other).next().value as AdvisedDiagnostic);
}

/**
 * Advice for the body of an ERROR frame — compiler output: Icarus's rules for
 * Verilog files, GHDL's for every other file, exactly as before Verilog had any.
 */
export function adviseDiagnostics(located: readonly LocatedDiagnostic[], snapshot: RunSnapshot): AdvisedDiagnostic[] {
  return byLanguage(located, snapshot, { verilog: adviseIcarusDiagnostics, other: adviseGhdlDiagnostics });
}

/**
 * Advice for LOG lines: none, except Icarus's warning about an implicit wire,
 * which a successful Verilog compile prints there (research § 3, Rule G).
 */
export function adviseLogDiagnostics(located: readonly LocatedDiagnostic[], snapshot: RunSnapshot): AdvisedDiagnostic[] {
  return byLanguage(located, snapshot, { verilog: adviseIcarusLog, other: noAdvice });
}

/**
 * Where to take the student after a failed compile: the first error as before
 * (muted follow-ons never lead), or the line Rules D and E name when it is close
 * enough that both stay in view (§ 4.10).
 */
export function revealTarget(advised: readonly AdvisedDiagnostic[]): RevealTarget | undefined {
  const target = firstRevealTarget(advised.filter((d) => !isMuted(d)));
  if (target === undefined) return undefined;
  const related = target.advice?.relatedLine;
  const bothInView = related !== undefined && Math.abs(target.line - related) <= REVEAL_RELATED_WITHIN_LINES;
  if (bothInView) return { fileId: target.fileId, line: related };
  const index = target.advice?.span?.start;
  return { fileId: target.fileId, line: target.line, ...(index !== undefined && { index }) };
}

/** A line to show, and on it the underlined word (0-based), which may be past the right edge of the editor. */
export interface RevealTarget extends Pick<LocatedDiagnostic, 'fileId' | 'line'> {
  readonly index?: number;
}
