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
import { vhdlEdgeTemplate } from './registerTemplates';
import { isHidden } from './scan';

const WAIT_UNTIL = /\bwait\s+(?:until|on)\b/gi;
const ANY_WAIT = /\bwait\b/gi;
/** Character literals are blanked, so `clk'event and clk = '1'` reads `clk'event and clk =    `. */
const CLOCK_EDGE = /\b(?:rising_edge|falling_edge)\s*\(|'\s*event\b/gi;

/**
 * `wait until rising_edge(clk);` as the only wait of its process, on one clock edge: a
 * clocked process (§ 3.3). Waits inside translate_off are not synthesized, so they don't
 * count; `rising_edge(a) or rising_edge(b)` is two clocks.
 */
function isOnlyClockEdgeWait(t: UnitText, at: number): boolean {
  const block = blockAt(t, at);
  if (!block) return false;
  const synthesized = (wait: number) => wait >= block.from && wait < block.to && !isHidden(t.lineOf(wait), t.simOnlyRegions);
  const waits = matchesIn(t, ANY_WAIT).filter(([wait]) => synthesized(wait)).length;
  const edges = statementFrom(t, at).match(CLOCK_EDGE)?.length ?? 0;
  return waits === 1 && edges === 1;
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
  construct('vhdl-wait-until', 'never', (t) => linesOf(t, WAIT_UNTIL, (at) => !isOnlyClockEdgeWait(t, at))),
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
