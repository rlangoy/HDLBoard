// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The detector's blanking lexer (docs/impl_split_screen.md § 5.2). Comments,
 * strings, attributes and inactive `ifdef branches become spaces, newlines stay,
 * so the output has the source's length and every offset and line in it is the
 * source's own (the technique of server/src/engines/vhdlPorts.ts, extended).
 * The highlighter's tokens are not reused: it does not know VHDL-2008 block
 * comments and its tick rule can swallow `clk'event … '1'`. Pure.
 */

import { blankRange, endOfLine, lineIndex, type LineOf } from './lines';
import type { Language, LineSpan } from './types';

export interface BlankedSource {
  /** Same length as the source; non-code characters are spaces, newlines kept. */
  readonly code: string;
  /** Lines (1-based) of translate_off..translate_on and `ifndef SYNTHESIS regions. */
  readonly simOnlyRegions: readonly LineSpan[];
  /** Verilog: the `full_case` marks in code the view keeps. */
  readonly fullCase: FullCaseMarks;
  /** Verilog: every `` `define `` of the file, in order, each marked active or not in this view. */
  readonly defines: readonly MacroDefinition[];
  /**
   * Verilog: the code synthesis may read, comments and strings blanked: every `ifdef branch
   * kept, the directives too, but those surely left out (on a macro the file defines) and
   * translate_off regions. A branch on a macro the file does not define may be taken if an
   * included file defines it, one on SYNTHESIS by Quartus; the search for parameter
   * overrides reads them too.
   */
  readonly everyBranch: string;
}

/** `` `define NAME text ``: its name, and its text as the view reads it (comments blanked; a `(args)` list and `\`-continued lines included). */
export interface MacroDefinition {
  readonly name: string;
  readonly text: string;
  /** Where the directive is, its continued lines included: its text is no code. */
  readonly from: number;
  readonly to: number;
  /**
   * In code the view keeps. One in a branch it leaves out may still be the one synthesis
   * reads: the branch may test a macro an included file defines.
   */
  readonly active: boolean;
  /** A function-like macro's formal parameters (`` `define INST(M) ``); none for another. */
  readonly params: readonly string[];
}

/**
 * Where `full_case` marks start. Synthesis takes the `case` one marks as naming every
 * value: a directive comment after its selector (`case (s) // synopsys full_case`), or an
 * attribute right before it (`(* full_case *) case (s)`).
 */
export interface FullCaseMarks {
  readonly directives: readonly number[];
  readonly attributes: readonly number[];
}

export const NO_FULL_CASE: FullCaseMarks = { directives: [], attributes: [] };

/**
 * A translate_off or translate_on comment. VHDL's, like the language, in any case
 * (`-- SYNTHESIS TRANSLATE_OFF`); Verilog's only lowercase: Quartus 25.1 Lite builds what
 * `// SYNTHESIS TRANSLATE_OFF` or `// synthesis TRANSLATE_OFF` encloses (measured 2026-11-27).
 */
const TRANSLATE: Readonly<Record<Language, RegExp>> = {
  vhdl: /^--\s*(?:pragma|synthesis|synopsys)\s+translate_(off|on)\b/i,
  verilog: /^\/\/\s*(?:pragma|synthesis|synopsys)\s+translate_(off|on)\b/,
};

/**
 * `simulation` evaluates `ifdef as the simulator does (SYNTHESIS undefined); `synthesis` as
 * a synthesis tool does, with SYNTHESIS defined: the design check reads that view.
 */
export type SourceView = 'simulation' | 'synthesis';

export function blankSource(language: Language, source: string, view: SourceView = 'simulation'): BlankedSource {
  const lineOf = lineIndex(source);
  const pragmas = new PragmaRegions(lineOf, source, TRANSLATE[language]);
  const chars = source.split('');
  if (language === 'vhdl') {
    lexVhdl(source, chars, pragmas, view);
    pragmas.close(lineOf(source.length), source.length);
    return { code: chars.join(''), simOnlyRegions: pragmas.regions, fullCase: NO_FULL_CASE, defines: [], everyBranch: '' };
  }
  const marks = lexVerilog(source, chars, pragmas);
  pragmas.close(lineOf(source.length), source.length);
  const lexed = chars.join('');
  const pre = preprocessVerilog(lexed, lineOf, view === 'synthesis' ? ['SYNTHESIS'] : [], pragmas.offsets);
  const everyBranch = possibleCode(lexed, pre, pragmas.offsets);
  // A mark in an `ifdef branch the view leaves out, inside translate_off, or in a macro's text marks nothing.
  const hidden = (at: number) => pragmas.regions.some((r) => lineOf(at) >= r.start && lineOf(at) <= r.end);
  const inMacro = (at: number) => pre.defines.some((d) => at >= d.from && at < d.to);
  const active = (at: number) => !pre.inactive.some((r) => at >= r.from && at < r.to) && !hidden(at) && !inMacro(at);
  const fullCase = { directives: marks.directives.filter(active), attributes: marks.attributes.filter(active) };
  const simOnlyRegions = [...pragmas.regions, ...pre.regions].sort((a, b) => a.start - b.start);
  return { code: pre.code, simOnlyRegions, fullCase, defines: pre.defines, everyBranch };
}

/** A conditional directive with the name it tests: `` `ifdef X ``, `` `else ``, `` `endif ``. */
const CONDITIONAL_DIRECTIVE = /`(?:(?:ifdef|ifndef|elsif|undef)\b[ \t]*\w*|(?:else|endif)\b)/g;

/**
 * The code synthesis may read: every `ifdef branch kept but those surely left out (on a
 * macro the file itself defines), and no translate_off region, from its comment to the
 * translate_on one. A branch that tests a macro the file does not define stays, an included
 * file may define it; so does one on SYNTHESIS, which Quartus does not define. The
 * conditional directives themselves are blanked: `` child `ifndef X #(.R(1)) `endif u ``
 * reads as `child #(.R(1)) u`.
 */
function possibleCode(lexed: string, pre: Pick<Preprocessed, 'inactive' | 'unsure'>, translateOff: readonly Range[]): string {
  const chars = lexed.split('');
  for (const r of pre.inactive) if (r.surely) blankRange(chars, r.from, r.to);
  // A translate_off in a branch that may be left out (the view's, or one on SYNTHESIS it reads) may be no pragma at all.
  const mayBeLeftOut = (at: number) => [...pre.inactive, ...pre.unsure].some((r) => at >= r.from && at < r.to);
  for (const r of translateOff) if (!mayBeLeftOut(r.from)) blankRange(chars, r.from, r.to);
  for (const m of lexed.matchAll(CONDITIONAL_DIRECTIVE)) blankRange(chars, m.index ?? 0, (m.index ?? 0) + m[0].length);
  return chars.join('');
}

/** translate_off .. translate_on, from the line comments that carry them. */
class PragmaRegions {
  readonly regions: LineSpan[] = [];
  /** The same regions by offset: from the translate_off comment to the translate_on one (code before it on its line is read). */
  readonly offsets: Range[] = [];
  private openAt: number | undefined;
  private openOffset = 0;
  constructor(
    private readonly lineOf: LineOf,
    private readonly source: string,
    private readonly translate: RegExp,
  ) {}

  comment(text: string, offset: number): void {
    const found = this.translate.exec(text);
    if (!found) return;
    const line = this.lineOf(offset);
    if (found[1].toLowerCase() === 'off') {
      if (this.openAt !== undefined) return;
      this.openOffset = offset;
      // `LEDR <= load(sw); -- synthesis translate_off`: the code before the comment is built, the region starts on the next line.
      const lineStart = this.source.lastIndexOf('\n', offset - 1) + 1;
      this.openAt = this.source.slice(lineStart, offset).trim() === '' ? line : line + 1;
    } else this.close(line, offset);
  }

  close(line: number, offset: number): void {
    if (this.openAt === undefined) return;
    if (this.openAt <= line) this.regions.push({ start: this.openAt, end: line });
    this.offsets.push({ from: this.openOffset, to: offset });
    this.openAt = undefined;
  }
}

/* ------------------------------- VHDL ------------------------------- */

function lexVhdl(src: string, chars: string[], pragmas: PragmaRegions, view: SourceView): void {
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '-' && src[i + 1] === '-') i = lineComment(src, chars, pragmas, i);
    else if (c === '/' && src[i + 1] === '*') i = blockComment(src, chars, i);
    else if (c === '"') i = vhdlString(src, chars, i);
    // Synthesis reads clock levels (`clk = '1'`) and constant bits, so '0' and '1' stay code there.
    else if (view === 'synthesis' && isBitLiteral(src, i)) i += 3;
    else if (c === "'" && isCharacterLiteral(src, i)) i = blanked(chars, i, i + 3);
    else i++;
  }
}

/** `'0'` or `'1'`. */
function isBitLiteral(src: string, i: number): boolean {
  return src[i] === "'" && (src[i + 1] === '0' || src[i + 1] === '1') && src[i + 2] === "'";
}

/** `'1'` is a character literal; `clk'event` and `unsigned'(…)` are ticks and stay code. */
function isCharacterLiteral(src: string, i: number): boolean {
  if (src[i + 2] !== "'") return false;
  let p = i - 1;
  while (p >= 0 && /[ \t\r\n]/.test(src[p])) p--;
  return p < 0 || !/[A-Za-z0-9_)\]]/.test(src[p]);
}

/** A VHDL string, `""` being an escaped quote; an unterminated one ends at the line. */
function vhdlString(src: string, chars: string[], i: number): number {
  let j = i + 1;
  while (j < src.length && src[j] !== '\n') {
    if (src[j] === '"' && src[j + 1] === '"') j += 2;
    else if (src[j] === '"') return blanked(chars, i, j + 1);
    else j++;
  }
  return blanked(chars, i, j);
}

/* ------------------------------ Verilog ----------------------------- */

/**
 * The words of a directive comment, `// synopsys parallel_case full_case` or
 * `/* synthesis full_case *\/`: the directive's own words, up to the first other character.
 */
const DIRECTIVE_COMMENT = /^(?:\/\/|\/\*)\s*(?:synopsys|synthesis|pragma)((?:[ \t]+[A-Za-z_]\w*)+)/;
/**
 * Verilog's directive comments are lowercase: Quartus 25.1 Lite infers the latch of
 * `// SYNOPSYS full_case` and of `// synopsys FULL_CASE` (Warning 10335, unrecognized),
 * honoring only `// synopsys full_case` (measured 2026-11-27).
 */
const isFullCaseComment = (comment: string): boolean =>
  (DIRECTIVE_COMMENT.exec(comment)?.[1].trim().split(/\s+/) ?? []).some((word) => word === 'full_case');
/**
 * Where a string or comment that starts at `i` ends, or undefined when none starts there.
 * A string ends at its closing quote (`\"` stays inside it) or with its line.
 */
function skipStringOrComment(text: string, i: number): number | undefined {
  if (text[i] === '/' && text[i + 1] === '*') {
    const end = text.indexOf('*/', i + 2);
    return end < 0 ? text.length : end + 2;
  }
  if (text[i] === '/' && text[i + 1] === '/') {
    const end = text.indexOf('\n', i);
    return end < 0 ? text.length : end;
  }
  if (text[i] !== '"') return undefined;
  let j = i + 1;
  while (j < text.length && text[j] !== '"' && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
  return text[j] === '"' ? j + 1 : j;
}

const BRACKET_DEPTH: Readonly<Record<string, number>> = { '(': 1, '[': 1, '{': 1, ')': -1, ']': -1, '}': -1 };

/**
 * An attribute's items: its commas at the top level, outside strings, comments and brackets.
 * `a, b = "x, y"`, `keep = {1'b0, c}` and `keep = 1 /*, d *\/` are each one item per name.
 */
function attributeItems(inside: string): string[] {
  const items: string[] = [];
  let [from, depth, i] = [0, 0, 0];
  while (i < inside.length) {
    const skipped = skipStringOrComment(inside, i);
    if (skipped !== undefined) {
      i = skipped;
      continue;
    }
    depth += BRACKET_DEPTH[inside[i]] ?? 0;
    if (inside[i] === ',' && depth === 0) {
      items.push(inside.slice(from, i));
      from = i + 1;
    }
    i++;
  }
  return [...items, inside.slice(from)];
}

/** An item's text without its comments: `/* x *\/ full_case` names `full_case`. */
const withoutComments = (item: string): string => item.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/**
 * `full_case` as an attribute's name, `(* parallel_case, full_case *)`, not inside a value,
 * an expression or a comment: `(* keep = "foo, full_case=bar" *)`,
 * `(* keep = {1'b0, full_case == 1'b1} *)`, `(* keep = 1 /*, full_case = foo *\/ *)`.
 */
const isFullCaseAttribute = (attribute: string): boolean =>
  // Attribute names are case-sensitive: Quartus reads `(* FULL_CASE *)` as an unknown attribute.
  attributeItems(attribute.slice(2, -2)).some((item) => /^\s*full_case\s*(?:=|$)/.test(withoutComments(item)));

/** Lexes Verilog; returns where its `full_case` marks start. */
function lexVerilog(src: string, chars: string[], pragmas: PragmaRegions): FullCaseMarks {
  const directives: number[] = [];
  const attributes: number[] = [];
  let i = 0;
  while (i < src.length) {
    const from = i;
    if (src[i] === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) {
      i = src[i + 1] === '/' ? lineComment(src, chars, pragmas, i) : blockComment(src, chars, i);
      if (isFullCaseComment(src.slice(from, i))) directives.push(from);
    } else if (src[i] === '(' && src[i + 1] === '*' && src[i + 2] !== ')') {
      i = attribute(src, chars, i);
      if (isFullCaseAttribute(src.slice(from, i))) attributes.push(from);
    } else i = src[i] === '"' ? verilogString(src, chars, i) : i + 1;
  }
  return { directives, attributes };
}

function verilogString(src: string, chars: string[], i: number): number {
  let j = i + 1;
  while (j < src.length && src[j] !== '\n') {
    if (src[j] === '\\') j += 2;
    else if (src[j] === '"') return blanked(chars, i, j + 1);
    else j++;
  }
  return blanked(chars, i, j);
}

/** `(* full_case *)`, up to the first `*)` outside its strings and comments (`(* keep = "a*)b" *)` is one); `@(*)` never gets here. */
function attribute(src: string, chars: string[], i: number): number {
  let j = i + 2;
  while (j < src.length) {
    const skipped = skipStringOrComment(src, j);
    if (skipped !== undefined) j = skipped;
    else if (src[j] === '*' && src[j + 1] === ')') return blanked(chars, i, j + 2);
    else j++;
  }
  return blanked(chars, i, src.length);
}

/* ------------------------------ Shared ------------------------------ */

function lineComment(src: string, chars: string[], pragmas: PragmaRegions, i: number): number {
  const end = endOfLine(src, i);
  pragmas.comment(src.slice(i, end), i);
  return blanked(chars, i, end);
}

function blockComment(src: string, chars: string[], i: number): number {
  const end = src.indexOf('*/', i + 2);
  return blanked(chars, i, end < 0 ? src.length : end + 2);
}

function blanked(chars: string[], from: number, to: number): number {
  blankRange(chars, from, to);
  return to;
}

/* -------------------- Verilog conditional compilation -------------------- */

const DIRECTIVE = /`(?:(define|undef|ifdef|ifndef|elsif)\b[ \t]*(\w*)|(else|endif)\b|(include)\b)/g;

interface Branch {
  readonly parentActive: boolean;
  active: boolean;
  taken: boolean;
  simOnlyFrom: number | undefined;
  /**
   * `ifdef SYNTHESIS with SYNTHESIS undefined, as in the simulator: the branches after
   * the first are what simulation runs and synthesis skips, so they are sim-only.
   */
  readonly laterBranchesSimOnly: boolean;
  /** The macros the chain has tested so far: `ifdef A … elsif B` is A and B. */
  readonly names: string[];
  /** The chain's first branch is surely taken (`ifdef LOCAL`, LOCAL surely defined): every later one is surely left out. */
  readonly surelyTaken: boolean;
}

/**
 * Whether the code the stack leaves out is surely left out: the first branch that leaves
 * it out tests only macros the file surely defines (see `PreState.sure`). One that tests an
 * undefined macro may be taken after all, if an included file defines it; one on SYNTHESIS
 * too, since Quartus does not define it (an `ifndef SYNTHESIS instance is built, measured
 * 2026-11-27).
 */
function surelyInactive(state: PreState): boolean {
  const deciding = state.stack.find((b) => !b.active);
  return deciding !== undefined && (deciding.surelyTaken || deciding.names.every((name) => state.sure.has(name)));
}

/** Whether every branch around is surely the one taken: each tests only macros the file surely defines. */
const surelyTaken = (state: PreState): boolean => state.stack.every((b) => b.names.every((name) => state.sure.has(name)));

/**
 * Notes what a `define or `undef does to the macros surely defined: one surely run makes its
 * macro sure or not; one that may run (in a branch an included file could select) leaves it
 * unsure. `USE_DEFAULT defined under `ifndef BOARD_CONFIG is not sure.
 */
function noteDefinition(state: PreState, word: string, name: string, active: boolean): void {
  if (word !== 'define' && word !== 'undef') return;
  if (active && word === 'define' && surelyTaken(state)) state.sure.add(name);
  else if (active || !surelyInactive(state)) state.sure.delete(name);
}

/**
 * Evaluates `ifdef/`ifndef/`elsif/`else/`endif against the file's own `define`s
 * (an unknown macro is undefined, as with iverilog without -D) and blanks the
 * inactive branches. An active `ifndef SYNTHESIS branch is a sim-only region.
 */
/**
 * Where a macro's text starts, `afterName` being just past its name: after its parameter
 * list when one follows the name directly (`` `define CELL(x) child ``), else right there
 * (`` `define P (a) `` is a text that starts with a parenthesis).
 */
function macroTextStart(code: string, afterName: number, end: number): number {
  if (code[afterName] !== '(') return afterName;
  const close = code.indexOf(')', afterName);
  return close < 0 || close >= end ? afterName : close + 1;
}

/** Where a `` `define `` at `at` ends: its line, and each line after one that ends with `\` (a continued macro text). */
function defineEnd(code: string, at: number): number {
  let end = endOfLine(code, at);
  while (end < code.length && /\\[ \t\r]*$/.test(code.slice(at, end))) end = endOfLine(code, end + 1);
  return end;
}

interface Preprocessed {
  readonly code: string;
  readonly regions: LineSpan[];
  readonly inactive: InactiveRange[];
  /** Code the view reads in a branch a tool may leave out (`` `ifdef SYNTHESIS ``, which Quartus does not define). */
  readonly unsure: Range[];
  readonly defines: MacroDefinition[];
}

function preprocessVerilog(code: string, lineOf: LineOf, predefined: readonly string[], translateOff: readonly Range[]): Preprocessed {
  const chars = code.split('');
  const state = { defines: new Set<string>(predefined), stack: [] as Branch[], regions: [] as LineSpan[], sure: new Set<string>() };
  const inactive: InactiveRange[] = [];
  const unsure: Range[] = [];
  const defines: MacroDefinition[] = [];
  let activeFrom = 0;
  // A directive in a macro's text runs where the macro is used, not here: `` `define SET `define OMIT `` defines SET only.
  let textEnd = 0;
  for (const match of code.matchAll(DIRECTIVE)) {
    const at = match.index ?? 0;
    if (at < textEnd) continue;
    const wasActive = isActive(state.stack);
    if (match[4] !== undefined) {
      // An included file may define or undefine any macro: none is sure after one that may be read. It stays code.
      if (wasActive || !surelyInactive(state)) state.sure.clear();
      continue;
    }
    if (!wasActive) {
      blankRange(chars, activeFrom, at);
      inactive.push({ from: activeFrom, to: at, surely: surelyInactive(state) });
    } else if (!surelyHeld(state)) unsure.push({ from: activeFrom, to: at });
    // A `define in translate_off may never run (Quartus skips it): it makes its macro unsure.
    const translated = translateOff.some((r) => at >= r.from && at < r.to);
    directive(state, match[1] ?? match[3], match[2], lineOf(at), { active: wasActive, translated });
    // The directive itself is no code: left in, `ifndef X would start the next statement (and hide an instance in it).
    blankRange(chars, at, at + match[0].length);
    if (match[1] === 'define') {
      const end = defineEnd(code, at);
      const afterName = at + match[0].length;
      const textStart = macroTextStart(code, afterName, end);
      const text = code.slice(textStart, end).replace(/\\[ \t\r]*\n/g, ' ');
      const params = textStart === afterName ? [] : code.slice(afterName + 1, textStart - 1).split(',').map((p) => p.trim().replace(/\s*=[\s\S]*$/, ''));
      defines.push({ name: match[2], text, params, from: at, to: end, active: wasActive });
      if (wasActive) blankRange(chars, at + match[0].length, end);
      textEnd = end;
    }
    activeFrom = at + match[0].length;
  }
  if (!isActive(state.stack)) {
    blankRange(chars, activeFrom, code.length);
    inactive.push({ from: activeFrom, to: code.length, surely: surelyInactive(state) });
  } else if (!surelyHeld(state)) unsure.push({ from: activeFrom, to: code.length });
  return { code: chars.join(''), regions: state.regions, inactive, unsure, defines };
}

/** Whether every branch around is surely the one a tool takes: none tests SYNTHESIS, or a macro an included file may change. */
const surelyHeld = (state: PreState): boolean => state.stack.every((b) => b.surelyTaken || b.names.every((name) => state.sure.has(name)));

/** Offsets `from` (included) to `to` (excluded). */
interface Range {
  readonly from: number;
  readonly to: number;
}

/** Code an `ifdef branch leaves out; `surely` when no included file can change that (`surelyInactive`). */
interface InactiveRange extends Range {
  readonly surely: boolean;
}

const isActive = (stack: readonly Branch[]): boolean => stack.length === 0 || stack[stack.length - 1].active;

interface PreState {
  readonly defines: Set<string>;
  readonly stack: Branch[];
  readonly regions: LineSpan[];
  /**
   * The macros the file surely defines: by a `define surely run, no `undef that may run since.
   * Not those the view defines itself (SYNTHESIS): a tool may not (Quartus does not).
   */
  readonly sure: Set<string>;
}

function directive(state: PreState, word: string, name: string, line: number, where: { readonly active: boolean; readonly translated: boolean }): void {
  const { active } = where;
  // In translate_off, a definition is one that may not run: its macro is unsure, never sure.
  noteDefinition(state, word, name, active && !where.translated);
  const top = state.stack[state.stack.length - 1];
  if (word === 'define' && active) state.defines.add(name);
  else if (word === 'undef' && active) state.defines.delete(name);
  else if (word === 'ifdef' || word === 'ifndef') openBranch(state, word, name, line, active);
  else if (top && (word === 'elsif' || word === 'else' || word === 'endif')) {
    closeSimOnly(state, top, line);
    if (word === 'endif') state.stack.pop();
    else {
      nextBranch(top, word === 'else' || state.defines.has(name), word === 'elsif' ? name : undefined);
      if (top.active && top.laterBranchesSimOnly) top.simOnlyFrom = line;
    }
  }
}

function openBranch(state: PreState, word: string, name: string, line: number, parentActive: boolean): void {
  const holds = state.defines.has(name) === (word === 'ifdef');
  const active = parentActive && holds;
  const isSynthesis = name === 'SYNTHESIS' && !state.defines.has(name);
  const simOnly = active && word === 'ifndef' && isSynthesis;
  const laterBranchesSimOnly = word === 'ifdef' && isSynthesis;
  const surelyTaken = word === 'ifdef' && holds && state.sure.has(name);
  state.stack.push({ parentActive, active, taken: holds, simOnlyFrom: simOnly ? line : undefined, laterBranchesSimOnly, names: [name], surelyTaken });
}

function nextBranch(top: Branch, holds: boolean, name: string | undefined): void {
  top.active = top.parentActive && !top.taken && holds;
  top.taken ||= holds;
  if (name) top.names.push(name);
}

function closeSimOnly(state: PreState, top: Branch, line: number): void {
  if (top.simOnlyFrom === undefined) return;
  state.regions.push({ start: top.simOnlyFrom, end: line });
  top.simOnlyFrom = undefined;
}
