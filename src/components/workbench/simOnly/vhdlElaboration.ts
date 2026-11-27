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
import { inside, matchesIn, type Range } from './constructText';
import { isHidden } from './scan';

interface Subprogram extends Range {
  /** Lower case, as VHDL compares names. */
  readonly name: string;
  /** A function with a body; a procedure or a declaration alone is never evaluated once. */
  readonly isFunctionBody: boolean;
}

const SUBPROGRAM_NAME = /^(function|procedure)\s+(\w+)/i;
/** Declarations evaluated once, at elaboration: `constant C : T := …;`, `signal s : T(…) := …;`. */
const ONCE_DECLARATION = /\b(?:constant|signal)\s+\w+(?:\s*,\s*\w+)*\s*:[^;]*;/gi;

/** Every function and procedure of the unit, at file offsets. */
function subprogramsOf(t: UnitText): Subprogram[] {
  return regionsIn(t.code.split('\n'))
    .filter((region) => region.kind === 'subprogram')
    .flatMap((region) => {
      const text = t.code.slice(region.start, region.end);
      const header = SUBPROGRAM_NAME.exec(text);
      if (!header) return [];
      const isFunctionBody = header[1].toLowerCase() === 'function' && /\bbegin\b/i.test(text);
      return [{ name: header[2].toLowerCase(), isFunctionBody, from: t.base + region.start, to: t.base + region.end }];
    });
}

/**
 * Where the unit names `body` outside the body itself, in code synthesis reads: its
 * calls. The name a header declares is none (`function f` of a declaration before the body).
 */
function callsOf(t: UnitText, body: Subprogram): number[] {
  return matchesIn(t, new RegExp(`(?<!\\b(?:function|procedure)\\s+)\\b${body.name}\\b`, 'gi'))
    .map(([at]) => at)
    .filter((at) => !inside(at, [body]) && !isHidden(t.lineOf(at), t.simOnlyRegions));
}

/** The innermost subprogram around file offset `at`, if any. */
function innermostAt(subprograms: readonly Subprogram[], at: number): Subprogram | undefined {
  return subprograms.filter((s) => inside(at, [s])).sort((a, b) => b.from - a.from)[0];
}

/**
 * The bodies of the functions evaluated only at elaboration. A call inside another
 * subprogram counts when that subprogram is such a function too; a call anywhere else
 * counts inside a constant or signal declaration. A function that synthesis never calls
 * builds nothing either.
 */
export function elaborationFunctions(t: UnitText): readonly Range[] {
  const subprograms = subprogramsOf(t);
  const bodies = subprograms.filter((s) => s.isFunctionBody);
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
