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

/** Names as the language compares them: VHDL ignores case, Verilog does not (`q` and `Q` are two). */
type SameName = (a: string, b: string) => boolean;
const sameVerilogName: SameName = (a, b) => a === b;

/** The targets two `if`s or blocks have in common: the same signal, and bits that can be the same. */
const sharedTargets = (a: readonly Target[], b: readonly Target[], same: SameName): string[] =>
  unique(b.filter((y) => a.some((x) => same(x.name, y.name) && overlap(x.bits, y.bits))).map((t) => t.name));

/**
 * Where a target pattern's target stands: its match starts at the statement before (`;`,
 * `then`, `begin`), which may be lines earlier, outside a translate_off the target is in.
 */
const targetAt = (m: RegExpMatchArray): number => (m.index ?? 0) + m[0].search(new RegExp(`\\b${escapeRegExp(m[1])}\\b`));

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
/** The targets of `text` (from offset `from` of the process), those in code hidden from synthesis left out. */
const vhdlTargetBits = (text: string, from: number, hidden: (at: number) => boolean): Target[] =>
  [...text.matchAll(VHDL_TARGET)].filter((m) => !hidden(from + targetAt(m))).map((m) => ({ name: m[1], bits: vhdlBits(m[2]) }));

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
  if (outermost && edge && !w.hidden(chain.from)) w.clocked.push({ at: chain.from, clock: edge.clock, targets: vhdlTargetBits(w.text.slice(chain.from, at), chain.from, w.hidden) });
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
    const earlier = clocked.slice(0, i).find((e) => !sameName(e.clock, later.clock) && sharedTargets(e.targets, later.targets, sameName).length > 0);
    if (!earlier) return [];
    return [{ at: later.at, register: vhdlProblem('two-clocks', sharedTargets(earlier.targets, later.targets, sameName), [earlier.clock, later.clock]) }];
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
  /** Whether an offset of `body` is in code hidden from synthesis (translate_off inside the block). */
  readonly hidden: (at: number) => boolean;
}

/** The unit's `always` blocks that synthesis sees: one inside translate_off takes part in no comparison. */
function alwaysBlocks(t: UnitText): AlwaysBlock[] {
  return t.unit.blocks.flatMap((block) => {
    if (isHidden(block.span.start, t.simOnlyRegions)) return [];
    const text = blockText(t, block);
    const head = SENSITIVITY.exec(text);
    if (block.kind !== 'always' || !head) return [];
    const edges = [...head[2].matchAll(EDGE_EVENT)].map((m) => tidy(m[1]));
    const bodyFrom = block.from + head[0].length;
    const hidden = (at: number) => isHidden(t.lineOf(bodyFrom + at), t.simOnlyRegions);
    return [{ block, edges, latch: head[1] === '_latch', body: text.slice(head[0].length), hidden }];
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
/** The block's targets with their bits, those in code hidden from synthesis left out. */
const verilogTargetBits = ({ body, hidden }: Pick<AlwaysBlock, 'body' | 'hidden'>): Target[] =>
  verilogTargets(body)
    .filter((m) => !hidden(targetAt(m)))
    .map((m) => ({ name: m[1], bits: verilogBits(m[2].trim() === '' ? undefined : m[2].trim()) }));

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
    return clock === undefined ? [] : [{ always, clock, targets: verilogTargetBits(always) }];
  });
  return clocked.flatMap((later, i) => {
    const earlier = clocked.slice(0, i).find((e) => e.clock !== later.clock && sharedTargets(e.targets, later.targets, sameVerilogName).length > 0);
    if (!earlier) return [];
    const shared = sharedTargets(earlier.targets, later.targets, sameVerilogName);
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


/* --------------------- Verilog: assigned on every path -------------------- */

/** What a statement assigns, on some path and on every path through it. */
interface Assigned {
  /** Where the statement ends in the text. */
  readonly end: number;
  readonly some: ReadonlySet<string>;
  readonly every: ReadonlySet<string>;
}

const NOTHING: ReadonlySet<string> = new Set();
const union = (sets: readonly ReadonlySet<string>[]): Set<string> => new Set(sets.flatMap((s) => [...s]));
const intersection = (sets: readonly ReadonlySet<string>[]): Set<string> =>
  sets.length === 0 ? new Set() : new Set([...sets[0]].filter((x) => sets.every((s) => s.has(x))));

const skipBlanks = (text: string, i: number): number => {
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
};
const wordAt = (text: string, i: number): string => /^[A-Za-z_]\w*/.exec(text.slice(i))?.[0] ?? '';

/** The offset after the parenthesis that opens at the first "(" from i. */
function afterParentheses(text: string, i: number): number {
  const open = text.indexOf('(', i);
  if (open < 0) return text.length;
  return open + parenthesized(text, open).length + 2;
}

/** The offset after a case item's label: the first ":" outside brackets and parentheses. */
function afterCaseLabel(text: string, i: number): number {
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if ('([{'.includes(text[j])) depth++;
    else if (')]}'.includes(text[j])) depth--;
    else if (text[j] === ':' && depth === 0) return j + 1;
    else if (text[j] === ';') return j;
  }
  return text.length;
}

const ASSIGNMENT = /^([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*<?=(?!=)/;

function simpleStatement(text: string, i: number): Assigned {
  const semicolon = text.indexOf(';', i);
  const end = semicolon < 0 ? text.length : semicolon + 1;
  const target = ASSIGNMENT.exec(text.slice(i, end).trim())?.[1];
  const assigned = target === undefined ? NOTHING : new Set([target]);
  return { end, some: assigned, every: assigned };
}

function blockStatement(text: string, i: number): Assigned {
  let j = skipBlanks(text, i + 'begin'.length);
  if (text[j] === ':') {
    j = skipBlanks(text, j + 1);
    j += wordAt(text, j).length; // begin : name
  }
  const parts: Assigned[] = [];
  for (j = skipBlanks(text, j); j < text.length && wordAt(text, j) !== 'end'; j = skipBlanks(text, j)) {
    const part = statementAssigns(text, j);
    parts.push(part);
    j = Math.max(part.end, j + 1);
  }
  return { end: j + 'end'.length, some: union(parts.map((p) => p.some)), every: union(parts.map((p) => p.every)) };
}

function ifStatement(text: string, i: number): Assigned {
  const then = statementAssigns(text, afterParentheses(text, i));
  const next = skipBlanks(text, then.end);
  if (wordAt(text, next) !== 'else') return { end: then.end, some: then.some, every: NOTHING };
  const otherwise = statementAssigns(text, next + 'else'.length);
  return { end: otherwise.end, some: union([then.some, otherwise.some]), every: intersection([then.every, otherwise.every]) };
}

function caseStatement(text: string, i: number): Assigned {
  const items: Assigned[] = [];
  let hasDefault = false;
  let j = skipBlanks(text, afterParentheses(text, i));
  while (j < text.length && wordAt(text, j) !== 'endcase') {
    hasDefault ||= wordAt(text, j) === 'default';
    const item = statementAssigns(text, afterCaseLabel(text, j));
    items.push(item);
    j = skipBlanks(text, Math.max(item.end, j + 1));
  }
  const every = hasDefault ? intersection(items.map((it) => it.every)) : NOTHING;
  return { end: j + 'endcase'.length, some: union(items.map((it) => it.some)), every };
}

/** A loop may run no time: what it assigns is assigned on some path only. */
function loopStatement(text: string, i: number): Assigned {
  const body = statementAssigns(text, afterParentheses(text, i));
  return { end: body.end, some: body.some, every: NOTHING };
}

/** What the statement at "from" assigns, on some path and on every path (Verilog, blanked code). */
function statementAssigns(text: string, from: number): Assigned {
  const i = skipBlanks(text, from);
  if (i >= text.length) return { end: text.length, some: NOTHING, every: NOTHING };
  if (text[i] === ';') return { end: i + 1, some: NOTHING, every: NOTHING };
  return (STATEMENT_BY_KEYWORD.get(wordAt(text, i)) ?? simpleStatement)(text, i);
}

/** The statements that hold others, by their first word; any other statement is simple. A Map: a name like `toString` is no keyword. */
const STATEMENT_BY_KEYWORD: ReadonlyMap<string, (text: string, i: number) => Assigned> = new Map([
  ['begin', blockStatement],
  ['if', ifStatement],
  ['case', caseStatement],
  ['casez', caseStatement],
  ['casex', caseStatement],
  ['for', loopStatement],
  ['while', loopStatement],
  ['repeat', loopStatement],
]);

/**
 * Verilog: an `always` without an edge that keeps a value: a variable some path through the
 * block leaves unassigned (an `if` without `else`, a `case` without `default`), or one
 * assigned from itself (`x <= x + 1`). Without a clock that is a latch (Quartus Warning
 * 10240). A variable every path assigns is plain logic, whatever order the lines are in
 * (`y <= x; x <= a;`). An `always_latch` is a latch on purpose.
 */
export function verilogLevelStorage(t: UnitText): Found[] {
  return alwaysBlocks(t).flatMap(({ block, edges, latch, body }) => {
    if (edges.length > 0 || latch) return [];
    const targets = verilogTargets(body);
    const keepsItself = (name: string) => targets.some((m) => m[1] === name && mentions(assignedValue(body, m), name));
    const assigned = statementAssigns(body, 0);
    const kept = unique([...assigned.some]).filter((name) => keepsItself(name) || !assigned.every.has(name));
    return kept.length === 0 ? [] : [{ line: block.span.start, register: verilogProblem('latch', kept, []) }];
  });
}
