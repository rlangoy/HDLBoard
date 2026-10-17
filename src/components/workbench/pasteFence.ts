// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Code copied from a chat or a Markdown page often comes wrapped in a fence:
 *
 *     ```vhdl
 *     entity counter is ...
 *     ```
 *
 * Pasted into the editor as is, the fence lines are compile errors. When the
 * whole paste is one fenced block (blank lines around it allowed), this gives
 * back just the code inside; anything else — prose around the block, several
 * blocks, an unclosed fence — is left exactly as it was pasted.
 */

// An opening fence: three or more backticks or tildes, an optional language
// tag ("vhdl", "verilog", "systemverilog {.numberLines}"), nothing after it.
const OPEN = /^[ \t]*(`{3,}|~{3,})[ \t]*[^`\r\n]*$/;

export function unwrapCodeFence(pasted: string): string | null {
  const lines = pasted.split(/\r\n|\r|\n/);
  let first = 0;
  let last = lines.length - 1;
  while (first <= last && lines[first].trim() === '') first++;
  while (last >= first && lines[last].trim() === '') last--;
  if (last - first < 1) return null;

  const open = OPEN.exec(lines[first]);
  if (!open) return null;
  const fence = open[1];
  // The closing fence: the same character, at least as many, and nothing else.
  const close = lines[last].trim();
  if (close.length < fence.length || close !== fence[0].repeat(close.length)) return null;

  const body = lines.slice(first + 1, last);
  // A second fence inside means several blocks with text between: not ours to cut.
  if (body.some((line) => OPEN.test(line) && line.trim().startsWith(fence[0].repeat(3)))) return null;
  const eol = pasted.includes('\r\n') ? '\r\n' : '\n';
  return body.length === 0 ? '' : body.join(eol) + eol;
}
