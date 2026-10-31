// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, type RefObject } from 'react';
import { countLines } from './diagnosticLocation';
import { quickFixOf, type LineDiagnostic } from './diagnosticStore';
import { applyEdit } from './find/applyEdit';
import { addUseClause } from './useClauseFix';
import { showCaret } from './useRevealLine';

export interface QuickFixActions {
  /** Applies the Quick Fix offered on a 1-based line (its 💡 button); false when there is none. */
  apply(line: number): boolean;
  /** Applies the Quick Fix of the caret's line (Ctrl+.); false when there is none. */
  applyAtCaret(): boolean;
}

/**
 * Applies a Quick Fix to the file in the textarea: as one native edit, so Ctrl+Z
 * takes it out again, with the caret left on the new line, so the student sees
 * what was added. The added lines move the code below them, so the file's markers
 * would point at the wrong lines: `onApplied` clears them, as an edit by hand does.
 */
export function useQuickFix(textareaRef: RefObject<HTMLTextAreaElement>, marked: readonly LineDiagnostic[], onApplied: () => void): QuickFixActions {
  const apply = useCallback(
    (line: number): boolean => {
      const textarea = textareaRef.current;
      const marker = marked.find((m) => m.line === line);
      const fix = marker && quickFixOf(marker);
      if (!textarea || !fix) return false;
      const insertion = addUseClause(textarea.value, fix.addUseClause, line);
      if (!insertion) return false;
      applyEdit(textarea, insertion.offset, insertion.offset, insertion.text, { caret: insertion.caret });
      textarea.focus({ preventScroll: true });
      showCaret(textarea);
      onApplied();
      return true;
    },
    [textareaRef, marked, onApplied],
  );

  const applyAtCaret = useCallback((): boolean => {
    const textarea = textareaRef.current;
    return textarea ? apply(countLines(textarea.value.slice(0, textarea.selectionStart))) : false;
  }, [textareaRef, apply]);

  return { apply, applyAtCaret };
}
