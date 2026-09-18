// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useRef, useState, type DragEvent, type UIEvent } from 'react';
import { cx } from '../board';
import { tokenizeVhdlLine, type Token } from './vhdlHighlight';
import './CodeEditor.css';

export interface EditorTab {
  id: string;
  name: string;
  content: string;
}

export interface CodeEditorProps {
  tabs: EditorTab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onAddTab: () => void;
  onChange: (id: string, content: string) => void;
  /** Files dropped anywhere on the editor pane — imported the same way a drop on the Files panel is. */
  onFilesDropped: (files: FileList) => void;
}

const TOKEN_CLASS: Partial<Record<Token['type'], string>> = {
  keyword: 'wb-tok-keyword',
  type: 'wb-tok-type',
  comment: 'wb-tok-comment',
  string: 'wb-tok-string',
  number: 'wb-tok-number',
  punctuation: 'wb-tok-punct',
};

function HighlightedLine({ line }: { line: string }) {
  const tokens = tokenizeVhdlLine(line);
  return (
    <div className="wb-editor__line">
      {line.length === 0 ? (
        ' '
      ) : (
        tokens.map((token, i) => {
          const className = TOKEN_CLASS[token.type];
          return className ? (
            <span key={i} className={className}>
              {token.text}
            </span>
          ) : (
            token.text
          );
        })
      )}
    </div>
  );
}

/**
 * The tabbed VHDL editor. A transparent `<textarea>` sits over a
 * highlighted `<pre>` with identical font metrics — the standard
 * overlay technique, so typing, selection and the caret are all native
 * while the visible text is coloured.
 */
export function CodeEditor({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onAddTab,
  onChange,
  onFilesDropped,
}: CodeEditorProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const active = tabs.find((t) => t.id === activeTabId) ?? null;
  const lines = active ? active.content.split('\n') : [];

  const handleScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
  };

  // Same ref-counted-depth technique as FileExplorer's drop zone, and for
  // the same reason (a child's dragenter and the parent's dragleave fire
  // in the same tick, so a boolean flickers while crossing rows/lines
  // underneath the pointer). Dropped files are imported exactly like a
  // drop on the Files panel — this pane does not try to insert file
  // content at the caret, which is what a plain <textarea> would
  // otherwise do with a dropped file by default.
  const [dragDepth, setDragDepth] = useState(0);

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragDepth((d) => d + 1);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault(); // required for onDrop to fire, and stops the
    // textarea's own default (inserting the dropped file as text)
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    setDragDepth((d) => Math.max(0, d - 1));
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragDepth(0);
    if (e.dataTransfer.files.length > 0) onFilesDropped(e.dataTransfer.files);
  };

  return (
    <div
      className={cx('wb-editor', dragDepth > 0 && 'is-drag-over')}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragDepth > 0 && (
        <div className="wb-editor__drop-hint" aria-hidden="true">
          <span className="wb-icon wb-icon--upload" aria-hidden="true" />
          Drop .vhd / .vhdl files
        </div>
      )}
      <div className="wb-editor__tabs" role="tablist">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={tab.id === activeTabId}
            className={cx('wb-editor__tab', tab.id === activeTabId && 'is-active')}
            onClick={() => onSelectTab(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectTab(tab.id);
            }}
          >
            <span className="wb-editor__tab-name">{tab.name}</span>
            <button
              type="button"
              className="wb-editor__tab-close"
              aria-label={`Close ${tab.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(tab.id);
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="wb-editor__tab-add" aria-label="New file" onClick={onAddTab}>
          +
        </button>
      </div>

      {active ? (
        <div className="wb-editor__body">
          <div className="wb-editor__gutter" ref={gutterRef} aria-hidden="true">
            {lines.map((_, i) => (
              <div className="wb-editor__gutter-line" key={i}>
                {i + 1}
              </div>
            ))}
          </div>
          <div className="wb-editor__surface">
            <pre className="wb-editor__highlight" ref={preRef} aria-hidden="true">
              {lines.map((line, i) => (
                <HighlightedLine line={line} key={i} />
              ))}
            </pre>
            <textarea
              className="wb-editor__textarea"
              value={active.content}
              spellCheck={false}
              wrap="off"
              onScroll={handleScroll}
              onChange={(e) => onChange(active.id, e.target.value)}
              aria-label={`${active.name} source`}
            />
          </div>
        </div>
      ) : (
        <div className="wb-editor__empty">
          <p>No file open</p>
          <p className="wb-editor__empty-hint">Select a file from the Files panel to start editing.</p>
        </div>
      )}
    </div>
  );
}

export default CodeEditor;
