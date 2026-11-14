// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Explaining a circular `include. Icarus expands an unguarded loop of headers until it
 * runs out of open files, then reports the header it was opening as "not found" —
 * although the student's project holds it. When Icarus names a header that exists, the
 * loop it sits on is traced through the project's `include lines and added to the
 * compiler's message, which is kept as it was.
 *
 * Only a failed compile is explained, so a project whose loops include guards or an
 * inactive `ifdef branch make harmless is never told about them. The scan does not
 * evaluate directives, though: when a header is on several loops, the shortest is named,
 * which may be a harmless one. A quoted `include of a plain name is followed; an
 * `include <name> or one named by a macro is not, and leaves the message unchanged.
 * Pure: it reads text and touches nothing.
 *
 * The frontend recognises the note by its wording (src/components/workbench/diagnostics.ts).
 */

import type { VhdlFileInput } from '../protocol.js';

/** `./cycle_a.vh:3: Include file cycle_b.vh not found` — the header is the captured group. */
const MISSING_INCLUDE = /^.+?:\d+: Include file (.+) not found\r?$/gm;

/** Comments and string literals are skipped; only the `include directives are captured. */
const COMMENT_STRING_OR_INCLUDE = /\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|`include\s+"([^"\n]+)"|"(?:[^"\\\n]|\\.)*"/g;

/** Project files have plain names, so `./name` and `name` are the same file. */
const SESSION_DIRECTORY_PREFIX = /^(?:\.\/)+/;

/** Which headers each project file includes, by name. */
type IncludeGraph = ReadonlyMap<string, readonly string[]>;

const projectFileName = (included: string): string => included.replace(SESSION_DIRECTORY_PREFIX, '');

/** The project files a source includes, in source order, outside comments and strings. */
export function includedNames(source: string): string[] {
  return [...source.matchAll(COMMENT_STRING_OR_INCLUDE)]
    .map(([, included]) => included)
    .filter((included): included is string => included !== undefined)
    .map(projectFileName);
}

function includeGraph(files: readonly VhdlFileInput[]): IncludeGraph {
  return new Map(files.map((file) => [file.name, includedNames(file.content)]));
}

/** The chain from the search's start to `end`, following each file back to the one that included it. */
function chainEndingAt(end: string, includedBy: ReadonlyMap<string, string>): string[] {
  const chain = [end];
  for (let file = includedBy.get(end); file !== undefined; file = includedBy.get(file)) chain.unshift(file);
  return chain;
}

/**
 * The shortest chain of includes that leads from `start` back to it, beginning and
 * ending with `start`; undefined when no chain does. Breadth first, so a header that
 * includes itself is found as `[start, start]`.
 */
export function findIncludeCycle(graph: IncludeGraph, start: string): string[] | undefined {
  const includedBy = new Map<string, string>();
  const queue = [start];
  for (const file of queue) {
    for (const included of graph.get(file) ?? []) {
      if (included === start) return [...chainEndingAt(file, includedBy), start];
      if (includedBy.has(included) || !graph.has(included)) continue;
      includedBy.set(included, file);
      queue.push(included);
    }
  }
  return undefined;
}

function cycleNote(header: string, cycle: readonly string[]): string {
  return (
    `${header} exists, but its includes form a loop: ${cycle.join(' → ')}. ` +
    'Icarus opens the headers again on every pass until it runs out of files, then reports one as not found. ' +
    'Guard each header with `ifndef NAME / `define NAME … `endif, or remove one of the includes.'
  );
}

/** The first header Icarus reported as not found that is on a loop, with that loop. */
function firstLoopReported(compilerText: string, graph: IncludeGraph): { header: string; cycle: string[] } | undefined {
  for (const [, reported = ''] of compilerText.matchAll(MISSING_INCLUDE)) {
    const header = projectFileName(reported);
    const cycle = findIncludeCycle(graph, header);
    if (cycle !== undefined) return { header, cycle };
  }
  return undefined;
}

/**
 * The compiler's text, followed by the include loop when Icarus reports a header of the
 * project as missing and that header is on one; otherwise the text unchanged.
 */
export function explainMissingInclude(compilerText: string, files: readonly VhdlFileInput[]): string {
  const loop = firstLoopReported(compilerText, includeGraph(files));
  return loop === undefined ? compilerText : `${compilerText}\n\n${cycleNote(loop.header, loop.cycle)}`;
}
