// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What a Verilog file's directives decide that the editor's own reading cannot see: which
 * headers it really includes, and whether a macro from elsewhere picks its code. The
 * editor evaluates `ifdef against the file's own `define`s only (tbDetect/blank.ts), as
 * Icarus does without -D; a macro from an included header or the project's compiler
 * options can pick another branch than the one the editor shows. Pure.
 */

import { blankSource } from './tbDetect/blank';

/** The macro the editor and the simulator both leave undefined, so it never hides a branch. */
const KNOWN_UNDEFINED = 'SYNTHESIS';

/**
 * The header names the file includes where the simulator compiles it: not in a comment,
 * not in an inactive `ifdef branch. The blanker keeps an active `include` in place and
 * blanks its quoted name, at the same offsets, so the name is read from the original text.
 */
export function activeIncludes(content: string): string[] {
  const blanked = blankSource('verilog', content).code;
  return [...blanked.matchAll(/`include\b/g)].flatMap((directive) => {
    const quoted = /^`include\s+"([^"]+)"/.exec(content.slice(directive.index ?? 0));
    return quoted ? [quoted[1].split('/').pop() ?? quoted[1]] : [];
  });
}

/**
 * Whether an `ifdef / `ifndef / `elsif tests a macro the file does not `define` itself:
 * then the branch the simulator compiles may not be the one the editor reads.
 */
export function dependsOnOutsideMacros(content: string): boolean {
  const code = withoutComments(content);
  const defined = new Set([...code.matchAll(/`define\s+(\w+)/g)].map((m) => m[1]));
  const tested = [...code.matchAll(/`(?:ifdef|ifndef|elsif)\s+(\w+)/g)].map((m) => m[1]);
  return tested.some((name) => name !== KNOWN_UNDEFINED && !defined.has(name));
}

function withoutComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
}
