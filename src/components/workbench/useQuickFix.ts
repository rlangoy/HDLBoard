// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { barProblem, quickFixDone, type BarProblem } from './diagnosticText';
import type { LineDiagnostic } from './diagnosticStore';
import type { EditorTab } from './EditorSurface';
import { applyEdit } from './find/applyEdit';
import { addUseClause } from './useClauseFix';
import { showCaret } from './useRevealLine';

/** A Quick Fix that went in: its note stays until the file changes again or the student clicks anywhere. */
interface Applied {
  readonly fileId: string;
  readonly content: string;
  readonly note: string;
}

export interface QuickFixState {
  /** What the problem bar shows. */
  readonly problem: BarProblem | undefined;
  /** What the last Quick Fix did, while the file is still as it left it. */
  readonly applied: string | undefined;
  /** Applies the problem's Quick Fix; false when there is none. */
  apply(): boolean;
}

/**
 * The problem bar's state for one file, and its Quick Fix: the edit goes in through
 * the textarea as one native edit, so Ctrl+Z takes it out again, and the caret
 * ends on the new line, so the student sees what was added.
 */
export function useQuickFix(
  textareaRef: RefObject<HTMLTextAreaElement>,
  file: EditorTab,
  diagnostics: readonly LineDiagnostic[],
): QuickFixState {
  const problem = useMemo(() => barProblem(diagnostics), [diagnostics]);
  const [applied, setApplied] = useState<Applied>();

  const apply = useCallback((): boolean => {
    const textarea = textareaRef.current;
    const fix = problem?.fix;
    if (!textarea || !problem || !fix) return false;
    const insertion = addUseClause(textarea.value, fix.addUseClause, problem.line);
    if (!insertion) return false;
    applyEdit(textarea, insertion.offset, insertion.offset, insertion.text, { caret: insertion.caret });
    textarea.focus({ preventScroll: true });
    showCaret(textarea);
    setApplied({ fileId: file.id, content: textarea.value, note: quickFixDone(fix) });
    return true;
  }, [textareaRef, problem, file.id]);

  const stillAsApplied = applied?.fileId === file.id && applied.content === file.content;
  useEffect(() => {
    if (!stillAsApplied) return undefined;
    // The next click — in the code, on Start, anywhere — has moved on from the note.
    const forget = () => setApplied(undefined);
    document.addEventListener('pointerdown', forget, { once: true });
    return () => document.removeEventListener('pointerdown', forget);
  }, [stillAsApplied]);
  return { problem, applied: stillAsApplied ? applied.note : undefined, apply };
}
