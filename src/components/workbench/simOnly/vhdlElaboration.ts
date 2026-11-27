// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The functions of a VHDL unit that only run while the design is elaborated
 * (docs/impl_sim_only_warnings.md § 3.3). Each call computes a constant, or a
 * signal's type or initial value, or comes from another such function. Synthesis
 * evaluates them once, before any hardware exists, so their bodies build none:
 * `constant BLOCKS : integer_vector := compute_blocks;`. Found by pattern, like
 * vhdlScopes.ts finds the bodies. Pure.
 */

import type { UnitText } from '../tbDetect/rules';
import { regionsIn } from '../vhdlScopes';
import { closingBracket } from './brackets';
import { inside, matchesIn, wordBefore, type Range } from './constructText';
import { isHidden } from './scan';

interface Subprogram extends Range {
  /** Lower case, as VHDL compares names. */
  readonly name: string;
  /** A function with a body; a procedure or a declaration alone is never evaluated once. */
  readonly isFunctionBody: boolean;
  /** A function or procedure with a body, not a declaration alone. */
  readonly hasBody: boolean;
  /**
   * Declared inside an architecture (its declarations or a process): seen only there, so
   * every call of it is in this unit's code. One in an entity's declarations may be called
   * from an architecture in another file, which this unit's code does not hold.
   */
  readonly local: boolean;
}

const SUBPROGRAM_NAME = /^(function|procedure)\s+(\w+)/i;
const ARCHITECTURE = /\barchitecture\s+(\w+)\s+of\s+\w+\s+is\b/gi;

/** Where the unit's architectures are, in its code: from `architecture a of e is` to its `end architecture` or `end a`. */
function architectureRegions(code: string): Range[] {
  return [...code.matchAll(ARCHITECTURE)].map((m) => {
    const from = m.index ?? 0;
    const end = new RegExp(`\\bend\\s+(?:architecture\\b|${m[1]}\\b)`, 'i').exec(code.slice(from));
    return { from, to: end ? from + end.index + end[0].length : code.length };
  });
}
/** Declarations evaluated once, at elaboration: `constant C : T := …;`, `signal s : T(…) := …;`. */
const ONCE_DECLARATION = /\b(?:constant|signal)\s+\w+(?:\s*,\s*\w+)*\s*:[^;]*;/gi;

/** Every function and procedure of the unit, at file offsets. */
/** `generic ( … )` lists (not `generic map`): a `function op … is <>` there is a formal, no body. */
function genericLists(code: string): Range[] {
  return [...code.matchAll(/\bgeneric\s*\(/gi)].map((m) => {
    const open = (m.index ?? 0) + m[0].length - 1;
    const close = closingBracket(code, open);
    return { from: open, to: close < 0 ? code.length : close };
  });
}

function subprogramsOf(t: UnitText): Subprogram[] {
  const architectures = architectureRegions(t.code);
  const generics = genericLists(t.code);
  return regionsIn(t.code.split('\n'))
    .filter((region) => region.kind === 'subprogram' && !inside(region.start, generics))
    .flatMap((region) => {
      const text = t.code.slice(region.start, region.end);
      const header = SUBPROGRAM_NAME.exec(text);
      if (!header) return [];
      const hasBody = /\bbegin\b/i.test(text);
      const isFunctionBody = header[1].toLowerCase() === 'function' && hasBody;
      const local = inside(region.start, architectures);
      return [{ name: header[2].toLowerCase(), isFunctionBody, hasBody, local, from: t.base + region.start, to: t.base + region.end }];
    });
}

/**
 * Where the unit names `body` outside the body itself, in code synthesis reads: its
 * calls. The name a header declares is none (`function f` of a declaration before the body).
 */
function callsOf(t: UnitText, body: Subprogram): number[] {
  return matchesIn(t, new RegExp(`\\b${body.name}\\b`, 'gi'))
    .filter(([at]) => !/^(?:function|procedure)$/i.test(wordBefore(t.code, at - t.base)))
    .map(([at]) => at)
    .filter((at) => !inside(at, [body]) && !isHidden(t.lineOf(at), t.simOnlyRegions));
}

/** The innermost subprogram around file offset `at`, if any. */
function innermostAt(subprograms: readonly Subprogram[], at: number): Subprogram | undefined {
  return subprograms.filter((s) => inside(at, [s])).sort((a, b) => b.from - a.from)[0];
}

/**
 * The bodies of the functions and procedures that code synthesis reads never calls, also
 * through others: every call of one is inside another such body (a helper nothing calls,
 * or each other). Nothing in them runs, neither while elaborating nor on the board.
 * riscv_vhdl's `otp_clocked` declares an `init_ram` that reads a file, but its call is
 * commented out (`signal ram : ram_type;-- := init_ram(init_file);`); Quartus builds it.
 */
export function uncalledSubprograms(t: UnitText): readonly Range[] {
  const bodies = subprogramsOf(t).filter((s) => s.hasBody && s.local);
  const calls = new Map(bodies.map((body) => [body, callsOf(t, body)]));
  // Start from every body and drop the ones called from code that runs, until none is.
  const uncalled = new Set(bodies);
  for (let changed = true; changed; ) {
    changed = false;
    for (const body of uncalled) {
      if ((calls.get(body) ?? []).every((at) => inside(at, [...uncalled]))) continue;
      uncalled.delete(body);
      changed = true;
    }
  }
  return [...uncalled];
}

/**
 * The bodies of the functions evaluated only at elaboration. A call inside another
 * subprogram counts when that subprogram is such a function too; a call anywhere else
 * counts inside a constant or signal declaration. A function that synthesis never calls
 * builds nothing either.
 */
export function elaborationFunctions(t: UnitText): readonly Range[] {
  const subprograms = subprogramsOf(t);
  const bodies = subprograms.filter((s) => s.isFunctionBody && s.local);
  if (bodies.length === 0) return [];
  const once = matchesIn(t, ONCE_DECLARATION).map(([at, m]) => ({ from: at, to: at + m[0].length }));
  const calls = new Map(bodies.map((body) => [body, callsOf(t, body)]));
  // Start from every body and drop the ones called at run time, until none is.
  const kept = new Set(bodies);
  const isOnce = (at: number) => {
    const caller = innermostAt(subprograms, at);
    return caller === undefined ? inside(at, once) : kept.has(caller);
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const body of kept) {
      if ((calls.get(body) ?? []).every(isOnce)) continue;
      kept.delete(body);
      changed = true;
    }
  }
  return [...kept];
}
