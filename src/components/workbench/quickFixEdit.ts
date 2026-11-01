// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { insertBegin, replaceWithBegin } from './beginFix';
import type { QuickFix } from './diagnosticAdvice';
import type { TextEdit } from './textLines';
import { addUseClause } from './useClauseFix';

/** The change applying `fix`, offered on 1-based `line`, makes to the file; `undefined` when it no longer applies. */
export function quickFixEdit(content: string, fix: QuickFix, line: number): TextEdit | undefined {
  switch (fix.kind) {
    case 'addUseClause':
      return addUseClause(content, fix.pkg, line);
    case 'insertBegin':
      return insertBegin(content, line);
    case 'replaceWithBegin':
      return replaceWithBegin(content, line);
  }
}
