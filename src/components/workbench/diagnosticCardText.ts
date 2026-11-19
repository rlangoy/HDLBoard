// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The problem card's text (DiagnosticCard.tsx): a message body split into prose and
 * code, and the plain text the Copy button puts on the clipboard. Pure.
 */

/** A run of prose lines, or of code lines (indented by two spaces in the message). */
export interface TextBlock {
  readonly kind: 'text' | 'code';
  readonly lines: readonly string[];
}

const CODE_LINE = /^ {2}/;

/** The body's lines grouped into prose and code; code lines lose their two-space indent. */
export function textBlocks(body: string): TextBlock[] {
  const blocks: { kind: TextBlock['kind']; lines: string[] }[] = [];
  for (const line of body.split('\n')) {
    const kind = CODE_LINE.test(line) ? 'code' : 'text';
    const last = blocks[blocks.length - 1];
    const text = kind === 'code' ? line.slice(2) : line;
    if (last?.kind === kind) last.lines.push(text);
    else blocks.push({ kind, lines: [text] });
  }
  return blocks.filter((b) => b.lines.some((l) => l.trim() !== ''));
}

/**
 * What Copy puts on the clipboard: where, the line itself, then the message as the
 * tooltip words it, so it can be pasted to a teacher or into a chat as it is.
 */
export function copyableText(place: { readonly fileName: string; readonly line: number }, codeLine: string | undefined, description: string): string {
  const where = `${place.fileName}, line ${place.line}`;
  const code = codeLine === undefined || codeLine.trim() === '' ? [] : [`${place.line} | ${codeLine.trimEnd()}`];
  return [where, ...code, '', description].join('\n');
}
