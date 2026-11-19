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
import { SAME_NAME, synthesizedBlockText, tidy, twoClocks, unique, type Target } from './registerShared';
import { isHidden } from './scan';
import type { RegisterProblem, RegisterProblemKind } from './types';
import { notAlwaysAssigned, parenthesized, signalOf, statementAssigns, type StatementContext } from './verilogStatements';

const sameName = SAME_NAME.verilog;

/** `always`, `always_ff` or `always_latch` with its event control; `always_comb` has none. */
const SENSITIVITY = /^always(_ff|_latch)?\s*@\s*(\(\s*\*\s*\)|\*|\((?:[^()]|\([^()]*\))*\))/;
const EDGE_EVENT = /\b(?:posedge|negedge)\s+([A-Za-z_][\w.]*(?:\s*\[[^\]]*\])?)/g;

interface AlwaysBlock {
  readonly block: CodeBlock;
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
    const edges = [...head[2].matchAll(EDGE_EVENT)].map((m) => tidy(m[1]));
    return [{ block, edges, latch: head[1] === '_latch', body: text.slice(head[0].length) }];
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
  const end = statementAssigns({ text: body, widthOf: () => undefined }, branchFrom).end;
  return { condition, branch: body.slice(branchFrom, end) };
}

/** Whether the condition reads the signal as a whole name: `!KEY_N[1]` reads `KEY_N[1]`, not `KEY_N`. */
const reads = (condition: string, signal: string) => new RegExp(`(?<![\\w.])${escapeRegExp(signal)}(?![\\w.]|\\[)`).test(tidy(condition));
const mentions = (text: string, name: string) => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text);

/** `name <=` as a statement: after `;`, `)`, `begin`, `else`, or at the start. */
const NONBLOCKING_TARGET = /(?:^|[;)]|\bbegin\b|\belse\b)\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\]\s*)*)<=/g;
const nonblockingTargets = (body: string): RegExpMatchArray[] => [...body.matchAll(NONBLOCKING_TARGET)];
const targetNames = (body: string): string[] => unique(nonblockingTargets(body).map((m) => m[1]), sameName);

/** The block's targets, with their bits. */
const targetsWithBits = (body: string): Target[] =>
  nonblockingTargets(body).map((m) => ({ name: m[1], bits: verilogBits(m[2].trim() === '' ? undefined : m[2].trim()) }));

/** What one nonblocking assignment loads: from after its `<=` to its `;`. */
const assignedValue = (body: string, m: RegExpMatchArray): string => body.slice((m.index ?? 0) + m[0].length, body.indexOf(';', m.index ?? 0));

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
function clockOf({ edges, body }: AlwaysBlock): string | undefined {
  if (edges.length < 2) return edges[0];
  const first = firstIf(body);
  return edges.find((signal) => !first || !reads(first.condition, signal)) ?? edges[0];
}

/** One `always` with several edges that is no register template. */
function edgeBlockProblem({ block, edges, body }: AlwaysBlock): Found[] {
  if (edges.length < 2) return [];
  const registers = targetNames(body);
  const first = firstIf(body);
  if (first === undefined || !edges.some((signal) => reads(first.condition, signal))) {
    return [{ line: block.span.start, register: problem('no-reset-tested', registers, unique(edges, sameName)) }];
  }
  const loaded = loadedFromRegisters(first.branch, registers);
  if (loaded.length === 0) return [];
  return [{ line: block.span.start, register: problem('two-clocks', loaded, unique(edges, sameName)) }];
}

/**
 * Verilog: `always @(posedge a or posedge b)` whose first `if` tests none of the
 * edges, so none can be the asynchronous reset or set (Quartus Error 10200); whose
 * reset branch loads a value computed from a register, which makes it a second clock
 * (Quartus builds latches, Warning 13004, and the board does not count); or two clocked
 * blocks on two clocks that assign one register (Quartus Error 10028).
 */
export function verilogEdgeTemplate(t: UnitText): Found[] {
  const blocks = alwaysBlocks(t);
  const clocked = blocks.flatMap((always) => {
    const clock = clockOf(always);
    return clock === undefined ? [] : [{ part: always.block, clock, targets: targetsWithBits(always.body) }];
  });
  const clashes = twoClocks(clocked, sameName).map((c): Found => ({ line: c.later.span.start, register: problem('two-clocks', c.registers, c.clocks) }));
  return [...blocks.flatMap(edgeBlockProblem), ...clashes];
}

/** A declaration: its kind words, an optional constant range, and its names up to the next declaration word. */
const DECLARATION = /\b(?:input|output|inout|reg|wire|logic)\b((?:\s+(?:reg|wire|logic|signed|unsigned))*)\s*(?:\[\s*(\d+)\s*:\s*(\d+)\s*\])?((?:(?!\b(?:input|output|inout|reg|wire|logic)\b)[^;=()])*)/g;
const DECLARATION_WORD = /^(?:input|output|inout|reg|wire|logic|signed|unsigned)$/;

/** The widths the module declares (`input sel` is 1, `input [1:0] sel` is 2), for a case's labels to be counted. */
function declaredWidths(code: string): StatementContext['widthOf'] {
  const widths = new Map<string, number>();
  for (const m of code.matchAll(DECLARATION)) {
    const width = m[2] === undefined ? 1 : Math.abs(Number(m[2]) - Number(m[3])) + 1;
    // `input a, b` declares both; `input a, input [1:0] b` starts another declaration at `input`.
    for (const item of m[4].split(',')) {
      const name = /^\s*([A-Za-z_]\w*)/.exec(item)?.[1];
      if (name === undefined || DECLARATION_WORD.test(name)) break;
      if (!widths.has(name)) widths.set(name, width);
    }
  }
  return (name) => widths.get(name);
}

/**
 * Verilog: an `always` without an edge that keeps a value: a variable some path through the
 * block leaves unassigned (an `if` without `else`, a `case` without `default`), or one
 * assigned from itself (`x <= x + 1`). Without a clock that is a latch (Quartus Warning
 * 10240). A variable every path assigns is plain logic, whatever order the lines are in
 * (`y <= x; x <= a;`). An `always_latch` is a latch on purpose.
 */
export function verilogLevelStorage(t: UnitText): Found[] {
  const widths = declaredWidths(t.code);
  return alwaysBlocks(t).flatMap(({ block, edges, latch, body }) => {
    if (edges.length > 0 || latch) return [];
    const targets = nonblockingTargets(body);
    const keepsItself = (name: string) => targets.some((m) => m[1] === name && mentions(assignedValue(body, m), name));
    const assigned = statementAssigns({ text: body, widthOf: widths }, 0);
    const kept = unique([...notAlwaysAssigned(assigned).map(signalOf), ...[...assigned.some].map(signalOf).filter(keepsItself)], sameName);
    return kept.length === 0 ? [] : [{ line: block.span.start, register: problem('latch', kept, []) }];
  });
}
