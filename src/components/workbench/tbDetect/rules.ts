// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The detection rules (docs/impl_split_screen.md § 5.4), as data. Each runs on one
 * unit's blanked code — comments, strings and inactive regions are already spaces
 * — and returns the lines it matched. *Strong* rules match constructs that have no
 * meaning in synthesizable code; *weak* ones also turn up in RTL (D23). Pure.
 */

import { RULE_TEXT } from '../testbenchText';
import type { LineOf } from './lines';
import type { DesignUnit, Language, LineSpan, RuleId } from './types';

/** One unit's view of its file. */
export interface UnitText {
  readonly unit: DesignUnit;
  /** The unit's slice of the file's blanked code, gaps between its ranges blanked too. */
  readonly code: string;
  /** The offset of `code` in the file. */
  readonly base: number;
  /** Line of a file offset. */
  readonly lineOf: LineOf;
  readonly simOnlyRegions: readonly LineSpan[];
}

export interface DetectionRule {
  readonly id: RuleId;
  readonly weight: number;
  readonly strength: 'strong' | 'weak' | 'veto';
  /** Matches in one unit's blanked code; each match gives one evidence line. */
  readonly find: (unit: UnitText) => readonly number[];
  /** Why the rule's construct is simulation-only, from testbenchText.ts. */
  readonly explanation: string;
}

type Range = { readonly from: number; readonly to: number };

/** File offsets of every match of `pattern`, with the match. */
const matchesOf = (t: UnitText, pattern: RegExp): [number, RegExpMatchArray][] =>
  [...t.code.matchAll(pattern)].map((m) => [t.base + (m.index ?? 0), m]);

/** The lines of every match of `pattern`; `keep` may drop a match by its file offset. */
function linesOf(t: UnitText, pattern: RegExp, keep: (at: number) => boolean = () => true): number[] {
  return matchesOf(t, pattern).filter(([at]) => keep(at)).map(([at]) => t.lineOf(at));
}

const inside = (at: number, ranges: readonly Range[]): boolean => ranges.some((r) => at >= r.from && at < r.to);

const TB_NAME = /^(?:tb_|test_)|(?:_tb|_test|_testbench)$|^testbench$/i;

const portless = (t: UnitText): number[] => (t.unit.hasPorts ? [] : [t.unit.declLine]);
const tbName = (t: UnitText): number[] => (TB_NAME.test(t.unit.name) ? [t.unit.declLine] : []);
const drivesDut = (t: UnitText): number[] =>
  !t.unit.hasPorts && t.unit.instances.length > 0 ? [t.unit.instances[0].line] : [];
const boardPorts = (t: UnitText): number[] => (t.unit.boardPortLine === undefined ? [] : [t.unit.boardPortLine]);

/** A translate_off / `ifndef SYNTHESIS region inside the unit with code in it. */
function simOnly(t: UnitText): number[] {
  if (t.simOnlyRegions.length === 0) return [];
  const lines = t.code.split('\n');
  const first = t.lineOf(t.base);
  const { start, end } = t.unit.span;
  return t.simOnlyRegions
    .filter((r) => r.start >= start && r.end <= end + 1)
    .filter((r) => lines.slice(r.start + 1 - first, r.end - first).some((line) => line.trim() !== ''))
    .map((r) => r.start);
}

/* ------------------------------- VHDL ------------------------------- */

const VHDL_CLOCK_GEN = /\b(\w+)\s*<=\s*not\s+(\w+)\s+after\b/gi;

function vhdlClockGens(t: UnitText): Range[] {
  return matchesOf(t, VHDL_CLOCK_GEN)
    .filter(([, m]) => m[1].toLowerCase() === m[2].toLowerCase())
    .map(([at, m]) => ({ from: at, to: at + m[0].length }));
}

const VHDL_END_SIM = /\bstd\.env\.(?:stop|finish)\b|\buse\s+std\.env\b|(?:^|;|\bbegin\b|\bthen\b|\belse\b)\s*(?:stop|finish)\s*[;(]/gim;

function vhdlEndSim(t: UnitText): number[] {
  return matchesOf(t, VHDL_END_SIM).map(([at, m]) => t.lineOf(at + m[0].length - 1));
}

const VHDL_RULES: readonly DetectionRule[] = [
  rule('vhdl-portless', 25, 'weak', portless),
  rule('vhdl-wait-for', 30, 'strong', (t) => linesOf(t, /\bwait\s+for\b/gi)),
  rule('vhdl-wait-forever', 20, 'strong', (t) => linesOf(t, /\bwait\s*;/gi)),
  rule('vhdl-clock-gen', 25, 'strong', (t) => vhdlClockGens(t).map((r) => t.lineOf(r.from))),
  rule('vhdl-after', 10, 'weak', (t) => {
    const clocks = vhdlClockGens(t);
    return linesOf(t, /\bafter\b/gi, (at) => !inside(at, clocks));
  }),
  rule('vhdl-wait-until', 10, 'weak', (t) => linesOf(t, /\bwait\s+(?:until|on)\b/gi)),
  rule('vhdl-file-io', 25, 'weak', (t) => linesOf(t, /\bstd\.textio\b|\bstd_logic_textio\b|\bfile\s+\w+(?:\s*,\s*\w+)*\s*:/gi)),
  rule('vhdl-end-sim', 30, 'strong', vhdlEndSim),
  rule('vhdl-drives-dut', 20, 'strong', drivesDut),
  rule('vhdl-assert', 5, 'weak', (t) => linesOf(t, /\b(?:assert|report)\b/gi)),
  rule('vhdl-tb-name', 15, 'weak', tbName),
  rule('vhdl-framework', 40, 'strong', (t) => linesOf(t, /\b(?:vunit_lib|runner_cfg|osvvm)\b/gi)),
  rule('vhdl-sim-only', 20, 'weak', simOnly),
  rule('vhdl-board-ports', -50, 'veto', boardPorts),
];

/* ------------------------------ Verilog ----------------------------- */

const VLOG_CLOCK_GEN = /\b(?:always|forever)\s*#\s*(?:\([^)]*\)|[\w.']+)\s*(\w+)\s*<?=\s*[~!]\s*(\w+)\b/g;

function vlogClockGens(t: UnitText): Range[] {
  return matchesOf(t, VLOG_CLOCK_GEN)
    .filter(([, m]) => m[1] === m[2])
    .map(([at, m]) => ({ from: at, to: at + m[0].length }));
}

const blocksOf = (t: UnitText, kinds: readonly string[]): Range[] => t.unit.blocks.filter((b) => kinds.includes(b.kind));

function vlogDelay(t: UnitText): number[] {
  const blocks = blocksOf(t, ['initial', 'always']);
  const clocks = vlogClockGens(t);
  return linesOf(t, /##?\s*[\d(A-Za-z_`$]/g, (at) => inside(at, blocks) && !inside(at, clocks));
}

const EVENT_WAIT = /@\s*(?:\((?:[^()]|\([^()]*\))*\)|\*|\w+)\s*;|\bwait\s*\(|\brepeat\s*\([^)]*\)\s*@/g;

function vlogEventWait(t: UnitText): number[] {
  const initials = blocksOf(t, ['initial']);
  return linesOf(t, EVENT_WAIT, (at) => inside(at, initials));
}

const VLOG_RULES: readonly DetectionRule[] = [
  rule('vlog-portless', 25, 'weak', portless),
  rule('vlog-delay', 30, 'strong', vlogDelay),
  rule('vlog-assign-delay', 10, 'weak', (t) => linesOf(t, /\b(?:assign|wire|tri|wand|wor|trireg|supply0|supply1)\s*#/g)),
  rule('vlog-clock-gen', 25, 'strong', (t) => vlogClockGens(t).map((r) => t.lineOf(r.from))),
  rule('vlog-event-wait', 20, 'strong', vlogEventWait),
  rule('vlog-initial', 5, 'weak', (t) => linesOf(t, /\binitial\b/g)),
  rule('vlog-display', 15, 'weak', (t) => linesOf(t, /\$(?:display|write|monitor|strobe)[bho]?\b/g)),
  rule('vlog-end-sim', 30, 'strong', (t) => linesOf(t, /\$(?:finish|stop)\b/g)),
  rule('vlog-file-io', 25, 'strong', (t) => linesOf(t, /\$(?:fopen|fclose|fscanf|fgets|fdisplay|fwrite|dumpfile|dumpvars)\b/g)),
  rule('vlog-drives-dut', 20, 'strong', drivesDut),
  rule('vlog-tb-name', 15, 'weak', tbName),
  rule('vlog-sv-verif', 25, 'strong', (t) => linesOf(t, /\b(?:program|clocking|mailbox|semaphore|covergroup|class)\b|\brandomize\s*\(/g)),
  rule('vlog-uvm', 40, 'strong', (t) => linesOf(t, /\buvm_\w+|\bimport\s+uvm_pkg\b/g)),
  rule('vlog-sim-only', 20, 'weak', simOnly),
  rule('vlog-assert', 5, 'weak', (t) => linesOf(t, /\bassert\b/g)),
  rule('vlog-board-ports', -50, 'veto', boardPorts),
];

function rule(id: RuleId, weight: number, strength: DetectionRule['strength'], find: DetectionRule['find']): DetectionRule {
  return { id, weight, strength, find, explanation: RULE_TEXT[id].explanation };
}

export const RULES: Readonly<Record<Language, readonly DetectionRule[]>> = { vhdl: VHDL_RULES, verilog: VLOG_RULES };

const BY_ID: ReadonlyMap<RuleId, DetectionRule> = new Map([...VHDL_RULES, ...VLOG_RULES].map((r) => [r.id, r]));

export function ruleById(id: RuleId): DetectionRule {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown rule ${id}`);
  return found;
}
