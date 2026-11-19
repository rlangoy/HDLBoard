// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Edge-triggered code that is not a register template (docs/impl_sim_only_warnings.md
 * § 3.4). Quartus builds a flip-flop from one clock edge, plus an optional
 * asynchronous reset or set tested as a level before it. The simulator runs other
 * shapes too, so they are found here. Pure.
 */

import type { UnitText } from '../tbDetect/rules';
import type { CodeBlock } from '../tbDetect/types';
import { blockText } from './constructText';

/** `rising_edge(`, `falling_edge(`, or `'event`; character literals are blanked. */
const EDGE = /\b(?:rising_edge|falling_edge)\s*\(|'\s*event\b/gi;
const IF_TOKEN = /\bend\s+if\b|\b(?:elsif|if|else|then|when)\b|=>|;/gi;

/** Walking a process's `if` statements; `chains` holds, per open `if`, whether a branch had an edge. */
interface Walk {
  readonly text: string;
  readonly chains: boolean[];
  /** Offsets in `text` of the branches that break the template. */
  readonly bad: number[];
  /** Where the condition being read starts, or -1. */
  condition: number;
  /** Inside `x <= a when c else b`, whose `else` is not a branch. */
  conditionalAssignment: boolean;
}

/** A condition's `then`: two edges in it (10628), a second edge (10819/10820), or a branch after the edge (10818). */
function then(w: Walk, at: number): void {
  const last = w.chains.length - 1;
  if (last < 0 || w.condition < 0) return;
  const edges = w.text.slice(w.condition, at).match(EDGE)?.length ?? 0;
  if (edges > 1 || w.chains[last]) w.bad.push(w.condition);
  if (edges > 0) w.chains[last] = true;
  w.condition = -1;
  w.conditionalAssignment = false;
}

const STEP: Readonly<Record<string, (w: Walk, at: number) => void>> = {
  if: (w, at) => {
    w.chains.push(false);
    w.condition = at;
  },
  elsif: (w, at) => {
    w.condition = at;
  },
  then,
  // An `else` after the edge is a branch the flip-flop can't hold (10818).
  else: (w, at) => {
    if (w.chains[w.chains.length - 1] && !w.conditionalAssignment) w.bad.push(at);
  },
  'end if': (w) => {
    w.chains.pop();
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

/** The offsets in a process's text where an `if` breaks the template. */
function processViolations(text: string): number[] {
  const walk: Walk = { text, chains: [], bad: [], condition: -1, conditionalAssignment: false };
  for (const m of text.matchAll(IF_TOKEN)) STEP[m[0].toLowerCase().replace(/\s+/g, ' ')](walk, m.index ?? 0);
  return walk.bad;
}

/** VHDL: every `if` of a process that has a clock edge in a place Quartus can't build. */
export function vhdlEdgeTemplate(t: UnitText): number[] {
  return t.unit.blocks
    .filter((b) => b.kind === 'process')
    .flatMap((b) => processViolations(blockText(t, b)).map((at) => t.lineOf(b.from + at)));
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
    const edges = [...head[1].matchAll(EDGE_EVENT)].map((m) => m[1].replace(/\s+/g, ''));
    return [{ block, edges, body: text.slice(head[0].length) }];
  });
}

/** The condition of the `if` the statement starts with, after any `begin`. */
function firstIfCondition(body: string): string | undefined {
  const start = /^\s*(?:begin\b(?:\s*:\s*\w+)?\s*)?if\s*\(/.exec(body);
  if (!start) return undefined;
  let depth = 1;
  let i = start[0].length;
  for (; i < body.length && depth > 0; i++) depth += body[i] === '(' ? 1 : body[i] === ')' ? -1 : 0;
  return body.slice(start[0].length, i - 1);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const names = (condition: string, signal: string) =>
  new RegExp(`(?<![\\w.])${escape(signal)}(?![\\w.]|\\s*\\[)`).test(condition.replace(/\s+(?=\[)|(?<=\[)\s+|\s+(?=\])/g, ''));

/**
 * Verilog: `always @(posedge a or posedge b)` whose first `if` tests none of the
 * edges, so none can be the asynchronous reset or set (Quartus Error 10200).
 */
export function verilogEdgeTemplate(t: UnitText): number[] {
  return alwaysBlocks(t)
    .filter(({ edges, body }) => {
      if (edges.length < 2) return false;
      const condition = firstIfCondition(body);
      return condition === undefined || !edges.some((signal) => names(condition, signal));
    })
    .map(({ block }) => block.span.start);
}

/** `name <=` as a statement: after `;`, `)`, `begin`, `else`, or at the start. */
const NONBLOCKING_TARGET = /(?:^|[;)]|\bbegin\b|\belse\b)\s*([A-Za-z_]\w*)\s*(?:\[[^\]]*\]\s*)*<=/g;

/**
 * Verilog: an `always` without an edge that reads a variable it assigns with `<=`.
 * It keeps a value without a clock, so Quartus builds latches (Warning 10240).
 */
export function verilogLevelStorage(t: UnitText): number[] {
  return alwaysBlocks(t)
    .filter(({ edges, body }) => {
      if (edges.length > 0) return false;
      const targets = [...body.matchAll(NONBLOCKING_TARGET)];
      // The prefix is `;`, `)`, `begin` or `else`, never the target itself.
      const writes = targets.map((m) => (m.index ?? 0) + m[0].search(new RegExp(`\\b${m[1]}\\b`)));
      return [...new Set(targets.map((m) => m[1]))].some((name) =>
        [...body.matchAll(new RegExp(`\\b${name}\\b`, 'g'))].some((use) => !writes.includes(use.index ?? -1)),
      );
    })
    .map(({ block }) => block.span.start);
}
