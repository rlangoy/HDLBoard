// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef, useState, type RefObject } from 'react';
import { applyEdit } from './find/applyEdit';
import type { VhdlFile } from './files';
import { filesForRun } from './hdlClient';
import { answeredPaste, pasteQuestions, removeAndInsert, type ExistingArchitecture, type PasteAnswers, type PasteQuestions } from './pastedArchitecture';
import { applyTextEdit } from './textLines';

/** A paste held back while the Paste architecture dialog asks about it. */
export interface PendingPaste {
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
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
  for (const architecture of architectures) byFile.set(architecture.fileId, [...(byFile.get(architecture.fileId) ?? []), architecture]);
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

/**
 * The paste into `fileId`'s textarea, asked about first when it holds an
 * architecture (pastedArchitecture.ts), against the files compiled with it. This
 * file changes as one native edit, so Ctrl+Z undoes it; an architecture replaced
 * in another file is removed there through `onChange`.
 */
export function usePastedArchitecture(
  textareaRef: RefObject<HTMLTextAreaElement>,
  fileId: string,
  { files: projectFiles, onChange }: PasteProject,
): PastedArchitecture {
  const [pending, setPending] = useState<PendingPaste | null>(null);
  useFocusBackAfter(pending !== null, textareaRef);

  /** The files compiled with this one, this one as the textarea holds it (LF line ends, the selection's offsets). */
  const filesWithThis = (content: string): VhdlFile[] => {
    const name = projectFiles.find((file) => file.id === fileId)?.name;
    const project = projectFiles.map((file) => (file.id === fileId ? { ...file, content } : file));
    return filesForRun(project, name);
  };

  const offer = (text: string, selectionStart: number, selectionEnd: number): boolean => {
    const content = textareaRef.current?.value;
    if (content === undefined) return false;
    const questions = pasteQuestions(text, { fileId, selectionStart, selectionEnd }, filesWithThis(content));
    if (questions === undefined) return false;
    setPending({ text, selectionStart, selectionEnd, questions });
    return true;
  };

  const paste = (answers: PasteAnswers) => {
    const textarea = textareaRef.current;
    setPending(null);
    if (!pending || !textarea) return;
    const { text, replaced } = answeredPaste(pending.text, pending.questions, answers);
    const byFile = groupByFile(replaced);
    const insert = { start: pending.selectionStart, end: pending.selectionEnd, text };
    const edit = removeAndInsert(textarea.value, byFile.get(fileId) ?? [], insert);
    applyEdit(textarea, edit.offset, edit.offset + edit.removed, edit.text, { caret: edit.caret });
    for (const file of projectFiles) {
      const removed = file.id === fileId ? undefined : byFile.get(file.id);
      if (removed) onChange(file.id, applyTextEdit(file.content, removeAndInsert(file.content, removed)));
    }
  };

  return { pending, offer, paste, cancel: () => setPending(null) };
}
