// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Edge-triggered code that is not a register template (docs/impl_sim_only_warnings.md
 * § 3.4). FPGA synthesis builds a register (a flip-flop) from one clock edge, plus an
 * optional asynchronous reset or set tested as a level before it. The simulator runs
 * other shapes too, so they are found here, with the registers and clocks involved
 * for the message. Pure.
 */

import type { UnitText } from '../tbDetect/rules';
import type { CodeBlock } from '../tbDetect/types';
import type { Found } from './constructs';
import { overlap, verilogBits, vhdlBits, type Bits } from './bits';
import { blockText, escapeRegExp } from './constructText';
import { isHidden } from './scan';
import type { RegisterProblem, RegisterProblemKind } from './types';

/** A name as written, without blanks: `KEY_N (1)` is `KEY_N(1)`. */
const tidy = (name: string): string => name.replace(/\s+/g, '');
const unique = (names: readonly string[]): string[] => {
  const seen = new Set<string>();
  return names.filter((n) => !seen.has(n.toLowerCase()) && !!seen.add(n.toLowerCase()));
};
const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** A signal a register template assigns, with the bits: `LEDR(0)` and `LEDR(1)` are two registers. */
interface Target {
  readonly name: string;
  readonly bits: Bits;
}

/** The targets two `if`s or blocks have in common: the same signal, and bits that can be the same. */
const sharedTargets = (a: readonly Target[], b: readonly Target[]): string[] =>
  unique(b.filter((y) => a.some((x) => sameName(x.name, y.name) && overlap(x.bits, y.bits))).map((t) => t.name));

/* ------------------------------- VHDL ------------------------------- */

/** `event` is `clk'event`, which says no direction by itself. */
type EdgeKind = 'rising' | 'falling' | 'event';

interface Edge {
  readonly clock: string;
  readonly kind: EdgeKind;
}

/** `rising_edge(x)`, `falling_edge(x)`, `x'event`; character literals are blanked. */
const EDGE_CALL = /\b(rising_edge|falling_edge)\s*\(\s*([A-Za-z_][\w.]*(?:\s*\([^()]*\))?)\s*\)|([A-Za-z_][\w.]*(?:\s*\([^()]*\))?)\s*'\s*event\b/gi;

function edgeOf(m: RegExpMatchArray): Edge {
  const [, call, calledClock, eventClock] = m;
  if (!call) return { clock: tidy(eventClock), kind: 'event' };
  return { clock: tidy(calledClock), kind: call.toLowerCase() === 'rising_edge' ? 'rising' : 'falling' };
}

const edgesIn = (condition: string): Edge[] => [...condition.matchAll(EDGE_CALL)].map(edgeOf);

/** A signal or variable assigned as a statement: after `;`, `then`, `else`, `begin` or `=>`. */
const VHDL_TARGET = /(?:^|;|\bthen\b|\belse\b|\bbegin\b|=>)\s*([A-Za-z_]\w*)\s*(\([^;]*?\))?\s*(?:<=|:=)/gi;
const vhdlTargets = (text: string): string[] => unique([...text.matchAll(VHDL_TARGET)].map((m) => m[1]));
const vhdlTargetBits = (text: string): Target[] => [...text.matchAll(VHDL_TARGET)].map((m) => ({ name: m[1], bits: vhdlBits(m[2]) }));

const IF_TOKEN = /\bend\s+if\b|\b(?:elsif|if|else|then|when)\b|=>|;/gi;

interface Violation {
  /** Offset in the process text of the branch. */
  readonly at: number;
  readonly kind: RegisterProblemKind;
  readonly clocks: readonly string[];
}

/** One open `if`: where it starts, the edges of its branches, and the branches that break the template. */
interface Chain {
  readonly from: number;
  readonly edges: Edge[];
  readonly bad: Violation[];
}

/** A whole `if` of the process with a clock edge: the clock, and what the `if` assigns. */
interface ClockedIf {
  readonly at: number;
  readonly clock: string;
  readonly targets: readonly Target[];
}

interface Walk {
  readonly text: string;
  /** Whether an offset of `text` is in code hidden from synthesis (translate_off). */
  readonly hidden: (at: number) => boolean;
  readonly chains: Chain[];
  readonly found: { at: number; register: RegisterProblem }[];
  /** The process's outermost `if`s that have an edge, in order. */
  readonly clocked: ClockedIf[];
  /** Where the condition being read starts, or -1. */
  condition: number;
  /** Inside `x <= a when c else b`, whose `else` is not a branch. */
  conditionalAssignment: boolean;
}

/** The innermost `if` being read. */
const innermostIf = (w: Walk): Chain | undefined => w.chains[w.chains.length - 1];

const vhdlProblem = (kind: RegisterProblemKind, registers: readonly string[], clocks: readonly string[]): RegisterProblem =>
  ({ kind, registers, clocks, language: 'vhdl' });

/** What a branch with these edges does wrong, after the edges of the branches before it. */
function violation(before: readonly Edge[], edges: readonly Edge[], at: number): Violation | undefined {
  // Two edges in one condition (10628).
  if (edges.length > 1) return { at, kind: 'combined-edges', clocks: unique(edges.map((e) => e.clock)) };
  const [first] = before;
  if (!first) return undefined;
  const [edge] = edges;
  // A branch without an edge after the edge (10818).
  if (!edge) return { at, kind: 'outside-edge', clocks: [first.clock] };
  if (!sameName(edge.clock, first.clock)) return { at, kind: 'two-clocks', clocks: [first.clock, edge.clock] };
  // Both edges of one clock (10819); the same edge twice is a branch the register can't hold.
  return { at, kind: edge.kind === first.kind ? 'outside-edge' : 'both-edges', clocks: [first.clock] };
}

/** A condition ends at its `then`: its edges are checked against the branches before it. */
function endCondition(w: Walk, at: number): void {
  const chain = innermostIf(w);
  if (!chain || w.condition < 0) return;
  const edges = edgesIn(w.text.slice(w.condition, at));
  const bad = violation(chain.edges, edges, w.condition);
  if (bad) chain.bad.push(bad);
  chain.edges.push(...edges);
  w.condition = -1;
  w.conditionalAssignment = false;
}

/** The `if` is complete: each bad branch is reported with what the whole `if` assigns; an outermost clocked one is kept. */
function endIf(w: Walk, at: number): void {
  const chain = w.chains.pop();
  if (!chain) return;
  const registers = vhdlTargets(w.text.slice(chain.from, at));
  for (const bad of chain.bad) w.found.push({ at: bad.at, register: vhdlProblem(bad.kind, registers, bad.clocks) });
  const [edge] = chain.edges;
  const outermost = w.chains.length === 0;
  if (outermost && edge && !w.hidden(chain.from)) w.clocked.push({ at: chain.from, clock: edge.clock, targets: vhdlTargetBits(w.text.slice(chain.from, at)) });
}

const STEP: Readonly<Record<string, (w: Walk, at: number) => void>> = {
  if: (w, at) => {
    w.chains.push({ from: at, edges: [], bad: [] });
    w.condition = at;
  },
  elsif: (w, at) => {
    w.condition = at;
  },
  then: endCondition,
  else: (w, at) => {
    const chain = innermostIf(w);
    if (chain && !w.conditionalAssignment && chain.edges.length > 0) {
      chain.bad.push({ at, kind: 'outside-edge', clocks: [chain.edges[0].clock] });
    }
  },
  'end if': endIf,
  when: (w) => {
    w.conditionalAssignment = true;
  },
  ';': (w) => {
    w.conditionalAssignment = false;
  },
  '=>': (w) => {
    w.conditionalAssignment = false;
  },
};

/**
 * Two `if`s of one process on two clocks that assign the same signal (Quartus Error
 * 10820): each `if` is a register template, but the signal is one register with two
 * clocks. Reported on the later `if`.
 */
function twoClockedIfs(clocked: readonly ClockedIf[]): Walk['found'] {
  return clocked.flatMap((later, i) => {
    const earlier = clocked.slice(0, i).find((e) => !sameName(e.clock, later.clock) && sharedTargets(e.targets, later.targets).length > 0);
    if (!earlier) return [];
    return [{ at: later.at, register: vhdlProblem('two-clocks', sharedTargets(earlier.targets, later.targets), [earlier.clock, later.clock]) }];
  });
}

function processViolations(text: string, hidden: Walk['hidden']): Walk['found'] {
  const walk: Walk = { text, hidden, chains: [], found: [], clocked: [], condition: -1, conditionalAssignment: false };
  for (const m of text.matchAll(IF_TOKEN)) STEP[m[0].toLowerCase().replace(/\s+/g, ' ')](walk, m.index ?? 0);
  return [...walk.found, ...twoClockedIfs(walk.clocked)].sort((a, b) => a.at - b.at);
}

/** VHDL: every branch of a process's `if` that puts a clock edge where no register can be built. */
export function vhdlEdgeTemplate(t: UnitText): Found[] {
  return t.unit.blocks
    .filter((b) => b.kind === 'process')
    .flatMap((b) => {
      const hidden = (at: number) => isHidden(t.lineOf(b.from + at), t.simOnlyRegions);
      return processViolations(blockText(t, b), hidden).map(({ at, register }) => ({ line: t.lineOf(b.from + at), register }));
    });
}

/* ------------------------------ Verilog ----------------------------- */

/** `always`, `always_ff` or `always_latch` with its event control; `always_comb` has none. */
const SENSITIVITY = /^always(_ff|_latch)?\s*@\s*(\(\s*\*\s*\)|\*|\((?:[^()]|\([^()]*\))*\))/;
const EDGE_EVENT = /\b(?:posedge|negedge)\s+([A-Za-z_][\w.]*(?:\s*\[[^\]]*\])?)/g;

interface AlwaysBlock {
  readonly block: CodeBlock;
  readonly edges: readonly string[];
  /** `always_latch`: a latch on purpose. */
  readonly latch: boolean;
  /** The block's statement, after `always @( … )`. */
  readonly body: string;
}

/** The unit's `always` blocks that synthesis sees: one inside translate_off takes part in no comparison. */
function alwaysBlocks(t: UnitText): AlwaysBlock[] {
  return t.unit.blocks.flatMap((block) => {
    if (isHidden(block.span.start, t.simOnlyRegions)) return [];
    const text = blockText(t, block);
    const head = SENSITIVITY.exec(text);
    if (block.kind !== 'always' || !head) return [];
    const edges = [...head[2].matchAll(EDGE_EVENT)].map((m) => tidy(m[1]));
    return [{ block, edges, latch: head[1] === '_latch', body: text.slice(head[0].length) }];
  });
}

/** The `if` the statement starts with, after any `begin`: its condition, and the branch it guards. */
interface FirstIf {
  readonly condition: string;
  /** The statement run when the condition holds: a `begin … end`, or up to its `;`. */
  readonly branch: string;
}

/** The text inside the parentheses that open at `open` (offset of the `(`). */
function parenthesized(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    depth += text[i] === '(' ? 1 : text[i] === ')' ? -1 : 0;
    if (depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

function firstIf(body: string): FirstIf | undefined {
  const start = /^\s*(?:begin\b(?:\s*:\s*\w+)?\s*)?if\s*\(/.exec(body);
  if (!start) return undefined;
  const open = start[0].length - 1;
  const condition = parenthesized(body, open);
  return { condition, branch: statementAt(body, open + condition.length + 2) };
}

const BLOCK_TOKEN = /\b(?:begin|end)\b/g;

/** The statement starting at `from`: a `begin … end` block, or up to the next `;`. */
function statementAt(body: string, from: number): string {
  const rest = body.slice(from);
  if (!/^\s*begin\b/.test(rest)) return rest.slice(0, rest.indexOf(';') + 1);
  let depth = 0;
  for (const m of rest.matchAll(BLOCK_TOKEN)) {
    depth += m[0] === 'begin' ? 1 : -1;
    if (depth === 0) return rest.slice(0, (m.index ?? 0) + m[0].length);
  }
  return rest;
}

/** Whether the condition reads the signal as a whole name: `!KEY_N[1]` reads `KEY_N[1]`, not `KEY_N`. */
const reads = (condition: string, signal: string) => new RegExp(`(?<![\\w.])${escapeRegExp(signal)}(?![\\w.]|\\[)`).test(tidy(condition));
const mentions = (text: string, name: string) => new RegExp(`\\b${escapeRegExp(name)}\\b`).test(text);

/** `name <=` as a statement: after `;`, `)`, `begin`, `else`, or at the start. */
const NONBLOCKING_TARGET = /(?:^|[;)]|\bbegin\b|\belse\b)\s*([A-Za-z_]\w*)\s*((?:\[[^\]]*\]\s*)*)<=/g;
const verilogTargets = (body: string): RegExpMatchArray[] => [...body.matchAll(NONBLOCKING_TARGET)];
const verilogTargetBits = (body: string): Target[] =>
  verilogTargets(body).map((m) => ({ name: m[1], bits: verilogBits(m[2].trim() === '' ? undefined : m[2].trim()) }));

/** What one nonblocking assignment loads: from after its `<=` to its `;`. */
const assignedValue = (body: string, m: RegExpMatchArray): string => body.slice((m.index ?? 0) + m[0].length, body.indexOf(';', m.index ?? 0));

const verilogProblem = (kind: RegisterProblemKind, registers: readonly string[], clocks: readonly string[]): RegisterProblem =>
  ({ kind, registers, clocks, language: 'verilog' });

/**
 * The registers the reset branch loads from a register of the block (`count <= count - 1`):
 * a reset or set loads a constant, so such a branch is a second clock, not a reset.
 */
function loadedFromRegisters(branch: string, registers: readonly string[]): string[] {
  const loaded = verilogTargets(branch).filter((m) => registers.some((r) => mentions(assignedValue(branch, m), r)));
  return unique(loaded.map((m) => m[1]));
}

/** The clock of an edge-triggered block: its edge the first `if` does not test as a reset or set. */
function clockOf({ edges, body }: AlwaysBlock): string | undefined {
  if (edges.length < 2) return edges[0];
  const first = firstIf(body);
  return edges.find((signal) => !first || !reads(first.condition, signal)) ?? edges[0];
}

/** One `always` with several edges that is no register template. */
function edgeBlockProblem(always: AlwaysBlock): Found[] {
  const { block, edges, body } = always;
  if (edges.length < 2) return [];
  const registers = unique(verilogTargets(body).map((m) => m[1]));
  const first = firstIf(body);
  if (first === undefined || !edges.some((signal) => reads(first.condition, signal))) {
    return [{ line: block.span.start, register: verilogProblem('no-reset-tested', registers, unique(edges)) }];
  }
  const loaded = loadedFromRegisters(first.branch, registers);
  if (loaded.length === 0) return [];
  return [{ line: block.span.start, register: verilogProblem('two-clocks', loaded, unique(edges)) }];
}

/**
 * Two edge-triggered `always` blocks on two clocks that assign the same register: one
 * register, two clocks (Quartus: "can't resolve multiple constant drivers"). The
 * simulator lets both write it. Reported on the later block.
 */
function twoClockedBlocks(blocks: readonly AlwaysBlock[]): Found[] {
  const clocked = blocks.flatMap((always) => {
    const clock = clockOf(always);
    return clock === undefined ? [] : [{ always, clock, targets: verilogTargetBits(always.body) }];
  });
  return clocked.flatMap((later, i) => {
    const earlier = clocked.slice(0, i).find((e) => e.clock !== later.clock && sharedTargets(e.targets, later.targets).length > 0);
    if (!earlier) return [];
    const shared = sharedTargets(earlier.targets, later.targets);
    return [{ line: later.always.block.span.start, register: verilogProblem('two-clocks', shared, [earlier.clock, later.clock]) }];
  });
}

/**
 * Verilog: `always @(posedge a or posedge b)` whose first `if` tests none of the
 * edges, so none can be the asynchronous reset or set (Quartus Error 10200); whose
 * reset branch loads a value computed from a register, which makes it a second clock
 * (Quartus builds latches, Warning 13004, and the board does not count); or two clocked
 * blocks on two clocks that assign one register.
 */
export function verilogEdgeTemplate(t: UnitText): Found[] {
  const blocks = alwaysBlocks(t);
  return [...blocks.flatMap(edgeBlockProblem), ...twoClockedBlocks(blocks)];
}

/** Whether the block reads `name` before its first assignment to it: then it runs on the value kept from before. */
function readBeforeWritten(body: string, targets: readonly RegExpMatchArray[], name: string): boolean {
  const writes = targets.filter((m) => m[1] === name).map((m) => (m.index ?? 0) + m[0].search(new RegExp(`\\b${escapeRegExp(name)}\\b`)));
  const firstWrite = Math.min(...writes);
  const uses = [...body.matchAll(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g'))].map((m) => m.index ?? 0);
  return uses.some((at) => at < firstWrite);
}

/**
 * Verilog: an `always` without an edge that keeps a value: a variable it assigns with `<=`
 * from itself (`x <= x + 1`), or reads before it assigns it (`if (x_prev && …) … x_prev <= …`),
 * so the block runs on its old value. Without a clock that is a latch (Quartus Warning 10240).
 * A variable assigned before it is read (`x <= a; if (x) …`, `y <= x`) is plain logic. An
 * `always_latch` is a latch on purpose.
 */
export function verilogLevelStorage(t: UnitText): Found[] {
  return alwaysBlocks(t).flatMap(({ block, edges, latch, body }) => {
    if (edges.length > 0 || latch) return [];
    const targets = verilogTargets(body);
    const keepsItself = (name: string) => targets.some((m) => m[1] === name && mentions(assignedValue(body, m), name));
    const kept = unique(targets.map((m) => m[1])).filter((name) => keepsItself(name) || readBeforeWritten(body, targets, name));
    return kept.length === 0 ? [] : [{ line: block.span.start, register: verilogProblem('latch', kept, []) }];
  });
}
