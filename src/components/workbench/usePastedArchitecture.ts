// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef, useState, type RefObject } from 'react';
import { applyEdit } from './find/applyEdit';
import type { VhdlFile } from './files';
import { filesForRun } from './hdlClient';
import {
  answeredPaste,
  pasteQuestions,
  removeAndInsert,
  withoutArchitectures,
  type AnsweredPaste,
  type ExistingArchitecture,
  type PasteAnswers,
  type PasteQuestions,
  type PasteTarget,
} from './pastedArchitecture';

/** A paste held back while the Review pasted architecture dialog asks about it. */
export interface PendingPaste {
  readonly text: string;
  readonly target: PasteTarget;
  readonly questions: PasteQuestions;
}

export interface PastedArchitecture {
  /** The paste waiting for the dialog's answers; null when none. */
  readonly pending: PendingPaste | null;
  /** Holds `text` back for the dialog when it has an architecture to ask about; false lets the paste go in. */
  offer(text: string, selectionStart: number, selectionEnd: number): boolean;
  paste(answers: PasteAnswers): void;
  cancel(): void;
}

/** The project the paste goes into, and how a file in it is changed. */
export interface PasteProject {
  readonly files: readonly VhdlFile[];
  readonly onChange: (id: string, content: string) => void;
}

function groupByFile(architectures: readonly ExistingArchitecture[]): Map<string, ExistingArchitecture[]> {
  const byFile = new Map<string, ExistingArchitecture[]>();
  for (const architecture of architectures) {
    const inFile = byFile.get(architecture.fileId) ?? [];
    byFile.set(architecture.fileId, [...inFile, architecture]);
  }
  return byFile;
}

/**
 * The code gets the keyboard back once the dialog is gone, after Paste and after
 * Cancel. The dialog's own focus return cannot do it: its autofocused button had
 * focus before the dialog noted where focus was. Runs after the dialog's unmount.
 */
function useFocusBackAfter(open: boolean, textareaRef: RefObject<HTMLTextAreaElement>) {
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) textareaRef.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open, textareaRef]);
}

/** The paste goes in where it was made, with this file's deleted architectures, as one native edit (Ctrl+Z). */
function pasteIntoTextarea(textarea: HTMLTextAreaElement, target: PasteTarget, { text, deleted }: AnsweredPaste) {
  const insert = { start: target.selectionStart, end: target.selectionEnd, text };
  const edit = removeAndInsert(textarea.value, deleted, insert);
  applyEdit(textarea, edit.offset, edit.offset + edit.removed, edit.text, { caret: edit.caret });
}

/**
 * The paste into `fileId`'s textarea, asked about first when it holds an
 * architecture (pastedArchitecture.ts), against the files compiled with it. This
 * file changes as one native edit, so Ctrl+Z undoes it; an architecture deleted
 * in another file is removed there through `onChange`.
 */
export function usePastedArchitecture(
  textareaRef: RefObject<HTMLTextAreaElement>,
  fileId: string,
  { files: projectFiles, onChange }: PasteProject,
): PastedArchitecture {
  const [pending, setPending] = useState<PendingPaste | null>(null);
  useFocusBackAfter(pending !== null, textareaRef);

  /** The files compiled with this one, this one as typed (LF line ends, the selection's offsets). */
  const runFilesAsTyped = (typed: string): VhdlFile[] => {
    const name = projectFiles.find((file) => file.id === fileId)?.name;
    const project = projectFiles.map((file) => (file.id === fileId ? { ...file, content: typed } : file));
    return filesForRun(project, name);
  };

  const offer = (pasted: string, selectionStart: number, selectionEnd: number): boolean => {
    const typed = textareaRef.current?.value;
    if (typed === undefined) return false;
    // The textarea holds LF line ends only; clipboard CRLF (Windows) would shift every offset after it.
    const text = pasted.replace(/\r\n?/g, '\n');
    const target = { fileId, selectionStart, selectionEnd };
    const questions = pasteQuestions(text, target, runFilesAsTyped(typed));
    if (questions === undefined) return false;
    setPending({ text, target, questions });
    return true;
  };

  const deleteInOtherFiles = (deletedByFile: ReadonlyMap<string, readonly ExistingArchitecture[]>) => {
    for (const file of projectFiles) {
      const deleted = deletedByFile.get(file.id);
      if (file.id !== fileId && deleted) onChange(file.id, withoutArchitectures(file.content, deleted));
    }
  };

  const paste = (answers: PasteAnswers) => {
    const textarea = textareaRef.current;
    setPending(null);
    if (!pending || !textarea) return;
    const { text, deleted } = answeredPaste(pending.text, pending.questions, answers);
    const deletedByFile = groupByFile(deleted);
    pasteIntoTextarea(textarea, pending.target, { text, deleted: deletedByFile.get(fileId) ?? [] });
    deleteInOtherFiles(deletedByFile);
  };

  return { pending, offer, paste, cancel: () => setPending(null) };
}
