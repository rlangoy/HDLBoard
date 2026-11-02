// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Quick Fix for `architecture rtl of de1_soc_top` when no file declares that
 * entity: the name after `of` becomes the entity the advice suggests. Pure.
 */

import { offsetOfLine } from './diagnosticLocation';
import { splitLines, type TextEdit } from './textLines';

/** `architecture rtl of ` up to the entity name, which is the `name` group. */
const ARCHITECTURE_OF = /^(?<before>\s*architecture\s+\w+\s+of\s+)(?<name>\w+)\b/i;

/**
 * `entity` in place of the name `written` after `of` on `line`. `undefined` when
 * that line no longer names `written` there.
 */
export function replaceEntityName(content: string, line: number, written: string, entity: string): TextEdit | undefined {
  const match = ARCHITECTURE_OF.exec(splitLines(content)[line - 1] ?? '');
  const { before, name } = match?.groups ?? {};
  if (before === undefined || name?.toLowerCase() !== written.toLowerCase()) return undefined;
  const offset = offsetOfLine(content, line) + before.length;
  return { offset, removed: name.length, text: entity, caret: offset + entity.length };
}
