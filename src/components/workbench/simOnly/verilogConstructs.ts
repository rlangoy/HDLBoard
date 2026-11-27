// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Verilog constructs that only work in simulation (docs/impl_sim_only_warnings.md
 * § 3.1). An `initial` block without `#` or `@` is a power-up value or ROM content
 * and is never matched (§ 3.3). Pure.
 */

import { ruleById, type UnitText } from '../tbDetect/rules';
import { closingBracket } from './brackets';
import { inside, linesOf, matchesIn, type Range } from './constructText';
import { construct, fromRule, type SimOnlyConstruct } from './constructs';
import { edgeTriggeredBlocks, verilogEdgeTemplate, verilogLevelStorage } from './verilogRegisters';

/** A `#` delay, as the detector's `vlog-delay` rule matches it. */
const DELAY = /##?\s*[\d(A-Za-z_`$]/g;
/** `q <= #1 d;`: a delay inside a non-blocking assignment, at its `#`. */
const NONBLOCKING_DELAY = /<=\s*(?=##?\s*[\d(A-Za-z_`$])/g;

/** The offsets of the `#` of each `q <= #1 d;` in an edge-triggered block: synthesis drops it, and the register still changes at the edge. */
function clockedDelays(t: UnitText): number[] {
  const clocked = edgeTriggeredBlocks(t);
  return matchesIn(t, NONBLOCKING_DELAY).map(([at, m]) => at + m[0].length).filter((at) => inside(at, clocked));
}

/**
 * `#` delays that only work in simulation (`#10 q = 1;`, `x = #5 y;` in a combinational
 * block). A line whose delays are all `q <= #1 d` in a clocked block is the quiet
 * `vlog-clocked-delay` instead (§ 3.3).
 */
function delays(t: UnitText): number[] {
  const isQuiet = new Set(clockedDelays(t));
  // Only a delay in an always or initial block, as the rule reads them: a module header's `#(` on the same line is none.
  const blocks = t.unit.blocks.filter((b) => b.kind === 'always' || b.kind === 'initial');
  const loudLines = new Set(matchesIn(t, DELAY).filter(([at]) => !isQuiet.has(at) && inside(at, blocks)).map(([at]) => t.lineOf(at)));
  return ruleById('vlog-delay').find(t).filter((line) => loudLines.has(line));
}

/** `$display(…)`, `$write(…)`, `$monitor(…)`, `$strobe(…)`: what they print. */
// Not the end of a name: `$` is a Verilog name character (`log$display` is a function of the design).
const PRINT_CALL = /(?<![\w$])\$(?:display|write|monitor|strobe)[bho]?\s*\(/g;
const TIME = /\$(?:time|stime|realtime)\b/g;

/** `$time` used by the design (`if ($time > 0)`); printed by `$display` or `$write` it is console output, which synthesis skips. */
function timeReads(t: UnitText): number[] {
  const printed: Range[] = matchesIn(t, PRINT_CALL).map(([at, m]) => {
    const open = at + m[0].length - 1;
    const close = closingBracket(t.code, open - t.base);
    return { from: open, to: close < 0 ? t.base + t.code.length : t.base + close };
  });
  return linesOf(t, TIME, (at) => !inside(at, printed));
}

/** `@(posedge clk);`, `@e;`, `wait (x);` as statements: not an `always @(…)` sensitivity, which is followed by code. */
const EVENT_WAIT = /@\s*(?:\((?:[^()]|\([^()]*\))*\)|\*|\w+)\s*;|\bwait\s*\(/g;

function eventWaits(t: UnitText): number[] {
  const blocks = t.unit.blocks.filter((b) => b.kind === 'initial' || b.kind === 'always');
  return linesOf(t, EVENT_WAIT, (at) => inside(at, blocks));
}

const VERIFICATION = /\b(?:force|release|fork|join|join_any|join_none)\b|\bevent\s+[A-Za-z_]/g;
const REAL = /\b(?:real|realtime)\s+[A-Za-z_]/g;
/** `parameter real X = …` is computed once by synthesis (§ 3.3). */
const PARAMETER_BEFORE = /\b(?:parameter|localparam)\s*$/;
/** How far back from `real` to look for `parameter`. */
const PARAMETER_LOOKBEHIND = 16;

function realVariables(t: UnitText): number[] {
  const before = (at: number) => t.code.slice(Math.max(0, at - t.base - PARAMETER_LOOKBEHIND), at - t.base);
  return linesOf(t, REAL, (at) => !PARAMETER_BEFORE.test(before(at)));
}

export const VERILOG_CONSTRUCTS: readonly SimOnlyConstruct[] = [
  construct('vlog-delay', 'never', delays),
  construct('vlog-event-wait', 'never', eventWaits),
  fromRule('vlog-clock-gen', 'never'),
  fromRule('vlog-file-io', 'never'),
  fromRule('vlog-end-sim', 'never'),
  construct('vlog-time', 'never', timeReads),
  construct('vlog-random', 'never', (t) => linesOf(t, /\$(?:random|urandom|urandom_range)\b/g)),
  construct('vlog-verification', 'never', (t) => [...ruleById('vlog-sv-verif').find(t), ...linesOf(t, VERIFICATION)]),
  construct('vlog-real', 'never', realVariables),
  construct('vlog-edge-template', 'never', verilogEdgeTemplate),
  construct('vlog-level-storage', 'ignored', verilogLevelStorage),
  fromRule('vlog-assign-delay', 'ignored'),
  fromRule('vlog-display', 'quiet'),
  construct('vlog-clocked-delay', 'quiet', (t) => clockedDelays(t).map((at) => t.lineOf(at))),
];

