// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Verilog constructs that only work in simulation (docs/impl_sim_only_warnings.md
 * § 3.1). An `initial` block without `#` or `@` is a power-up value or ROM content
 * and is never matched (§ 3.3). Pure.
 */

import { ruleById, type UnitText } from '../tbDetect/rules';
import { inside, linesOf } from './constructText';
import { construct, fromRule, type SimOnlyConstruct } from './constructs';
import { verilogEdgeTemplate, verilogLevelStorage } from './verilogRegisters';

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
  fromRule('vlog-delay', 'never'),
  construct('vlog-event-wait', 'never', eventWaits),
  fromRule('vlog-clock-gen', 'never'),
  fromRule('vlog-file-io', 'never'),
  fromRule('vlog-end-sim', 'never'),
  construct('vlog-time', 'never', (t) => linesOf(t, /\$(?:time|stime|realtime)\b/g)),
  construct('vlog-random', 'never', (t) => linesOf(t, /\$(?:random|urandom|urandom_range)\b/g)),
  construct('vlog-verification', 'never', (t) => [...ruleById('vlog-sv-verif').find(t), ...linesOf(t, VERIFICATION)]),
  construct('vlog-real', 'never', realVariables),
  construct('vlog-edge-template', 'never', verilogEdgeTemplate),
  construct('vlog-level-storage', 'ignored', verilogLevelStorage),
  fromRule('vlog-assign-delay', 'ignored'),
  fromRule('vlog-display', 'quiet'),
];

