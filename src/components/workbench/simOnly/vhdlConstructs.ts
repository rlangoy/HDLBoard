// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The VHDL constructs that only work in simulation (docs/impl_sim_only_warnings.md
 * § 3.1), with the exceptions of § 3.3. Each matches *operations*, never a bare
 * import (S10). Pure.
 */

import type { UnitText } from '../tbDetect/rules';
import { blockAt, linesOf, matchesIn, statementFrom } from './constructText';
import { construct, fromRule, type SimOnlyConstruct } from './constructs';
import { vhdlEdgeTemplate } from './vhdlRegisters';
import { isHidden } from './scan';

const WAIT_UNTIL = /\bwait\s+(?:until|on)\b/gi;
const ANY_WAIT = /\bwait\b/gi;
/** `rising_edge(`, `falling_edge(` or `'event`; character literals are blanked (`clk = '1'` reads `clk =    `). */
const CLOCK_EDGE = /\b(?:rising_edge|falling_edge)\s*\(|'\s*event\b/i;
/** A whole operand that is one clock edge: `rising_edge(clk)`, `falling_edge(k(0))`, `clk'event`. */
const EDGE_OPERAND = /^(?:(?:rising_edge|falling_edge)\s*\((?:[^()]|\([^()]*\))*\)|[A-Za-z]\w*(?:\.\w+)*(?:\s*\([^()]*\))?\s*'\s*event)$/i;
/** Outside parentheses, what would wake the process at other times too: a timeout, an `or` condition, a sensitivity clause. */
const OTHER_WAKE_UP = /\b(?:for|or|on)\b/i;

/** The text with what is inside parentheses blanked: only the top level of the expression is left. */
function topLevel(text: string): string {
  let depth = 0;
  return [...text].map((ch) => {
    if (ch === '(') depth++;
    const shown = depth === 0 ? ch : ' ';
    if (ch === ')') depth--;
    return shown;
  }).join('');
}

/** Without the parentheses around the whole of it: `((a))` is `a`. */
function unwrapped(text: string): string {
  const t = text.trim();
  return t.startsWith('(') && closingParenthesis(t) === t.length - 1 ? unwrapped(t.slice(1, -1)) : t;
}

/** The offset of the `)` that closes the `(` at offset 0. */
function closingParenthesis(text: string): number {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    depth += text[i] === '(' ? 1 : text[i] === ')' ? -1 : 0;
    if (depth === 0) return i;
  }
  return -1;
}

/** The operands of the top-level `and`s of a condition. */
function conjuncts(condition: string): string[] {
  const top = topLevel(condition);
  const cuts = [...top.matchAll(/\band\b/gi)].map((m) => m.index ?? 0);
  const starts = [0, ...cuts.map((c) => c + 'and'.length)];
  return starts.map((s, i) => unwrapped(condition.slice(s, cuts[i] ?? condition.length)));
}

/**
 * A wait a synthesis tool takes as a clock: `wait until` one clock edge, as an operand of
 * the condition's top-level `and`s (in parentheses or not), the other operands a level
 * enable: `wait until rising_edge(clk) and (a = '1' or b = '1')`, `wait until clk'event and
 * clk = '1'`. Not with `for`, `or` or `on` at the top level, and not `not rising_edge(clk)`:
 * those resume the process at other times too.
 */
function isClockEdgeWait(statement: string): boolean {
  const until = /^wait\s+until\b/i.exec(statement.trim());
  if (!until) return false;
  const condition = unwrapped(statement.trim().slice(until[0].length));
  if (OTHER_WAKE_UP.test(topLevel(condition))) return false;
  const operands = conjuncts(condition);
  const edges = operands.filter((o) => EDGE_OPERAND.test(o));
  return edges.length === 1 && operands.every((o) => EDGE_OPERAND.test(o) || !CLOCK_EDGE.test(o));
}

/** How many waits each process has that synthesis sees (not inside translate_off); counted once per unit. */
function synthesizedWaitsPerBlock(t: UnitText): Map<number, number> {
  const counts = new Map<number, number>();
  for (const [at] of matchesIn(t, ANY_WAIT)) {
    const block = blockAt(t, at);
    if (block && !isHidden(t.lineOf(at), t.simOnlyRegions)) counts.set(block.from, (counts.get(block.from) ?? 0) + 1);
  }
  return counts;
}

/**
 * `wait until rising_edge(clk);` as the only wait of its process: a clocked process
 * (§ 3.3), an enable joined by `and` included. Waits inside translate_off are not
 * synthesized, so they don't count; `rising_edge(a) or rising_edge(b)`, a timeout or an
 * `or` condition wakes the process at other times too.
 */
function waitUntilLines(t: UnitText): number[] {
  const waits = synthesizedWaitsPerBlock(t);
  const isClockedProcess = (at: number) => {
    const block = blockAt(t, at);
    return block !== undefined && waits.get(block.from) === 1 && isClockEdgeWait(statementFrom(t, at));
  };
  return linesOf(t, WAIT_UNTIL, (at) => !isClockedProcess(at));
}

const FILE_DECLARATION = /\bfile\s+\w+(?:\s*,\s*\w+)*\s*:/gi;
const LINE_VARIABLE = /\bvariable\s+\w+(?:\s*,\s*\w+)*\s*:\s*line\b/gi;
const FILE_CALL = /\b(?:readline|writeline|file_open|file_close|endfile)\s*\(/gi;

const fileOperations = (t: UnitText): number[] => [FILE_DECLARATION, LINE_VARIABLE, FILE_CALL].flatMap((p) => linesOf(t, p));

const ENV_CALL = /\bstd\.env\.(?:stop|finish)\b/gi;
const USES_ENV = /\buse\s+std\.env\b/i;
const BARE_END_CALL = /(?:^|;|\bbegin\b|\bthen\b|\belse\b)\s*(stop|finish)\s*[;(]/gim;

/** `std.env.finish`, or `finish;` once `std.env` is used; never the `use` clause alone (S10). */
function endOfSimulation(t: UnitText): number[] {
  const qualified = linesOf(t, ENV_CALL);
  if (!USES_ENV.test(t.code)) return qualified;
  // The match may start at the `;` that ends the line before: the call's line is that of the match's end.
  const bare = matchesIn(t, BARE_END_CALL).map(([at, m]) => t.lineOf(at + m[0].length - 1));
  return [...qualified, ...bare];
}

const PROTECTED_TYPE = /\btype\s+(\w+)\s+is\s+protected\b/gi;
const SHARED_VARIABLE = /\bshared\s+variable\s+\w+\s*:\s*(\w+)/gi;

/** A protected type, and every shared variable of one; a shared variable of an array type is a RAM (§ 3.3). */
function protectedTypes(t: UnitText): number[] {
  const declared = linesOf(t, PROTECTED_TYPE);
  const names = new Set([...t.code.matchAll(PROTECTED_TYPE)].map((m) => m[1].toLowerCase()));
  const shared = linesOf(t, SHARED_VARIABLE, (_at, m) => names.has(m[1].toLowerCase()));
  return [...declared, ...shared];
}

const REAL_SIGNAL = /\bsignal\s+\w+(?:\s*,\s*\w+)*\s*:\s*real\b/gi;
const REAL_PORT = /:\s*(?:in|out|inout|buffer)\s+real\b/gi;

export const VHDL_CONSTRUCTS: readonly SimOnlyConstruct[] = [
  fromRule('vhdl-wait-for', 'never'),
  fromRule('vhdl-wait-forever', 'never'),
  construct('vhdl-wait-until', 'never', waitUntilLines),
  fromRule('vhdl-clock-gen', 'never'),
  construct('vhdl-file-io', 'never', fileOperations),
  construct('vhdl-end-sim', 'never', endOfSimulation),
  construct('vhdl-now', 'never', (t) => linesOf(t, /\bnow\b/gi)),
  construct('vhdl-access', 'never', (t) => linesOf(t, /\baccess\b|\bnew\b|\bdeallocate\s*\(/gi)),
  construct('vhdl-protected', 'never', protectedTypes),
  construct('vhdl-random', 'never', (t) => linesOf(t, /\buniform\s*\(/gi)),
  construct('vhdl-real-signal', 'never', (t) => [...linesOf(t, REAL_SIGNAL), ...linesOf(t, REAL_PORT)]),
  construct('vhdl-edge-template', 'never', vhdlEdgeTemplate),
  fromRule('vhdl-after', 'ignored'),
  fromRule('vhdl-assert', 'quiet', 'vhdl-report'),
];
