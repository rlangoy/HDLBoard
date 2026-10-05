// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState, type DragEvent, type ReactNode } from 'react';
import { cx } from '../board';
import { NO_DIAGNOSTICS, type DiagnosticsByFile } from './diagnosticStore';
import type { EditorTab } from './EditorSurface';
import { ACCEPTED_FILES_TEXT } from './fileKinds';
import { SplitEditor, type SplitEditorProps } from './SplitEditor';
import './CodeEditor.css';

export type { EditorTab };

export interface CodeEditorProps {
  onChange: (id: string, content: string) => void;
  /** Files dropped anywhere on the editor pane — imported the same way a drop on the Files panel is. */
  onFilesDropped: (files: FileList) => void;
  /** Compiler problems to mark, per file id (see diagnosticStore.ts). */
  diagnostics?: DiagnosticsByFile;
  /** The student clicked in, or edited, this file's code pane: its markers should go. */
  onDismissDiagnostics?: (fileId: string) => void;
  /**
   * The one or two panes, each under its header (docs/impl_split_screen.md § 6.5,
   * docs/cleanup_file_tabs.md F3); none while nothing is shown.
   */
  split?: SplitEditorProps;
  /** Shown instead of panes while the project has no files (docs/cleanup_file_tabs.md § 5.6). */
  emptyProject?: ReactNode;
}

/**
 * The drop zone around the editor column. Same ref-counted-depth technique as
 * FileExplorer's, and for the same reason (a child's dragenter and the parent's
 * dragleave fire in the same tick, so a boolean flickers while crossing lines
 * underneath the pointer). Dropped files are imported exactly like a drop on the
 * Files panel — never inserted at the caret, which a plain <textarea> would do.
 */
export function useFileDrop(onFilesDropped: (files: FileList) => void) {
  const [dragDepth, setDragDepth] = useState(0);
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes('Files');
  return {
    dragging: dragDepth > 0,
    handlers: {
      onDragEnter: (e: DragEvent<HTMLDivElement>) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragDepth((d) => d + 1);
      },
      onDragOver: (e: DragEvent<HTMLDivElement>) => {
        if (!hasFiles(e)) return;
        e.preventDefault(); // required for onDrop to fire, and stops the textarea inserting the file as text
        e.dataTransfer.dropEffect = 'copy';
      },
      onDragLeave: (e: DragEvent<HTMLDivElement>) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragDepth((d) => Math.max(0, d - 1));
      },
      onDrop: (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setDragDepth(0);
        if (e.dataTransfer.files.length > 0) onFilesDropped(e.dataTransfer.files);
      },
    },
  };
}

export function DropHint() {
  return (
    <div className="wb-editor__drop-hint" aria-hidden="true">
      <span className="wb-icon wb-icon--upload" aria-hidden="true" />
      Drop {ACCEPTED_FILES_TEXT} files
    </div>
  );
}

/** The VHDL and Verilog editor: the file picked in the Files panel, alone or beside its testbench, with no tab strip. */
export function CodeEditor({
  onChange,
  onFilesDropped,
  diagnostics = NO_DIAGNOSTICS,
  onDismissDiagnostics,
  split,
  emptyProject,
}: CodeEditorProps) {
  const drop = useFileDrop(onFilesDropped);
  return (
    <div className={cx('wb-editor', drop.dragging && 'is-drag-over')} {...drop.handlers}>
      {drop.dragging && <DropHint />}
      {split ? (
        <SplitEditor {...split} diagnostics={diagnostics} onChange={onChange} onDismissDiagnostics={onDismissDiagnostics} />
      ) : (
        emptyProject
      )}
    </div>
  );
}

export default CodeEditor;
