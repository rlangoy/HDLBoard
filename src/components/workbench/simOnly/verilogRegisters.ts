// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Verilog `always` blocks that are no register template, or keep a value without a clock
 * (docs/impl_sim_only_warnings.md § 3.4). Synthesis builds a register from one clock
 * edge, plus an optional asynchronous reset or set the first `if` tests; without an edge,
 * a value some path keeps is a latch. The simulator runs the other shapes too. Pure.
 */

import type { UnitText } from '../tbDetect/rules';
import type { CodeBlock } from '../tbDetect/types';
import { verilogBits } from './bits';
import type { Found } from './constructs';
import { escapeRegExp } from './constructText';
import { SAME_NAME, synthesizedBlockText, tidy, twoClocks, unique, type EdgeDirection, type Target } from './registerShared';
import { isHidden } from './scan';
import type { RegisterProblem, RegisterProblemKind } from './types';
import { notAlwaysAssigned, parenthesized, signalOf, statementAssigns, statementEnd, type BitRange, type StatementContext } from './verilogStatements';

const sameName = SAME_NAME.verilog;

/** `always`, `always_ff` or `always_latch` with its event control; `always_comb` has none. */
const SENSITIVITY = /^always(_ff|_latch)?\s*@\s*(\(\s*\*\s*\)|\*|\((?:[^()]|\([^()]*\))*\))/;
const EDGE_EVENT = /\b(posedge|negedge)\s+([A-Za-z_][\w.]*(?:\s*\[[^\]]*\])?)/g;

/** One `posedge x` or `negedge x` of the event control. */
interface EdgeEvent {
  readonly signal: string;
  readonly direction: EdgeDirection;
}

interface AlwaysBlock {
  readonly block: CodeBlock;
  readonly events: readonly EdgeEvent[];
  /** The signals of `events`, in order. */
  readonly edges: readonly string[];
  /** `always_latch`: a latch on purpose. */
  readonly latch: boolean;
  /** The block's statement, after `always @( … )`, as synthesis reads it (translate_off blanked). */
  readonly body: string;
}

/** The unit's `always` blocks that synthesis sees: one inside translate_off takes part in no comparison. */
function alwaysBlocks(t: UnitText): AlwaysBlock[] {
  return t.unit.blocks.flatMap((block) => {
    if (isHidden(block.span.start, t.simOnlyRegions)) return [];
    const text = synthesizedBlockText(t, block);
    const head = SENSITIVITY.exec(text);
    if (block.kind !== 'always' || !head) return [];
    const events = [...head[2].matchAll(EDGE_EVENT)].map((m): EdgeEvent => ({ signal: tidy(m[2]), direction: m[1] === 'posedge' ? 'rising' : 'falling' }));
    return [{ block, events, edges: events.map((e) => e.signal), latch: head[1] === '_latch', body: text.slice(head[0].length) }];
  });
}

/** The `if` the statement starts with, after any `begin`: its condition, and the branch it guards. */
interface FirstIf {
  readonly condition: string;
  /** The statement run when the condition holds. */
  readonly branch: string;
}

function firstIf(body: string): FirstIf | undefined {
  const start = /^\s*(?:begin\b(?:\s*:\s*\w+)?\s*)?if\s*\(/.exec(body);
  if (!start) return undefined;
  const open = start[0].length - 1;
  const condition = parenthesized(body, open);
  const branchFrom = open + condition.length + 2;
  return { condition, branch: body.slice(branchFrom, statementEnd(body, branchFrom)) };
}

/** Whether the condition reads the signal as a whole name: `!KEY_N[1]` reads `KEY_N[1]`, not `KEY_N`. */
const reads = (condition: string, signal: string) => new RegExp(`(?<![\\w.])${escapeRegExp(signal)}(?![\\w.]|\\[)`).test(tidy(condition));
const mentions = (text: string, name: string) => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text);

const ZERO = "(?:\\d*'[bBdDhHoO]0+|0+)";
const ONE = "(?:\\d*'[bBdDhHoO]0*1|0*1)";

/** Without the parentheses around the whole of it: `((a))` is `a`. */
function unwrapped(text: string): string {
  return text.startsWith('(') && parenthesized(text, 0).length === text.length - 2 ? unwrapped(text.slice(1, -1)) : text;
}

/**
 * The level of the signal the condition tests, when it is that test alone: `!rst_n`,
 * `~rst_n`, `rst_n == 0` and `rst_n != 1` test it low; `rst`, `rst == 1'b1` high. A larger
 * condition (`!rst_n || clear`) says nothing here.
 */
function testedLevel(condition: string, signal: string): EdgeDirection | undefined {
  const c = unwrapped(tidy(condition));
  const s = escapeRegExp(signal);
  const low = new RegExp(`^(?:[!~]\\(?${s}\\)?|${s}===?${ZERO}|${s}!==?${ONE})$`);
  const high = new RegExp(`^(?:${s}|${s}===?${ONE}|${s}!==?${ZERO})$`);
  if (low.test(c)) return 'falling';
  return high.test(c) ? 'rising' : undefined;
}

/** `name <=` as a statement: after `;`, `)`, `begin`, `else`, or at the start. */
const NONBLOCKING_TARGET = /(?:^|[;)]|\bbegin\b|\belse\b)\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\]\s*)*)<=/g;
const nonblockingTargets = (body: string): RegExpMatchArray[] => [...body.matchAll(NONBLOCKING_TARGET)];
const targetNames = (body: string): string[] => unique(nonblockingTargets(body).map((m) => m[1]), sameName);

/** The block's targets, with their bits. */
const targetsWithBits = (body: string): Target[] =>
  nonblockingTargets(body).map((m) => ({ name: m[1], bits: verilogBits(m[2].trim() === '' ? undefined : m[2].trim()) }));

/** What one nonblocking assignment loads: from after its `<=` to its `;`. */
function assignedValue(body: string, m: RegExpMatchArray): string {
  const from = (m.index ?? 0) + m[0].length;
  const semicolon = body.indexOf(';', from);
  return body.slice(from, semicolon < 0 ? body.length : semicolon);
}

const problem = (kind: RegisterProblemKind, registers: readonly string[], clocks: readonly string[]): RegisterProblem =>
  ({ kind, registers, clocks, language: 'verilog' });

/**
 * The registers the reset branch loads from a register of the block (`count <= count - 1`):
 * a reset or set loads a constant, so such a branch is a second clock, not a reset.
 */
function loadedFromRegisters(branch: string, registers: readonly string[]): string[] {
  const loaded = nonblockingTargets(branch).filter((m) => registers.some((r) => mentions(assignedValue(branch, m), r)));
  return unique(loaded.map((m) => m[1]), sameName);
}

/** The clock of an edge-triggered block: its edge the first `if` does not test as a reset or set. */
function clockOf({ events, body }: AlwaysBlock): EdgeEvent | undefined {
  if (events.length < 2) return events[0];
  const first = firstIf(body);
  return events.find((e) => !first || !reads(first.condition, e.signal)) ?? events[0];
}

/** The reset or set the first `if` tests at the other level than its edge: `negedge rst_n` with `if (rst_n)`. */
function wrongLevel(events: readonly EdgeEvent[], condition: string): EdgeEvent | undefined {
  return events.find((e) => {
    const level = reads(condition, e.signal) ? testedLevel(condition, e.signal) : undefined;
    return level !== undefined && level !== e.direction;
  });
}

/** One `always` with several edges that is no register template. */
function edgeBlockProblem({ block, events, edges, body }: AlwaysBlock): Found[] {
  if (edges.length < 2) return [];
  const registers = targetNames(body);
  const first = firstIf(body);
  const found = (register: RegisterProblem): Found[] => [{ line: block.span.start, register }];
  if (first === undefined || !edges.some((signal) => reads(first.condition, signal))) {
    return found(problem('no-reset-tested', registers, unique(edges, sameName)));
  }
  const wrong = wrongLevel(events, first.condition);
  if (wrong) return found(problem('reset-polarity', registers, [`${wrong.direction === 'rising' ? 'posedge' : 'negedge'} ${wrong.signal}`, wrong.signal]));
  const loaded = loadedFromRegisters(first.branch, registers);
  return loaded.length === 0 ? [] : found(problem('two-clocks', loaded, unique(edges, sameName)));
}

/**
 * Verilog: `always @(posedge a or posedge b)` whose first `if` tests none of the
 * edges, so none can be the asynchronous reset or set (Quartus Error 10200); whose
 * reset is tested at the other level than its edge (`negedge rst_n` with `if (rst_n)`,
 * also 10200); whose reset branch loads a value computed from a register, which makes it
 * a second clock (Quartus builds latches, Warning 13004, and the board does not count);
 * or two clocked blocks on two clocks, or both edges of one, that assign one register
 * (Quartus Error 10028).
 */
export function verilogEdgeTemplate(t: UnitText): Found[] {
  const blocks = alwaysBlocks(t);
  const clocked = blocks.flatMap((always) => {
    const clock = clockOf(always);
    return clock === undefined ? [] : [{ part: always.block, clock: clock.signal, edge: clock.direction, targets: targetsWithBits(always.body) }];
  });
  const clashes = twoClocks(clocked, sameName).map((c): Found => ({ line: c.later.span.start, register: problem(c.kind, c.registers, c.clocks) }));
  return [...blocks.flatMap(edgeBlockProblem), ...clashes];
}

/** A declaration: its kind words, an optional constant range, and its names up to the next declaration word. */
const DECLARATION = /\b(?:input|output|inout|reg|wire|logic)\b((?:\s+(?:reg|wire|logic|signed|unsigned))*)\s*(?:\[\s*(\d+)\s*:\s*(\d+)\s*\])?((?:(?!\b(?:input|output|inout|reg|wire|logic)\b)[^;=()])*)/g;
const DECLARATION_WORD = /^(?:input|output|inout|reg|wire|logic|signed|unsigned)$/;

/** The ranges the module declares (`input sel` is bit 0, `input [1:0] sel` bits 1 to 0), for bits and case labels. */
function declaredRanges(code: string): StatementContext['rangeOf'] {
  const ranges = new Map<string, BitRange>();
  for (const m of code.matchAll(DECLARATION)) {
    const range = m[2] === undefined ? { msb: 0, lsb: 0 } : { msb: Number(m[2]), lsb: Number(m[3]) };
    // `input a, b` declares both; `input a, input [1:0] b` starts another declaration at `input`.
    for (const item of m[4].split(',')) {
      const name = /^\s*([A-Za-z_]\w*)/.exec(item)?.[1];
      if (name === undefined || DECLARATION_WORD.test(name)) break;
      if (!ranges.has(name)) ranges.set(name, range);
    }
  }
  return (name) => ranges.get(name);
}

/**
 * Verilog: an `always` without an edge that keeps a value: a bit some path through the
 * block leaves unassigned (an `if` without `else`, a `case` that names not every value, a
 * write to `q[idx]` alone), or a variable assigned from itself (`x <= x + 1`). Without a
 * clock that is a latch (Quartus Warning 10240). A bit every path assigns is plain logic,
 * whatever order the lines are in (`y <= x; x <= a;`). An `always_latch` is a latch on
 * purpose.
 */
export function verilogLevelStorage(t: UnitText): Found[] {
  const rangeOf = declaredRanges(t.code);
  return alwaysBlocks(t).flatMap(({ block, edges, latch, body }) => {
    if (edges.length > 0 || latch) return [];
    const targets = nonblockingTargets(body);
    const keepsItself = (name: string) => targets.some((m) => m[1] === name && mentions(assignedValue(body, m), name));
    const ctx: StatementContext = { text: body, rangeOf, loops: new Map() };
    const assigned = statementAssigns(ctx, 0);
    const kept = unique([...notAlwaysAssigned(ctx, assigned).map(signalOf), ...[...assigned.some].map(signalOf).filter(keepsItself)], sameName);
    return kept.length === 0 ? [] : [{ line: block.span.start, register: problem('latch', kept, []) }];
  });
}
