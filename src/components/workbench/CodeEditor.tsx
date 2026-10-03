// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useState, type DragEvent } from 'react';
import { cx } from '../board';
import { NO_DIAGNOSTICS, type DiagnosticsByFile, type LineDiagnostic } from './diagnosticStore';
import { EditorSurface, type EditorTab } from './EditorSurface';
import { EditorTabStrip, type TabRunControl } from './EditorTabStrip';
import { ACCEPTED_FILES_TEXT } from './fileKinds';
import type { RevealRequest } from './useRevealLine';
import './CodeEditor.css';

export type { EditorTab, TabRunControl };

export interface CodeEditorProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onAddTab: () => void;
  onChange: (id: string, content: string) => void;
  /** Files dropped anywhere on the editor pane — imported the same way a drop on the Files panel is. */
  onFilesDropped: (files: FileList) => void;
  /**
   * The one tab with a play/stop icon — Play on the active tab while nothing
   * runs, Stop on the running file's tab while a simulation runs — or null.
   */
  tabRun?: TabRunControl | null;
  /** Compiler problems to mark, per file id (see diagnosticStore.ts). */
  diagnostics?: DiagnosticsByFile;
  /** The student clicked in, or edited, this file's code pane: its markers should go. */
  onDismissDiagnostics?: (fileId: string) => void;
  /** Show this line of its file (opened and active), caret at its start. */
  reveal?: RevealRequest | null;
}

const NO_LINES: readonly LineDiagnostic[] = [];

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

export function NoFileOpen() {
  return (
    <div className="wb-editor__empty">
      <p>No file open</p>
      <p className="wb-editor__empty-hint">Select a file from the Files panel to start editing.</p>
    </div>
  );
}

/** The tabbed VHDL and Verilog editor: one tab strip over one code surface. */
export function CodeEditor({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
  onChange,
  onFilesDropped,
  tabRun,
  diagnostics = NO_DIAGNOSTICS,
  onDismissDiagnostics,
  reveal,
}: CodeEditorProps) {
  const drop = useFileDrop(onFilesDropped);
  const active = tabs.find((t) => t.id === activeTabId) ?? null;

  return (
    <div className={cx('wb-editor', drop.dragging && 'is-drag-over')} {...drop.handlers}>
      {drop.dragging && <DropHint />}
      <EditorTabStrip
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onAddTab={onAddTab}
        tabRun={tabRun}
        diagnostics={diagnostics}
      />
      {active ? (
        <EditorSurface
          file={active}
          diagnostics={diagnostics[active.id] ?? NO_LINES}
          onChange={onChange}
          onDismissDiagnostics={onDismissDiagnostics}
          reveal={reveal}
        />
      ) : (
        <NoFileOpen />
      )}
    </div>
  );
}

export default CodeEditor;
