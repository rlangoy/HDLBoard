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
import { blockText, escapeRegExp } from './constructText';
import type { RegisterProblem, RegisterProblemKind } from './types';

/** A name as written, without blanks: `KEY_N (1)` is `KEY_N(1)`. */
const tidy = (name: string): string => name.replace(/\s+/g, '');
const unique = (names: readonly string[]): string[] => {
  const seen = new Set<string>();
  return names.filter((n) => !seen.has(n.toLowerCase()) && !!seen.add(n.toLowerCase()));
};

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
const VHDL_TARGET = /(?:^|;|\bthen\b|\belse\b|\bbegin\b|=>)\s*([A-Za-z_]\w*)\s*(?:\([^;]*?\))?\s*(?:<=|:=)/gi;
const vhdlTargets = (text: string): string[] => unique([...text.matchAll(VHDL_TARGET)].map((m) => m[1]));

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

interface Walk {
  readonly text: string;
  readonly chains: Chain[];
  readonly found: { at: number; register: RegisterProblem }[];
  /** Where the condition being read starts, or -1. */
  condition: number;
  /** Inside `x <= a when c else b`, whose `else` is not a branch. */
  conditionalAssignment: boolean;
}

/** The innermost `if` being read. */
const innermostIf = (w: Walk): Chain | undefined => w.chains[w.chains.length - 1];

/** What a branch with these edges does wrong, after the edges of the branches before it. */
function violation(before: readonly Edge[], edges: readonly Edge[], at: number): Violation | undefined {
  // Two edges in one condition (10628).
  if (edges.length > 1) return { at, kind: 'combined-edges', clocks: unique(edges.map((e) => e.clock)) };
  const [first] = before;
  if (!first) return undefined;
  const [edge] = edges;
  // A branch without an edge after the edge (10818).
  if (!edge) return { at, kind: 'outside-edge', clocks: [first.clock] };
  if (edge.clock.toLowerCase() !== first.clock.toLowerCase()) return { at, kind: 'two-clocks', clocks: [first.clock, edge.clock] };
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

/** The `if` is complete: each bad branch is reported with what the whole `if` assigns. */
function endIf(w: Walk, at: number): void {
  const chain = w.chains.pop();
  if (!chain || chain.bad.length === 0) return;
  const registers = vhdlTargets(w.text.slice(chain.from, at));
  for (const bad of chain.bad) w.found.push({ at: bad.at, register: { kind: bad.kind, registers, clocks: bad.clocks } });
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

function processViolations(text: string): Walk['found'] {
  const walk: Walk = { text, chains: [], found: [], condition: -1, conditionalAssignment: false };
  for (const m of text.matchAll(IF_TOKEN)) STEP[m[0].toLowerCase().replace(/\s+/g, ' ')](walk, m.index ?? 0);
  return walk.found.sort((a, b) => a.at - b.at);
}

/** VHDL: every branch of a process's `if` that puts a clock edge where no register can be built. */
export function vhdlEdgeTemplate(t: UnitText): Found[] {
  return t.unit.blocks
    .filter((b) => b.kind === 'process')
    .flatMap((b) => processViolations(blockText(t, b)).map(({ at, register }) => ({ line: t.lineOf(b.from + at), register })));
}

const SENSITIVITY = /^always\s*@\s*(\(\s*\*\s*\)|\*|\((?:[^()]|\([^()]*\))*\))/;
const EDGE_EVENT = /\b(?:posedge|negedge)\s+([A-Za-z_][\w.]*(?:\s*\[[^\]]*\])?)/g;

interface AlwaysBlock {
  readonly block: CodeBlock;
  readonly edges: readonly string[];
  /** The block's statement, after `always @( … )`. */
  readonly body: string;
}

function alwaysBlocks(t: UnitText): AlwaysBlock[] {
  return t.unit.blocks.flatMap((block) => {
    const text = blockText(t, block);
    const head = SENSITIVITY.exec(text);
    if (block.kind !== 'always' || !head) return [];
    const edges = [...head[1].matchAll(EDGE_EVENT)].map((m) => tidy(m[1]));
    return [{ block, edges, body: text.slice(head[0].length) }];
  });
}

/** The `if` the statement starts with, after any `begin`: its condition, and the branch it guards. */
interface FirstIf {
  readonly condition: string;
  /** The statement run when the condition holds: a `begin … end`, or up to its `;`. */
  readonly branch: string;
}

function firstIf(body: string): FirstIf | undefined {
  const start = /^\s*(?:begin\b(?:\s*:\s*\w+)?\s*)?if\s*\(/.exec(body);
  if (!start) return undefined;
  let depth = 1;
  let i = start[0].length;
  for (; i < body.length && depth > 0; i++) depth += body[i] === '(' ? 1 : body[i] === ')' ? -1 : 0;
  return { condition: body.slice(start[0].length, i - 1), branch: statementAt(body, i) };
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

/** `name <=` as a statement: after `;`, `)`, `begin`, `else`, or at the start. */
const NONBLOCKING_TARGET = /(?:^|[;)]|\bbegin\b|\belse\b)\s*([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*<=/g;
const verilogTargets = (body: string): RegExpMatchArray[] => [...body.matchAll(NONBLOCKING_TARGET)];

/**
 * The registers the reset branch loads from a register of the block (`count <= count - 1`):
 * a reset or set loads a constant, so such a branch is a second clock, not a reset.
 */
function loadedFromRegisters(branch: string, registers: readonly string[]): string[] {
  const loaded = verilogTargets(branch).filter((m) => {
    const value = branch.slice((m.index ?? 0) + m[0].length, branch.indexOf(';', m.index ?? 0));
    return registers.some((r) => new RegExp(`\\b${escapeRegExp(r)}\\b`).test(value));
  });
  return unique(loaded.map((m) => m[1]));
}

/**
 * Verilog: `always @(posedge a or posedge b)` whose first `if` tests none of the
 * edges, so none can be the asynchronous reset or set (Quartus Error 10200); or whose
 * reset branch loads a value computed from a register, which makes it a second clock
 * (Quartus builds latches, Warning 13004, and the board does not count).
 */
export function verilogEdgeTemplate(t: UnitText): Found[] {
  return alwaysBlocks(t).flatMap(({ block, edges, body }): Found[] => {
    if (edges.length < 2) return [];
    const registers = unique(verilogTargets(body).map((m) => m[1]));
    const first = firstIf(body);
    if (first === undefined || !edges.some((signal) => reads(first.condition, signal))) {
      return [{ line: block.span.start, register: { kind: 'no-reset-tested', registers, clocks: unique(edges) } }];
    }
    const loaded = loadedFromRegisters(first.branch, registers);
    if (loaded.length === 0) return [];
    return [{ line: block.span.start, register: { kind: 'two-clocks', registers: loaded, clocks: unique(edges) } }];
  });
}

/**
 * Verilog: an `always` without an edge that reads a variable it assigns with `<=`.
 * It keeps a value without a clock, so synthesis builds latches (Quartus Warning 10240).
 */
export function verilogLevelStorage(t: UnitText): Found[] {
  return alwaysBlocks(t).flatMap(({ block, edges, body }) => {
    if (edges.length > 0) return [];
    const targets = verilogTargets(body);
    // The prefix is `;`, `)`, `begin` or `else`, never the target itself.
    const writes = targets.map((m) => (m.index ?? 0) + m[0].search(new RegExp(`\\b${m[1]}\\b`)));
    const kept = unique(targets.map((m) => m[1])).filter((name) =>
      [...body.matchAll(new RegExp(`\\b${name}\\b`, 'g'))].some((use) => !writes.includes(use.index ?? -1)),
    );
    return kept.length === 0 ? [] : [{ line: block.span.start, register: { kind: 'latch', registers: kept, clocks: [] } }];
  });
}
