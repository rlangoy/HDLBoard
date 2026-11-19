// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * VHDL processes whose clock edges no register template has (docs/impl_sim_only_warnings.md
 * § 3.4). Synthesis builds a register (a flip-flop) from one clock edge, plus an optional
 * asynchronous reset or set tested as a level before it. The `if`s of each process are
 * walked token by token; the simulator runs the other shapes too. Pure.
 */

import type { UnitText } from '../tbDetect/rules';
import { vhdlBits } from './bits';
import type { Found } from './constructs';
import { SAME_NAME, synthesizedBlockText, tidy, twoClocks, unique, type Clocked, type Target } from './registerShared';
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

/** One open `if`: where it starts, the edges of its branches, and the branches that break the template. */
interface Chain {
  readonly from: number;
  readonly edges: Edge[];
  readonly bad: Violation[];
}

/** A finding at an offset of the process text. */
interface FoundAt {
  readonly at: number;
  readonly register: RegisterProblem;
}

interface Walk {
  /** The process as synthesis reads it (translate_off blanked). */
  readonly text: string;
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
  const text = w.text.slice(chain.from, at);
  const registers = targetNames(text);
  for (const bad of chain.bad) w.found.push({ at: bad.at, register: problem(bad.kind, registers, bad.clocks) });
  const [edge] = chain.edges;
  const isOutermost = w.chains.length === 0;
  if (!isOutermost || !edge) return;
  w.clocked.push({ part: chain.from, clock: edge.clock, targets: targetsWithBits(text) });
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

function processViolations(text: string): FoundAt[] {
  const walk: Walk = { text, chains: [], found: [], clocked: [], condition: -1, conditionalAssignment: false };
  for (const m of text.matchAll(IF_TOKEN)) STEP[m[0].toLowerCase().replace(/\s+/g, ' ')](walk, m.index ?? 0);
  // Two `if`s of one process on two clocks that assign one signal (Quartus Error 10820).
  const clashes = twoClocks(walk.clocked, sameName).map((c): FoundAt => ({ at: c.later, register: problem('two-clocks', c.registers, c.clocks) }));
  return [...walk.found, ...clashes].sort((a, b) => a.at - b.at);
}

/** VHDL: every branch of a process's `if` that puts a clock edge where no register can be built. */
export function vhdlEdgeTemplate(t: UnitText): Found[] {
  return t.unit.blocks
    .filter((b) => b.kind === 'process')
    .flatMap((b) => processViolations(synthesizedBlockText(t, b)).map(({ at, register }) => ({ line: t.lineOf(b.from + at), register })));
}
