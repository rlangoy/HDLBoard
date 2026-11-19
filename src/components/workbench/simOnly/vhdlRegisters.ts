// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * VHDL processes whose clock edges no register template has (docs/impl_sim_only_warnings.md
 * § 3.4). Synthesis builds a register (a flip-flop) from one clock edge, plus an optional
 * asynchronous reset or set tested as a level before it. The `if`s of each process are
 * walked token by token; the simulator runs the other shapes too. Pure.
 */

import type { UnitText } from '../tbDetect/rules';
import { escapeRegExp } from './constructText';
import { ALL_BITS, vhdlBits } from './bits';
import type { Found } from './constructs';
import { testsLevelOf } from './vhdlEdges';
import { vhdlConcatFeedback, vhdlWiringBounds, type BoundsOf } from './vhdlWiring';
import { feedsBack, registerFound, SAME_NAME, type BitAlignment, type SelectedBits, synthesizedBlockText, tidy, twoClocks, unique, type Clocked, type Target } from './registerShared';
import type { RegisterProblem, RegisterProblemKind } from './types';

const sameName = SAME_NAME.vhdl;

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
const targetNames = (text: string): string[] => unique([...text.matchAll(VHDL_TARGET)].map((m) => m[1]), sameName);

/** The targets of `text`, with their bits. */
const targetsWithBits = (text: string): Target[] => [...text.matchAll(VHDL_TARGET)].map((m) => ({ name: m[1], bits: vhdlBits(m[2]) }));

const IF_TOKEN = /\bend\s+if\b|\b(?:elsif|if|else|then|when)\b|=>|;/gi;

interface Violation {
  /** Offset in the process text of the branch. */
  readonly at: number;
  readonly kind: RegisterProblemKind;
  readonly clocks: readonly string[];
}

/** A branch before the clock edge, tested as a level: a reset or set. */
interface LevelBranch {
  /** Offset in the process text of its condition. */
  readonly at: number;
  readonly condition: string;
  readonly body: string;
}

/** One open `if`: where it starts, the edges of its branches, and the branches that break the template. */
interface Chain {
  readonly from: number;
  readonly edges: Edge[];
  readonly bad: Violation[];
  /** Its branches before any edge, done. */
  readonly levels: LevelBranch[];
  /** The level branch being read: its condition, and where its statements start. */
  open?: { readonly at: number; readonly condition: string; readonly from: number };
}

/** A finding at an offset of the process text. */
interface FoundAt {
  readonly at: number;
  readonly register: RegisterProblem;
}

interface Walk {
  readonly boundsOf: BoundsOf;
  /** The process as synthesis reads it (translate_off blanked). */
  readonly text: string;
  /** The unit's signals, ports and variables, lowercase: a reset or set that reads one loads a value. */
  readonly signals: ReadonlySet<string>;
  readonly chains: Chain[];
  readonly found: FoundAt[];
  /** The process's outermost `if`s that have an edge, by their offset, in order. */
  readonly clocked: Clocked<number>[];
  /** Where the condition being read starts, or -1. */
  condition: number;
  /** Inside `x <= a when c else b`, whose `else` is not a branch. */
  conditionalAssignment: boolean;
}

/** The innermost `if` being read. */
const innermostIf = (w: Walk): Chain | undefined => w.chains[w.chains.length - 1];

const problem = (kind: RegisterProblemKind, registers: readonly string[], clocks: readonly string[]): RegisterProblem =>
  ({ kind, registers, clocks, language: 'vhdl' });

/** What a branch with these edges does wrong, after the edges of the branches before it. */
function violation(before: readonly Edge[], edges: readonly Edge[], at: number): Violation | undefined {
  // Two edges in one condition (10628).
  if (edges.length > 1) return { at, kind: 'combined-edges', clocks: unique(edges.map((e) => e.clock), sameName) };
  const [first] = before;
  if (!first) return undefined;
  const [edge] = edges;
  // A branch without an edge after the edge (10818).
  if (!edge) return { at, kind: 'outside-edge', clocks: [first.clock] };
  if (!sameName(edge.clock, first.clock)) return { at, kind: 'two-clocks', clocks: [first.clock, edge.clock] };
  // Both edges of one clock (10819); the same edge twice is a branch the register can't hold.
  return { at, kind: edge.kind === first.kind ? 'outside-edge' : 'both-edges', clocks: [first.clock] };
}

/** `if clk'event then` with no level test of `clk`: the register would take both edges (Quartus Error 10633). */
function eventWithoutLevel(edges: readonly Edge[], condition: string, at: number): Violation | undefined {
  const bare = edges.find((e) => e.kind === 'event' && !testsLevelOf(e.clock, condition));
  return bare ? { at, kind: 'both-edges', clocks: [bare.clock] } : undefined;
}

/** A condition ends at its `then`: its edges are checked against the branches before it. */
function endCondition(w: Walk, at: number): void {
  const chain = innermostIf(w);
  if (!chain || w.condition < 0) return;
  const condition = w.text.slice(w.condition, at);
  const edges = edgesIn(condition);
  const bad = violation(chain.edges, edges, w.condition) ?? eventWithoutLevel(edges, condition, w.condition);
  if (bad) chain.bad.push(bad);
  if (edges.length === 0 && chain.edges.length === 0) chain.open = { at: w.condition, condition, from: at + 'then'.length };
  chain.edges.push(...edges);
  w.condition = -1;
  w.conditionalAssignment = false;
}

/** The level branch being read ends at its `elsif`, `else` or `end if`. */
function closeLevel(w: Walk, chain: Chain | undefined, at: number): void {
  if (!chain?.open) return;
  const { at: conditionAt, condition, from } = chain.open;
  chain.levels.push({ at: conditionAt, condition, body: w.text.slice(from, at) });
  chain.open = undefined;
}

/** Each assignment of a branch: its target, and its value up to the `;`. */
function assignmentsIn(body: string): { target: string; index: string; value: string }[] {
  return [...body.matchAll(VHDL_TARGET)].map((m) => {
    const from = (m.index ?? 0) + m[0].length;
    const end = body.indexOf(';', from);
    return { target: m[1], index: (m[2] ?? '').trim(), value: body.slice(from, end < 0 ? body.length : end) };
  });
}

/**
 * Whether a value reads the bits its target writes: the whole signal, or the same index
 * (`c(0) <= c(0) xor a`). Another index is another bit (`q(0) <= q(1)`), no counting.
 */
function readsItsOwnBits(value: string, target: string, index: string): boolean {
  // Compared as written without blanks; the bits read from the text as written (`3 downto 0`).
  const select = (raw: string): SelectedBits => ({ text: tidy(raw).toLowerCase(), bits: raw.trim() === '' ? ALL_BITS : vhdlBits(raw.trim()) });
  const reads = new RegExp(`\\b${escapeRegExp(target)}\\b(?!\\s*')\\s*(\\([^()]*\\))?`, 'gi');
  return [...value.matchAll(reads)].some((m) => feedsBack(select(m[1] ?? ''), select(index), vhdlAlignment(value)));
}

/**
 * `aligned` when the value is names, selects and blanked literals joined only by `not`,
 * `and`, `or`, `xor`, `nand`, `nor` and `xnor`; else `mixed` (`+`, `&` concatenation, a
 * function).
 */
function vhdlAlignment(value: string): BitAlignment {
  const shape = value
    .replace(/\b(?:not|and|or|xor|nand|nor|xnor)\b/gi, '~')
    .replace(/[A-Za-z]\w*(?:\s*\([^()]*\))?/g, 'X')
    .replace(/\s+/g, '');
  return /^[X~()]*$/.test(shape) && shape.includes('X') ? 'aligned' : 'mixed';
}

/** The signals a text reads, lowercase; `q'length` asks about `q`, it reads no value of it. */
const signalsRead = (text: string, signals: ReadonlySet<string>): string[] =>
  (text.match(/\b[A-Za-z]\w*\b(?!\s*')/g) ?? []).map((name) => name.toLowerCase()).filter((name) => signals.has(name));

/**
 * A reset or set branch that computes a register from itself (`c <= c + 1`) is a second clock. Else the quiet
 * notes of a clocked `if`'s resets and sets, which Quartus builds from latches
 * (Warning 13004): an asynchronous reset and set of one signal, or a branch that loads a
 * signal, not a constant (`if rst = '1' then q <= data;`). Constants, generics, `others`
 * and attributes are fixed; any name not known as a signal too: unsure is quiet.
 */
function levelNotes(levels: readonly LevelBranch[], { signals, boundsOf }: Pick<Walk, 'signals' | 'boundsOf'>): FoundAt[] {
  const levelSignals = (branches: readonly LevelBranch[]) => unique(branches.flatMap((l) => signalsRead(l.condition, signals)), sameName);
  for (const level of levels) {
    // `if a = '1' then c <= c + 1;`: a reset loads a constant, so a branch that counts is a second clock (Quartus Warning 13004; the board does not count).
    // Only an assignment that reads its own target counts: `q <= d` loads another register, an asynchronous load.
    const counting = assignmentsIn(level.body).filter((a) =>
      vhdlConcatFeedback(a.target + a.index, a.value, boundsOf) ?? readsItsOwnBits(a.value, a.target, a.index),
    );
    if (counting.length > 0) return [{ at: level.at, register: problem('two-clocks', unique(counting.map((a) => a.target), sameName), levelSignals([level])) }];
  }
  const assigned = levels.map((l) => new Set(assignmentsIn(l.body).map((a) => a.target.toLowerCase())));
  const both = unique(assigned.flatMap((names, i) => [...names].filter((n) => assigned.slice(i + 1).some((later) => later.has(n)))), sameName);
  if (both.length > 0) return [{ at: levels[1].at, register: problem('set-and-reset', both, levelSignals(levels)) }];
  for (const level of levels) {
    const loading = assignmentsIn(level.body).filter((a) => signalsRead(a.value, signals).length > 0);
    if (loading.length > 0) return [{ at: level.at, register: problem('async-load', unique(loading.map((a) => a.target), sameName), levelSignals([level])) }];
  }
  return [];
}

/** The `if` is complete: each bad branch is reported with what the whole `if` assigns; an outermost clocked one is kept. */
function endIf(w: Walk, at: number): void {
  const chain = w.chains.pop();
  if (!chain) return;
  const text = w.text.slice(chain.from, at);
  const registers = targetNames(text);
  for (const bad of chain.bad) w.found.push({ at: bad.at, register: problem(bad.kind, registers, bad.clocks) });
  const [edge] = chain.edges;
  if (edge && chain.bad.length === 0) w.found.push(...levelNotes(chain.levels, w));
  const isOutermost = w.chains.length === 0;
  if (!isOutermost || !edge) return;
  const direction = edge.kind === 'event' ? undefined : edge.kind;
  w.clocked.push({ part: chain.from, clock: edge.clock, edge: direction, targets: targetsWithBits(text) });
}

const STEP: Readonly<Record<string, (w: Walk, at: number) => void>> = {
  if: (w, at) => {
    w.chains.push({ from: at, edges: [], bad: [], levels: [] });
    w.condition = at;
  },
  elsif: (w, at) => {
    closeLevel(w, innermostIf(w), at);
    w.condition = at;
  },
  then: endCondition,
  else: (w, at) => {
    const chain = innermostIf(w);
    if (!chain || w.conditionalAssignment) return;
    closeLevel(w, chain, at);
    if (chain.edges.length > 0) chain.bad.push({ at, kind: 'outside-edge', clocks: [chain.edges[0].clock] });
  },
  'end if': (w, at) => {
    closeLevel(w, innermostIf(w), at);
    endIf(w, at);
  },
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

function processViolations(text: string, context: Pick<Walk, 'signals' | 'boundsOf'>): FoundAt[] {
  const walk: Walk = { text, ...context, chains: [], found: [], clocked: [], condition: -1, conditionalAssignment: false };
  for (const m of text.matchAll(IF_TOKEN)) STEP[m[0].toLowerCase().replace(/\s+/g, ' ')](walk, m.index ?? 0);
  // Two `if`s of one process on two clocks, or both edges of one, that assign one signal (Quartus Errors 10820, 10819).
  const clashes = twoClocks(walk.clocked, sameName).map((c): FoundAt => ({ at: c.later, register: problem(c.kind, c.registers, c.clocks) }));
  return [...walk.found, ...clashes].sort((a, b) => a.at - b.at);
}

const DECLARED = /\b(?:signal|variable)\s+([A-Za-z]\w*(?:\s*,\s*[A-Za-z]\w*)*)\s*:/gi;

/** The unit's ports, signals and variables, lowercase. */
function unitSignals(t: UnitText): Set<string> {
  const declared = [...t.code.matchAll(DECLARED)].flatMap((m) => m[1].split(',').map((name) => name.trim()));
  return new Set([...t.unit.portNames, ...declared].map((name) => name.toLowerCase()));
}

/**
 * VHDL: every branch of a process's `if` that puts a clock edge where no register can be
 * built; and, quiet, the resets and sets Quartus builds from latches.
 */
export function vhdlEdgeTemplate(t: UnitText): Found[] {
  const signals = unitSignals(t);
  const boundsAt = vhdlWiringBounds(t.code);
  return t.unit.blocks
    .filter((b) => b.kind === 'process')
    .flatMap((b) => {
      const boundsOf = boundsAt(t.lineOf(b.from) - t.lineOf(t.base) + 1);
      return processViolations(synthesizedBlockText(t, b), { signals, boundsOf }).map(({ at, register }) => registerFound(t.lineOf(b.from + at), register));
    });
}
