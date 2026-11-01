// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { insertBegin } from './beginFix';
import type { QuickFix } from './diagnosticAdvice';
import { addUseClause, type TextInsertion } from './useClauseFix';

/** What applying `fix`, offered on 1-based `line`, inserts into the file; `undefined` when it no longer applies. */
export function quickFixInsertion(content: string, fix: QuickFix, line: number): TextInsertion | undefined {
  return 'addUseClause' in fix ? addUseClause(content, fix.addUseClause, line) : insertBegin(content, line);
}
