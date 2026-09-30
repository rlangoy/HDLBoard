// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useId, useMemo, useRef, useState, type DragEvent, type RefObject, type UIEvent } from 'react';
import { cx } from '../board';
import { describeHint, describeLine, inlineText, summarize } from './diagnosticText';
import {
  countSeverities,
  hintLines,
  isFollowOnLine,
  NO_DIAGNOSTICS,
  visibleSpans,
  type DiagnosticsByFile,
  type LineDiagnostic,
} from './diagnosticStore';
import { ACCEPTED_FILES_TEXT } from './fileKinds';
import { OverlayScrollbar, SCROLLBAR_PX, useScrollMetrics } from './OverlayScrollbar';
import { isOverflowing } from './scrollThumb';
import { SimToggle } from './SimToggle';
import { useRevealLine, type RevealRequest } from './useRevealLine';
import { markRanges, tokenizeVhdlLine, type CharRange, type MarkedToken, type Token } from './vhdlHighlight';
import './CodeEditor.css';

export interface EditorTab {
  id: string;
  name: string;
  content: string;
}

/** Which tab carries the play/stop icon, and what it shows and does (SimToggle). */
export interface TabRunControl {
  tabId: string;
  /** A simulation is running this tab's file: Stop rather than Play. */
  running: boolean;
  disabled: boolean;
  /** Start the run (Play) or stop it (Stop). */
  onClick: () => void;
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
const NO_RANGES: readonly CharRange[] = [];

const TOKEN_CLASS: Partial<Record<Token['type'], string>> = {
  keyword: 'wb-tok-keyword',
  type: 'wb-tok-type',
  comment: 'wb-tok-comment',
  string: 'wb-tok-string',
  number: 'wb-tok-number',
  punctuation: 'wb-tok-punct',
};

/** The marker classes of a line: its severity, muted when every message is a follow-on; or a hint. */
function markerClasses(diagnostic: LineDiagnostic | undefined, hintFrom: LineDiagnostic | undefined): string {
  if (diagnostic) return cx(`is-${diagnostic.severity}`, isFollowOnLine(diagnostic) && 'is-followon');
  return hintFrom ? 'is-hint' : '';
}

/** One highlighted piece; an underlined one is wrapped, and the underline never changes the glyphs. */
function TokenPiece({ piece }: { piece: MarkedToken }) {
  const className = TOKEN_CLASS[piece.type];
  const text = className ? <span className={className}>{piece.text}</span> : piece.text;
  return piece.marked ? <span className="wb-editor__diag-span">{text}</span> : <>{text}</>;
}

function HighlightedLine({
  line,
  diagnostic,
  hintFrom,
}: {
  line: string;
  diagnostic?: LineDiagnostic;
  /** Rules D and E point at this line from that marked line. */
  hintFrom?: LineDiagnostic;
}) {
  const pieces = markRanges(tokenizeVhdlLine(line), diagnostic ? visibleSpans(diagnostic) : NO_RANGES);
  const inline = diagnostic ? inlineText(diagnostic) : '';
  return (
    <div className={cx('wb-editor__line', markerClasses(diagnostic, hintFrom))}>
      {line.length === 0 ? ' ' : pieces.map((piece, i) => <TokenPiece key={i} piece={piece} />)}
      {diagnostic && inline && (
        <span className={cx('wb-editor__diag-inline', `is-${diagnostic.severity}`)}>{inline}</span>
      )}
    </div>
  );
}

/** Line numbers; a marked line gets a glyph, an edge and a tooltip (colour is never the only cue). */
function EditorGutter({
  lines,
  linesByNumber,
  hints,
  gutterRef,
}: {
  lines: string[];
  linesByNumber: ReadonlyMap<number, LineDiagnostic>;
  hints: ReadonlyMap<number, LineDiagnostic>;
  gutterRef: RefObject<HTMLDivElement>;
}) {
  return (
    <div className="wb-editor__gutter" ref={gutterRef} aria-hidden="true">
      {lines.map((_, i) => {
        const diagnostic = linesByNumber.get(i + 1);
        const hintFrom = hints.get(i + 1);
        const title = diagnostic ? describeLine(diagnostic) : hintFrom && describeHint(hintFrom);
        return (
          <div className={cx('wb-editor__gutter-line', markerClasses(diagnostic, hintFrom))} key={i} title={title}>
            {i + 1}
          </div>
        );
      })}
    </div>
  );
}

/** Hidden text after a tab's name, so the dot is not the only cue: ", 2 errors". */
function tabProblemsText(lines: readonly LineDiagnostic[]): string {
  const { errors, warnings } = countSeverities(lines);
  const parts = [
    errors > 0 && `${errors} error${errors === 1 ? '' : 's'}`,
    warnings > 0 && `${warnings} warning${warnings === 1 ? '' : 's'}`,
  ].filter(Boolean);
  return parts.length > 0 ? `, ${parts.join(', ')}` : '';
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
  tabRun,
  diagnostics = NO_DIAGNOSTICS,
  onDismissDiagnostics,
  reveal,
}: CodeEditorProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scroll = useScrollMetrics(textareaRef);
  // Where both bars show, each stops short of the corner the other one runs into.
  const bothBars = isOverflowing(scroll.x) && isOverflowing(scroll.y);
  const cornerInset = bothBars ? SCROLLBAR_PX : 0;
  const active = tabs.find((t) => t.id === activeTabId) ?? null;
  const lines = active ? active.content.split('\n') : [];
  const activeLines = (active && diagnostics[active.id]) || NO_LINES;
  const linesByNumber = useMemo(() => new Map(activeLines.map((d) => [d.line, d])), [activeLines]);
  const hints = useMemo(() => hintLines(activeLines), [activeLines]);
  // Computed only from the stored lines, so a repeating assertion that adds
  // nothing leaves the text unchanged and the live region silent.
  const status = useMemo(() => (active ? summarize(active.name, activeLines) : ''), [active?.name, activeLines]);
  const statusId = useId();
  useRevealLine(textareaRef, active, reveal);

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
          Drop {ACCEPTED_FILES_TEXT} files
        </div>
      )}
      <div className="wb-editor__tabs" role="tablist">
        {tabs.map((tab) => {
          const tabLines = diagnostics[tab.id] ?? NO_LINES;
          const { errors, warnings } = countSeverities(tabLines);
          return (
          <div
            key={tab.id}
            role="tab"
            tabIndex={0}
            aria-selected={tab.id === activeTabId}
            className={cx(
              'wb-editor__tab',
              tab.id === activeTabId && 'is-active',
              errors > 0 && 'has-errors',
              errors === 0 && warnings > 0 && 'has-warnings',
            )}
            onClick={() => onSelectTab(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectTab(tab.id);
            }}
          >
            {tabRun?.tabId === tab.id && (
              <SimToggle
                className="wb-editor__tab-run"
                fileName={tab.name}
                running={tabRun.running}
                disabled={tabRun.disabled}
                onClick={tabRun.onClick}
              />
            )}
            <span className="wb-editor__tab-name">
              {tab.name}
              <span className="wb-sr-only">{tabProblemsText(tabLines)}</span>
            </span>
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
          );
        })}
        <button type="button" className="wb-editor__tab-add" aria-label="New file" onClick={onAddTab}>
          +
        </button>
      </div>

      {active ? (
        <div
          className="wb-editor__body"
          // A click in the text or on a line number clears this file's markers
          // (hovering does not). The reveal's own focus and scroll are not clicks.
          onPointerDown={() => {
            if (activeLines.length > 0) onDismissDiagnostics?.(active.id);
          }}
        >
          <p id={statusId} className="wb-sr-only" role="status" aria-live="polite">
            {status}
          </p>
          <EditorGutter lines={lines} linesByNumber={linesByNumber} hints={hints} gutterRef={gutterRef} />
          <div className="wb-editor__surface">
            <pre className="wb-editor__highlight" ref={preRef} aria-hidden="true">
              {lines.map((line, i) => (
                <HighlightedLine
                  line={line}
                  key={i}
                  diagnostic={linesByNumber.get(i + 1)}
                  hintFrom={hints.get(i + 1)}
                />
              ))}
            </pre>
            <textarea
              ref={textareaRef}
              className="wb-editor__textarea wb-scrollbar-host"
              value={active.content}
              spellCheck={false}
              wrap="off"
              onScroll={handleScroll}
              onChange={(e) => onChange(active.id, e.target.value)}
              aria-label={`${active.name} source`}
              aria-describedby={statusId}
            />
            <OverlayScrollbar targetRef={textareaRef} axis="y" metrics={scroll.y} endInset={cornerInset} />
            <OverlayScrollbar targetRef={textareaRef} axis="x" metrics={scroll.x} endInset={cornerInset} />
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
