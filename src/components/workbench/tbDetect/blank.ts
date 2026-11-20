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
}

const TRANSLATE = /^(?:--|\/\/)\s*(?:pragma|synthesis|synopsys)\s+translate_(off|on)\b/i;

/**
 * `simulation` evaluates `ifdef as the simulator does (SYNTHESIS undefined); `synthesis` as
 * a synthesis tool does, with SYNTHESIS defined: the design check reads that view.
 */
export type SourceView = 'simulation' | 'synthesis';

export function blankSource(language: Language, source: string, view: SourceView = 'simulation'): BlankedSource {
  const lineOf = lineIndex(source);
  const pragmas = new PragmaRegions(lineOf);
  const chars = source.split('');
  if (language === 'vhdl') lexVhdl(source, chars, pragmas, view);
  else lexVerilog(source, chars, pragmas);
  pragmas.close(lineOf(source.length));
  if (language === 'vhdl') return { code: chars.join(''), simOnlyRegions: pragmas.regions };
  const pre = preprocessVerilog(chars.join(''), lineOf, view === 'synthesis' ? ['SYNTHESIS'] : []);
  return { code: pre.code, simOnlyRegions: [...pragmas.regions, ...pre.regions].sort((a, b) => a.start - b.start) };
}

/** translate_off .. translate_on, from the line comments that carry them. */
class PragmaRegions {
  readonly regions: LineSpan[] = [];
  private openAt: number | undefined;
  constructor(private readonly lineOf: LineOf) {}

  comment(text: string, offset: number): void {
    const found = TRANSLATE.exec(text);
    if (!found) return;
    const line = this.lineOf(offset);
    if (found[1].toLowerCase() === 'off') this.openAt ??= line;
    else this.close(line);
  }

  close(line: number): void {
    if (this.openAt === undefined) return;
    this.regions.push({ start: this.openAt, end: line });
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

function lexVerilog(src: string, chars: string[], pragmas: PragmaRegions): void {
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') i = lineComment(src, chars, pragmas, i);
    else if (c === '/' && src[i + 1] === '*') i = blockComment(src, chars, i);
    else if (c === '"') i = verilogString(src, chars, i);
    else if (c === '(' && src[i + 1] === '*' && src[i + 2] !== ')') i = attribute(src, chars, i);
    else i++;
  }
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

/** `(* full_case *)`; `@(*)` never gets here. */
function attribute(src: string, chars: string[], i: number): number {
  const end = src.indexOf('*)', i + 2);
  return blanked(chars, i, end < 0 ? src.length : end + 2);
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

const DIRECTIVE = /`(?:(define|undef|ifdef|ifndef|elsif)\b[ \t]*(\w*)|(else|endif)\b)/g;

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
}

/**
 * Evaluates `ifdef/`ifndef/`elsif/`else/`endif against the file's own `define`s
 * (an unknown macro is undefined, as with iverilog without -D) and blanks the
 * inactive branches. An active `ifndef SYNTHESIS branch is a sim-only region.
 */
function preprocessVerilog(code: string, lineOf: LineOf, predefined: readonly string[]): { code: string; regions: LineSpan[] } {
  const chars = code.split('');
  const state = { defines: new Set<string>(predefined), stack: [] as Branch[], regions: [] as LineSpan[] };
  let activeFrom = 0;
  for (const match of code.matchAll(DIRECTIVE)) {
    const at = match.index ?? 0;
    const wasActive = isActive(state.stack);
    if (!wasActive) blankRange(chars, activeFrom, at);
    directive(state, match[1] ?? match[3], match[2], lineOf(at), wasActive);
    // The directive itself is no code: left in, `ifndef X would start the next statement (and hide an instance in it).
    blankRange(chars, at, at + match[0].length);
    if (match[1] === 'define' && wasActive) blankRange(chars, at + match[0].length, endOfLine(code, at));
    activeFrom = at + match[0].length;
  }
  if (!isActive(state.stack)) blankRange(chars, activeFrom, code.length);
  return { code: chars.join(''), regions: state.regions };
}

const isActive = (stack: readonly Branch[]): boolean => stack.length === 0 || stack[stack.length - 1].active;

interface PreState {
  readonly defines: Set<string>;
  readonly stack: Branch[];
  readonly regions: LineSpan[];
}

function directive(state: PreState, word: string, name: string, line: number, active: boolean): void {
  const top = state.stack[state.stack.length - 1];
  if (word === 'define' && active) state.defines.add(name);
  else if (word === 'undef' && active) state.defines.delete(name);
  else if (word === 'ifdef' || word === 'ifndef') openBranch(state, word, name, line, active);
  else if (top && (word === 'elsif' || word === 'else' || word === 'endif')) {
    closeSimOnly(state, top, line);
    if (word === 'endif') state.stack.pop();
    else {
      nextBranch(top, word === 'else' || state.defines.has(name));
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
  state.stack.push({ parentActive, active, taken: holds, simOnlyFrom: simOnly ? line : undefined, laterBranchesSimOnly });
}

function nextBranch(top: Branch, holds: boolean): void {
  top.active = top.parentActive && !top.taken && holds;
  top.taken ||= holds;
}

function closeSimOnly(state: PreState, top: Branch, line: number): void {
  if (top.simOnlyFrom === undefined) return;
  state.regions.push({ start: top.simOnlyFrom, end: line });
  top.simOnlyFrom = undefined;
}
