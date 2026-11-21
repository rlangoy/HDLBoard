// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What a Verilog file's directives decide that the editor's own reading cannot be sure of:
 * which headers it really includes, and whether conditional compilation picks its code.
 * The editor evaluates `ifdef against the file's own `define`s only (tbDetect/blank.ts);
 * a macro from an included header, a nested include or the project's compiler options
 * (-D, SYNTHESIS too) can make Icarus compile other code. Rather than a second
 * preprocessor, a file with conditional compilation counts as uncertain. Pure; each
 * file's scan is kept while its text is unchanged.
 */

import { blankSource } from './tbDetect/blank';
import { sourceTokens } from './symbols/sourceTokens';
import { tokenizeVerilog } from './verilogHighlight';

export interface VerilogScan {
  /**
   * The header names the file includes where the simulator compiles it (not in a comment,
   * not in an inactive `ifdef branch), without their folder.
   */
  readonly includes: readonly string[];
  /** It has an `ifdef / `ifndef / `elsif directive: what it compiles may differ from what the editor shows. */
  readonly conditional: boolean;
}

const CONDITIONAL_DIRECTIVES: ReadonlySet<string> = new Set(['`ifdef', '`ifndef', '`elsif']);

/** Scans kept; past this many, the cache starts over (a project rarely has so many Verilog files). */
const MAX_CACHED_SCANS = 256;
const scans = new Map<string, VerilogScan>();

export function scanVerilog(content: string): VerilogScan {
  const cached = scans.get(content);
  if (cached) return cached;
  if (scans.size >= MAX_CACHED_SCANS) scans.clear();
  const scan = { includes: activeIncludes(content), conditional: hasConditionalDirective(content) };
  scans.set(content, scan);
  return scan;
}

/**
 * The blanker keeps an active `include` in place and blanks its quoted name, at the same
 * offsets, so the name is read from the original text.
 */
function activeIncludes(content: string): string[] {
  if (!content.includes('`include')) return [];
  const blanked = blankSource('verilog', content).code;
  return [...blanked.matchAll(/`include\b/g)].flatMap((directive) => {
    const quoted = /^`include\s+"([^"]+)"/.exec(content.slice(directive.index ?? 0));
    return quoted ? [quoted[1].split('/').pop() ?? quoted[1]] : [];
  });
}

/** From the lexer's directive tokens, so a comment or a string that spells `ifdef` is no directive. */
function hasConditionalDirective(content: string): boolean {
  // Most files spell no directive at all: they need no lexer.
  if (!/`(?:ifdef|ifndef|elsif)\b/.test(content)) return false;
  const tokens = sourceTokens(tokenizeVerilog(content.split('\n')));
  return tokens.some((token) => token.type === 'directive' && CONDITIONAL_DIRECTIVES.has(token.text));
}
