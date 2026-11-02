// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The Quick Fix for `architecture rtl of de1_soc_top` when no file declares that
 * entity: the name after `of` becomes the entity the advice suggests. Pure.
 */

import { offsetOfLine } from './diagnosticLocation';
import type { TextEdit } from './textLines';
import { architectureHeaders, sameName } from './vhdlUnits';

/** The name the architecture was written with, and the entity to write instead. */
export interface EntityNameChange {
  readonly written: string;
  readonly entity: string;
}

/**
 * `entity` in place of the name `written` after `of` on `line`. `undefined` when
 * that line no longer names `written` there.
 */
export function replaceEntityName(content: string, line: number, { written, entity }: EntityNameChange): TextEdit | undefined {
  const header = architectureHeaders(content).find((h) => h.line === line);
  if (header === undefined || !sameName(header.entity, written)) return undefined;
  const offset = offsetOfLine(content, line) + header.entityStart;
  return { offset, removed: header.entity.length, text: entity, caret: offset + entity.length };
}
