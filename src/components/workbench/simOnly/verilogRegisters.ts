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
import { bracketed, topLevelItems, unwrapped } from './brackets';
import { escapeRegExp } from './constructText';
import { feedsBack, registerFound, SAME_NAME, type BitAlignment, type SelectedBits, synthesizedBlockText, tidy, twoClocks, unique, type EdgeDirection, type Target } from './registerShared';
import { isHidden } from './scan';
import type { RegisterProblem, RegisterProblemKind } from './types';
import { declaredRanges, verilogConstants, verilogSignalNames } from './verilogDeclarations';
import { splitAssignment } from './verilogDriverParts';
import { notAlwaysAssigned, signalOf, statementAssigns, statementEnd, type StatementContext } from './verilogStatements';

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

/** One `if` of the chain the statement starts with: its condition, and the branch it guards. */
interface ChainedIf {
  readonly condition: string;
  /** The statement run when the condition holds. */
  readonly branch: string;
}

/** The `if` at `from` (`if (` after blanks), and where its branch ends. */
function ifAt(body: string, from: number): (ChainedIf & { end: number }) | undefined {
  const start = /^\s*if\s*\(/.exec(body.slice(from));
  if (!start) return undefined;
  const open = from + start[0].length - 1;
  const condition = bracketed(body, open);
  const branchFrom = open + condition.length + 2;
  const end = statementEnd(body, branchFrom);
  return { condition, branch: body.slice(branchFrom, end), end };
}

/** The `if` / `else if` chain the statement starts with, after any `begin`. */
function ifChain(body: string): ChainedIf[] {
  const chain: ChainedIf[] = [];
  let next = /^\s*(?:begin\b(?:\s*:\s*\w+)?)?/.exec(body)?.[0].length ?? 0;
  for (let found = ifAt(body, next); found; found = ifAt(body, next)) {
    chain.push(found);
    const otherwise = /^\s*else\b/.exec(body.slice(found.end));
    if (!otherwise) break;
    next = found.end + otherwise[0].length;
  }
  return chain;
}

/** Whether the condition reads the signal as a whole name: `!KEY_N[1]` reads `KEY_N[1]`, not `KEY_N`. */
const reads = (condition: string, signal: string) => new RegExp(`(?<![\\w.])${escapeRegExp(signal)}(?![\\w.]|\\[)`).test(tidy(condition));

const ZERO = "(?:\\d*'[bBdDhHoO]0+|0+)";
const ONE = "(?:\\d*'[bBdDhHoO]0*1|0*1)";

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

/** `name <=` or `name =` as a statement: what a clocked block makes a register of, blocking or not. */
const CLOCKED_TARGET = /(?:^|[;)]|\bbegin\b|\belse\b)\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\]\s*)*)<?=(?!=)/g;

/** The body with what each `for ( … )` header holds blanked, offsets kept: its `i = i + 1` assigns no register. */
function withoutForHeaders(body: string): string {
  let out = body;
  for (const m of body.matchAll(/\bfor\s*\(/g)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const inside = bracketed(body, open);
    out = out.slice(0, open + 1) + ' '.repeat(inside.length) + out.slice(open + 1 + inside.length);
  }
  return out;
}

/** The targets of a clocked block, blocking and nonblocking: what it makes registers of. */
/** `{hi, lo} <=` or `{hi, lo} =` as a statement. */
const CLOCKED_CONCATENATION = /(?:^|[;)]|\bbegin\b|\belse\b)\s*\{/g;

/** A target as written: its name and its index (`[3:0]`, or empty). */
interface WrittenTarget {
  readonly name: string;
  readonly index: string;
}

/** The targets of a clocked block, blocking and nonblocking, each item of a concatenation too: what it makes registers of. */
function clockedTargets(body: string): WrittenTarget[] {
  const text = withoutForHeaders(body);
  const single = [...text.matchAll(CLOCKED_TARGET)].map((m) => ({ at: m.index ?? 0, name: m[1], index: m[2].trim() }));
  const concatenated = [...text.matchAll(CLOCKED_CONCATENATION)].flatMap((m) => {
    const open = (m.index ?? 0) + m[0].length - 1;
    const inner = bracketed(text, open);
    if (!/^\s*<?=(?!=)/.test(text.slice(open + inner.length + 2))) return [];
    return topLevelItems(inner).flatMap((item) => {
      const t = /^\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\]\s*)*)$/.exec(item);
      return t ? [{ at: open, name: t[1], index: t[2].trim() }] : [];
    });
  });
  return [...single, ...concatenated].sort((a, b) => a.at - b.at);
}

const targetNames = (body: string): string[] => unique(clockedTargets(body).map((t) => t.name), sameName);

/** The block's targets, with their bits. */
const targetsWithBits = (body: string): Target[] =>
  clockedTargets(body).map((t) => ({ name: t.name, bits: verilogBits(t.index === '' ? undefined : t.index) }));

/** What one nonblocking assignment loads: from after its `<=` to its `;`. */
function assignedValue(body: string, m: RegExpMatchArray): string {
  const from = (m.index ?? 0) + m[0].length;
  const semicolon = body.indexOf(';', from);
  return body.slice(from, semicolon < 0 ? body.length : semicolon);
}

const problem = (kind: RegisterProblemKind, registers: readonly string[], clocks: readonly string[]): RegisterProblem =>
  ({ kind, registers, clocks, language: 'verilog' });

/**
 * The registers a reset branch computes from themselves (`count <= count - 1`): a branch
 * that counts is a second clock, not a reset. Loading another register (`q <= d`) is an
 * asynchronous load, noted by `loadsAValue`.
 */
function countingTargets(branch: string): string[] {
  const counting = branchAssignments(branch).filter((a) => a.written.some((w) => readsItsOwnBits(a.value, w.name, w.index)));
  return unique(counting.flatMap((a) => a.targets), sameName);
}

/** One assignment of a branch, blocking or not: what it assigns as written (`q[0]`, `{hi, lo}`), the signals, and its value. */
interface BranchAssignment {
  readonly written: readonly { readonly name: string; readonly index: string }[];
  readonly targets: readonly string[];
  readonly value: string;
}

/** The assignments of a branch, statement by statement: `q = d;`, `q[0] <= d;`, `{hi, lo} <= d;`. */
function branchAssignments(branch: string): BranchAssignment[] {
  return topLevelItems(branch.replace(/\b(?:begin|end)\b/g, ' '), ';').flatMap((statement) => {
    const split = splitAssignment(statement);
    const lhs = split?.lhs.trim() ?? '';
    const items = lhs.startsWith('{') ? topLevelItems(bracketed(lhs, 0)) : [lhs];
    const written = items.flatMap((item) => {
      const m = /^\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\]\s*)*)$/.exec(item);
      return m ? [{ name: m[1], index: m[2].trim() }] : [];
    });
    return split && written.length === items.length ? [{ written, targets: written.map((w) => w.name), value: split.rhs }] : [];
  });
}

/**
 * The resets and sets of a block with several edges: the first `if` when it reads one of
 * its edges, then each `else if` that is a level test of one alone (`!rst_n`, `set`,
 * `rst == 0`). The branch after them is the clocked one, whatever it reads: in
 * `else if (rst_n && en)` the reset is high anyway, and `en` is an enable.
 */
function resetBranches({ events, body }: Pick<AlwaysBlock, 'events' | 'body'>): ChainedIf[] {
  const [first, ...rest] = ifChain(body);
  if (!first || !events.some((e) => reads(first.condition, e.signal))) return [];
  const testsALevel = (c: ChainedIf) => events.some((e) => testedLevel(c.condition, e.signal) !== undefined);
  const clocked = rest.findIndex((c) => !testsALevel(c));
  return [first, ...(clocked < 0 ? rest : rest.slice(0, clocked))];
}

/** The clock of an edge-triggered block: its edge no reset or set branch tests. */
function clockOf(always: AlwaysBlock): EdgeEvent | undefined {
  const { events } = always;
  if (events.length < 2) return events[0];
  const resets = resetBranches(always);
  return events.find((e) => !resets.some((r) => reads(r.condition, e.signal))) ?? events[0];
}

/** A reset or set tested at the other level than its edge: `negedge rst_n` with `if (rst_n)`. */
function wrongLevel(events: readonly EdgeEvent[], resets: readonly ChainedIf[]): EdgeEvent | undefined {
  return events.find((e) =>
    resets.some((r) => {
      const level = reads(r.condition, e.signal) ? testedLevel(r.condition, e.signal) : undefined;
      return level !== undefined && level !== e.direction;
    }),
  );
}

/** What a block with several edges is read as: its edges, its resets and sets, and what it assigns. */
interface EdgeBlock {
  readonly always: AlwaysBlock;
  readonly resets: readonly ChainedIf[];
  readonly registers: readonly string[];
  /** The module's signals and ports: a reset or set that reads one loads a value, not a constant. */
  readonly signals: ReadonlySet<string>;
}

/** No `if` tests an edge first: none of them can be the reset or set (Quartus Error 10200). */
const noResetTested = ({ always, resets, registers }: EdgeBlock): RegisterProblem | undefined =>
  resets.length === 0 ? problem('no-reset-tested', registers, unique(always.edges, sameName)) : undefined;

/**
 * More than one edge that no reset or set tests: each is a clock, and a register has one
 * (`@(posedge clk or posedge rst or posedge other)` with only `rst` tested; Quartus
 * Critical Warning 10237 builds plain logic instead).
 */
function untestedEdges({ always, resets, registers }: EdgeBlock): RegisterProblem | undefined {
  const clocks = always.events.filter((e) => !resets.some((r) => reads(r.condition, e.signal))).map((e) => e.signal);
  return clocks.length > 1 ? problem('two-clocks', registers, unique(clocks, sameName)) : undefined;
}

function resetPolarity({ always, resets, registers }: EdgeBlock): RegisterProblem | undefined {
  const wrong = wrongLevel(always.events, resets);
  return wrong ? { ...problem('reset-polarity', registers, [wrong.signal]), resetEdge: wrong.direction } : undefined;
}

/**
 * An asynchronous reset and an asynchronous set of the same register: the template has
 * one of them. FPGA flip-flops have no such pair, so it is built from latches (Quartus
 * Warning 13004; AMD 7-series has no such flip-flop either).
 */
function setAndReset({ always, resets }: EdgeBlock): RegisterProblem | undefined {
  const assignedBy = resets.map((r) => new Set(branchAssignments(r.branch).flatMap((a) => a.targets)));
  const both = unique(assignedBy.flatMap((names, i) => [...names].filter((n) => assignedBy.slice(i + 1).some((later) => later.has(n)))), sameName);
  const levels = always.events.filter((e) => resets.some((r) => reads(r.condition, e.signal))).map((e) => e.signal);
  return both.length > 0 ? problem('set-and-reset', both, unique(levels, sameName)) : undefined;
}

/** A reset branch that counts is a second clock (Quartus Warning 13004; the board does not count). */
function countsInAReset({ always, resets }: EdgeBlock): RegisterProblem | undefined {
  const counting = unique(resets.flatMap((r) => countingTargets(r.branch)), sameName);
  return counting.length > 0 ? problem('two-clocks', counting, unique(always.edges, sameName)) : undefined;
}

/**
 * A reset branch that loads a value that is no constant (`if (reset) q <= data;`): an
 * asynchronous load, which the FPGA builds from latches (Quartus Warning 13004).
 */
function loadsAValue({ always, resets, signals }: EdgeBlock): RegisterProblem | undefined {
  for (const r of resets) {
    const loading = branchAssignments(r.branch).filter((a) => readsASignal(a.value, signals));
    const reset = always.events.find((e) => reads(r.condition, e.signal));
    if (loading.length > 0 && reset) return problem('async-load', unique(loading.flatMap((a) => a.targets), sameName), [reset.signal]);
  }
  return undefined;
}

/** What makes a block with several edges no register template, the first that holds. */
const EDGE_BLOCK_RULES: readonly ((b: EdgeBlock) => RegisterProblem | undefined)[] = [
  noResetTested,
  untestedEdges,
  resetPolarity,
  // What keeps the design off the board first; the quiet notes of what builds from latches after.
  countsInAReset,
  setAndReset,
  loadsAValue,
];

/** One `always` with several edges that is no register template. */
function edgeBlockProblem(always: AlwaysBlock, signals: ReadonlySet<string>): Found[] {
  if (always.edges.length < 2) return [];
  const b: EdgeBlock = { always, resets: resetBranches(always), registers: targetNames(always.body), signals };
  for (const rule of EDGE_BLOCK_RULES) {
    const register = rule(b);
    if (register) return [registerFound(always.block.span.start, register)];
  }
  return [];
}

/** A number with a base (`8'hFF`, `'0`, `4'bz`): its letters are digits, not names. */
const LITERAL = /\d*\s*'[sS]?(?:[bBoOdDhH]\s*[0-9a-fA-FxXzZ?_]+|[01xXzZ])/g;

/**
 * Whether a value reads a signal or port of the module, so it is no constant. Parameters,
 * localparams, numbers and system functions are fixed (`INIT`, `{W{1'b0}}`, `$clog2(N)`),
 * and so is any name the check does not know as a signal: unsure is quiet.
 */
function readsASignal(value: string, signals: ReadonlySet<string>): boolean {
  const names = value.replace(LITERAL, ' ').match(/\$?[A-Za-z_]\w*/g) ?? [];
  return names.some((name) => signals.has(name));
}

/**
 * Verilog: `always @(posedge a or posedge b)` whose first `if` tests none of the
 * edges, so none can be the asynchronous reset or set (Quartus Error 10200); whose
 * reset is tested at the other level than its edge (`negedge rst_n` with `if (rst_n)`,
 * also 10200); with more than one edge no reset tests (Critical Warning 10237); with an
 * asynchronous reset and set of one register (latches, Warning 13004); whose reset branch
 * loads a value computed from a register, which makes it a second clock (latches too, and
 * the board does not count), or loads a signal (an asynchronous load, latches too); or two
 * clocked blocks on two clocks, or both edges of one, that assign one register (Quartus
 * Error 10028).
 */
export function verilogEdgeTemplate(t: UnitText): Found[] {
  const blocks = alwaysBlocks(t);
  const clocked = blocks.flatMap((always) => {
    const clock = clockOf(always);
    return clock === undefined ? [] : [{ part: always.block, clock: clock.signal, edge: clock.direction, targets: targetsWithBits(always.body) }];
  });
  const clashes = twoClocks(clocked, sameName).map((c): Found => ({ line: c.later.span.start, register: problem(c.kind, c.registers, c.clocks) }));
  // What the module declares, and what it assigns, which is a signal whatever its declaration says.
  const signals = new Set([...verilogSignalNames(t.code), ...targetNames(t.code)]);
  return [...blocks.flatMap((always) => edgeBlockProblem(always, signals)), ...clashes];
}

/**
 * Whether a value reads the bits its target writes: the whole signal (`x <= x + 1`), or
 * the same index (`q[i] <= q[i] ^ a`). Another index is another bit (`q[j] <= q[j-1]`), so
 * no feedback.
 */
/** A number, a name or a select, as one operand. */
const VERILOG_OPERAND = /\d*\s*'[sS]?[bBoOdDhH]\s*[0-9a-fA-FxXzZ?_]+|[A-Za-z_]\w*(?:\s*\[[^\]]*\])*|\d+/g;

/**
 * `aligned` when the value is operands joined only by bitwise operators (`~ & | ^`), a
 * unary `&`, `|` or `^` (a reduction, which mixes the bits) excepted; else `mixed`.
 */
function verilogAlignment(value: string): BitAlignment {
  const shape = value.replace(VERILOG_OPERAND, 'X').replace(/\s+/g, '');
  const onlyBitwise = /^[X~&|^()]*$/.test(shape) && !/(?:^|[~&|^(])[&|^]/.test(shape);
  return onlyBitwise ? 'aligned' : 'mixed';
}

function readsItsOwnBits(value: string, name: string, index: string): boolean {
  const select = (text: string): SelectedBits => ({ text, bits: verilogBits(text === '' ? undefined : text) });
  const written = select(tidy(/^\s*(\[[^\]]*\])?/.exec(index)?.[1] ?? ''));
  return [...value.matchAll(new RegExp(`\\b${escapeRegExp(name)}\\b\\s*(\\[[^\\]]*\\])?`, 'g'))].some((m) =>
    feedsBack(select(tidy(m[1] ?? '')), written, verilogAlignment(value)),
  );
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
  const constants = verilogConstants(t.code);
  const rangeOf = declaredRanges(t.code, constants);
  return alwaysBlocks(t).flatMap(({ block, edges, latch, body }) => {
    if (edges.length > 0 || latch) return [];
    const targets = nonblockingTargets(body);
    const keepsItself = (name: string) => targets.some((m) => m[1] === name && readsItsOwnBits(assignedValue(body, m), name, m[2]));
    const ctx: StatementContext = { text: body, rangeOf, constants, loops: new Map(), unsure: new Set() };
    const assigned = statementAssigns(ctx, 0);
    const unassigned = notAlwaysAssigned(ctx, assigned).filter((bit) => !ctx.unsure.has(bit)).map(signalOf);
    const kept = unique([...unassigned, ...[...assigned.some].map(signalOf).filter(keepsItself)], sameName);
    return kept.length === 0 ? [] : [{ line: block.span.start, register: problem('latch', kept, []) }];
  });
}
