// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { Fragment, memo, useId, useLayoutEffect, useMemo, useRef, type CSSProperties, type RefObject, type UIEvent } from 'react';
import { cx } from '../board';
import { describeHint, describeLine, inlineText, summarize } from './diagnosticText';
import { hintLines, isFollowOnLine, isQuietLine, visibleSpans, type LineDiagnostic } from './diagnosticStore';
import { OverlayScrollbar, SCROLLBAR_PX, useScrollMetrics } from './OverlayScrollbar';
import { isOverflowing } from './scrollThumb';
import { applyEdit } from './find/applyEdit';
import { unwrapCodeFence } from './pasteFence';
import { tabEdit } from './tabIndent';
import { useRevealLine, type RevealRequest } from './useRevealLine';
import { useQuickFix } from './useQuickFix';
import { countExtraRows, drawnRows, extraRowsAbove, extraRowsByLine, hasMessageRows, type ExtraRow, type ExtraRowsByLine } from './extraRows';
import { ExtraRowLine } from './ExtraRowLine';
import { useEditorWidth } from './useEditorWidth';
import { useExtraRowClicks } from './useExtraRowClicks';
import type { CharRange, Token } from './vhdlHighlight';
import type { FindDecor } from './find/useFind';
import { decorateLine, type DecoratedPiece } from './symbols/decorateLine';
import { occurrencesByLine } from './symbols/occurrences';
import type { FileSymbols } from './symbols/fileSymbols';
import type { HdlSymbol, Occurrence, OccurrenceKind } from './symbols/types';
import { useCaretSymbol } from './symbols/useCaretSymbol';
import { useHoveredSymbol } from './symbols/useHoveredSymbol';
import { usePinnedSymbol } from './symbols/usePinnedSymbol';

/** The file a surface edits. */
export interface EditorTab {
  id: string;
  name: string;
  content: string;
}

/** Ctrl+. (Cmd+. on a Mac) applies the Quick Fix of the caret's line, as in VS Code. */
function isQuickFixKey(e: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
  return e.key === '.' && (e.ctrlKey || e.metaKey);
}

/** Keys that only modify another: they neither end nor start the Esc-then-Tab escape. */
const MODIFIER_KEYS: readonly string[] = ['Shift', 'Control', 'Alt', 'Meta', 'Tab'];

const NO_RANGES: readonly CharRange[] = [];
const NO_OCCURRENCES: readonly Occurrence[] = [];
const NO_EXTRA_ROWS: readonly ExtraRow[] = [];

const OCCURRENCE_CLASS: Record<OccurrenceKind, string> = {
  declaration: 'wb-editor__occ-decl',
  reference: 'wb-editor__occ-ref',
};

const TOKEN_CLASS: Partial<Record<Token['type'], string>> = {
  keyword: 'wb-tok-keyword',
  type: 'wb-tok-type',
  comment: 'wb-tok-comment',
  string: 'wb-tok-string',
  number: 'wb-tok-number',
  directive: 'wb-tok-directive',
  system: 'wb-tok-system',
  punctuation: 'wb-tok-punct',
};

/** The marker classes of a line: its severity, muted when every message is a follow-on, untinted when every one is quiet; or a hint. */
function markerClasses(diagnostic: LineDiagnostic | undefined, hintFrom: LineDiagnostic | undefined): string {
  if (diagnostic) {
    return cx(`is-${diagnostic.severity}`, isFollowOnLine(diagnostic) && 'is-followon', isQuietLine(diagnostic) && 'is-quiet');
  }
  return hintFrom ? 'is-hint' : '';
}

/**
 * One highlighted piece; an underlined one is wrapped, and so is a hovered symbol's
 * occurrence. Neither wrapper changes the glyphs' metrics.
 */
function TokenPiece({ piece }: { piece: DecoratedPiece }) {
  const className = TOKEN_CLASS[piece.type];
  const text = className ? <span className={className}>{piece.text}</span> : piece.text;
  const underlined = piece.marked ? <span className="wb-editor__diag-span">{text}</span> : text;
  const occurrence = piece.occurrence ? <span className={OCCURRENCE_CLASS[piece.occurrence]}>{underlined}</span> : underlined;
  // A search match wraps everything else, so its background wins (docs/impl_search.md D16).
  if (!piece.find) return <>{occurrence}</>;
  return <span className={cx('wb-editor__find-match', piece.find === 'current' && 'wb-editor__find-current')}>{occurrence}</span>;
}

const HighlightedLine = memo(function HighlightedLine({
  line,
  tokens,
  diagnostic,
  hintFrom,
  occurrences,
  findRanges,
  currentFind,
  messageBelow,
}: {
  line: string;
  /** The line's tokens (`tokenizeSource`); together they are `line`. */
  tokens: readonly Token[];
  diagnostic?: LineDiagnostic;
  /** Rules D and E point at this line from that marked line. */
  hintFrom?: LineDiagnostic;
  /** The hovered symbol's declaration and references on this line. */
  occurrences: readonly Occurrence[];
  /** Search matches on this line (docs/impl_search.md § 5.4), and the current one if it is here. */
  findRanges: readonly CharRange[];
  currentFind?: CharRange;
  /** The message is drawn on rows of its own below the line (extraRows.ts), not after the code. */
  messageBelow: boolean;
}) {
  const pieces = decorateLine(tokens, diagnostic ? visibleSpans(diagnostic) : NO_RANGES, occurrences, findRanges, currentFind);
  const inline = diagnostic && !messageBelow ? inlineText(diagnostic) : '';
  return (
    <div className={cx('wb-editor__line', markerClasses(diagnostic, hintFrom))}>
      {line.length === 0 ? ' ' : pieces.map((piece, i) => <TokenPiece key={i} piece={piece} />)}
      {diagnostic && inline && (
        <span className={cx('wb-editor__diag-inline', `is-${diagnostic.severity}`)}>{inline}</span>
      )}
    </div>
  );
});

/**
 * Line numbers; a marked line gets a glyph, an edge and a tooltip (colour is never the only cue).
 * Memoised: a symbol highlight changes nothing here, so hovering skips every line number.
 */
const EditorGutter = memo(function EditorGutter({
  lines,
  linesByNumber,
  hints,
  extraRows,
  gutterRef,
}: {
  lines: readonly string[];
  linesByNumber: ReadonlyMap<number, LineDiagnostic>;
  hints: ReadonlyMap<number, LineDiagnostic>;
  extraRows: ExtraRowsByLine;
  gutterRef: RefObject<HTMLDivElement>;
}) {
  return (
    <div className="wb-editor__gutter" ref={gutterRef} aria-hidden="true">
      {lines.map((_, i) => {
        const diagnostic = linesByNumber.get(i + 1);
        const hintFrom = hints.get(i + 1);
        const title = diagnostic ? describeLine(diagnostic) : hintFrom && describeHint(hintFrom);
        return (
          <Fragment key={i}>
            <div className={cx('wb-editor__gutter-line', markerClasses(diagnostic, hintFrom))} title={title}>
              {i + 1}
            </div>
            {(extraRows.get(i + 1) ?? NO_EXTRA_ROWS).map((row, r) => (
              <div className={cx('wb-editor__gutter-line', 'is-extra', row.kind === 'message' && `is-${row.severity}`)} key={r} />
            ))}
          </Fragment>
        );
      })}
    </div>
  );
});

export interface EditorSurfaceProps {
  file: EditorTab;
  /** This file's compiler problems. */
  diagnostics: readonly LineDiagnostic[];
  onChange: (id: string, content: string) => void;
  onDismissDiagnostics?: (fileId: string) => void;
  reveal?: RevealRequest | null;
  /** The textarea's accessible name; defaults to "<name> source". */
  label?: string;
  /** Whether this surface speaks the diagnostics live region (only one of two showing a file does). */
  announces?: boolean;
  /** The pane was clicked or focused. */
  onFocusWithin?: () => void;
  /** The file's analysis (`useFileSymbols`), shared with the split view. */
  symbols: FileSymbols;
  /**
   * Names in this file linked to the symbol highlighted in the other pane, by line
   * (symbols/portLinks.ts). While there are any, they are shown instead of this
   * pane's own highlight.
   */
  linkedOccurrences?: ReadonlyMap<number, readonly Occurrence[]>;
  /** The symbol this pane highlights changed (or there is none any more). */
  onHighlightChange?: (symbol: HdlSymbol | undefined) => void;
  /**
   * Whether the symbol at the text cursor is highlighted. Of two panes side by side
   * only the focused one does, so a click in the other pane drops the highlight
   * just as a click elsewhere in the same pane does. Hovering works in both.
   */
  highlightsCursor?: boolean;
  /** The pane's search highlights (docs/impl_search.md D5); null while its Find bar is closed. */
  findDecor?: FindDecor | null;
  /** The pane's search takes the textarea (a callback ref) to read the caret and to replace. */
  findAttach?: (textarea: HTMLTextAreaElement | null) => void;
  /** Esc in the code: closes the pane's Find bar; true when it did (D12). */
  onFindEscape?: () => boolean;
  /** A click in the code: hides the pane's Find bar and its marks; the query is kept for the next open. */
  onFindDismiss?: () => void;
}

/**
 * One file's code: gutter, a highlighted `<pre>`, and a transparent `<textarea>`
 * over it with identical font metrics — the standard overlay technique, so
 * typing, selection and the caret are all native while the visible text is
 * coloured. Each surface owns its scroll and caret; content lives in Workbench.
 */
export function EditorSurface({
  file,
  diagnostics,
  onChange,
  onDismissDiagnostics,
  reveal,
  label,
  announces = true,
  onFocusWithin,
  symbols,
  linkedOccurrences,
  onHighlightChange,
  highlightsCursor = true,
  findDecor,
  findAttach,
  onFindEscape,
  onFindDismiss,
}: EditorSurfaceProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scroll = useScrollMetrics(textareaRef);
  // Tab indents, as in an IDE (tabIndent.ts); Esc then Tab moves on to the next control, and
  // Esc then Shift+Tab to the previous one. Any click or leaving the editor forgets the Esc.
  const tabLeaves = useRef(false);
  const handleTab = (textarea: HTMLTextAreaElement, outdent: boolean, withModifier: boolean): boolean => {
    if (withModifier || tabLeaves.current) {
      tabLeaves.current = false;
      return false;
    }
    const edit = tabEdit(textarea.value, textarea.selectionStart, textarea.selectionEnd, outdent);
    if (edit !== undefined) {
      applyEdit(textarea, edit.start, edit.end, edit.text);
      textarea.setSelectionRange(edit.selectStart, edit.selectEnd);
    }
    return true;
  };
  // Where both bars show, each stops short of the corner the other one runs into.
  const bothBars = isOverflowing(scroll.x) && isOverflowing(scroll.y);
  const cornerInset = bothBars ? SCROLLBAR_PX : 0;
  // Built once per edit by the caller; the same arrays let the memoised gutter and lines skip a highlight change.
  const { lines, tokenLines, index: symbolIndex } = symbols;
  // Symbol occurrence highlighting: looked up on hover or at the text cursor.
  // The pointer wins while it rests on a name.
  const editorWidth = useEditorWidth(textareaRef, scroll.x.viewSize);
  const extraRows = useMemo(() => extraRowsByLine(diagnostics, lines, editorWidth), [diagnostics, lines, editorWidth]);
  const extraRowCount = countExtraRows(extraRows);
  // Where each line is drawn, once extra rows push the lines below them down.
  const textRows = useMemo(
    () => ({ lines, rows: extraRowCount > 0 ? drawnRows(lines.length, extraRows) : undefined }),
    [lines, extraRows, extraRowCount],
  );
  const extraRowClicks = useExtraRowClicks(textRows);
  const hovered = useHoveredSymbol(file.id, textRows, symbolIndex);
  const atCaret = useCaretSymbol(file.id, file.content, symbolIndex);
  // A declaration that Go to declaration jumped to stays highlighted until the next click.
  const pinned = usePinnedSymbol(file.id, symbolIndex, reveal, hovered.symbol);
  const highlighted = hovered.symbol ?? pinned ?? (highlightsCursor ? atCaret.symbol : undefined);
  // Before paint: the other pane's link follows in the same frame, without a flash of the old one.
  useLayoutEffect(() => onHighlightChange?.(highlighted), [highlighted, onHighlightChange]);
  const ownOccurrences = useMemo(() => occurrencesByLine(highlighted), [highlighted]);
  const occurrences = linkedOccurrences?.size ? linkedOccurrences : ownOccurrences;
  const linesByNumber = useMemo(() => new Map(diagnostics.map((d) => [d.line, d])), [diagnostics]);
  const hints = useMemo(() => hintLines(diagnostics), [diagnostics]);
  // Computed only from the stored lines, so a repeating assertion that adds
  // nothing leaves the text unchanged and the live region silent.
  const status = useMemo(() => summarize(file.name, diagnostics), [file.name, diagnostics]);
  const statusId = useId();
  useRevealLine(textareaRef, { ...file, extraRowsAbove: (line) => extraRowsAbove(line, extraRows) }, reveal);
  const quickFix = useQuickFix(textareaRef, diagnostics, () => onDismissDiagnostics?.(file.id));
  useLayoutEffect(() => {
    findAttach?.(textareaRef.current);
    return () => findAttach?.(null);
  }, [findAttach]);

  const handleScroll = (e: UIEvent<HTMLTextAreaElement>) => {
    hovered.clear(); // the text moved under the pointer; the next pointer move highlights again
    const { scrollTop, scrollLeft } = e.currentTarget;
    if (preRef.current) {
      preRef.current.scrollTop = scrollTop;
      preRef.current.scrollLeft = scrollLeft;
      // Extra rows stay at the left edge of the view (CodeEditor.css).
      preRef.current.style.setProperty('--wb-scroll-left', `${scrollLeft}px`);
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = scrollTop;
    }
  };

  return (
    <div
      className="wb-editor__body"
      // A click in the text or on a line number clears this file's markers
      // (hovering does not). The reveal's own focus and scroll are not clicks.
      onPointerDown={() => {
        onFocusWithin?.();
        if (diagnostics.length > 0) onDismissDiagnostics?.(file.id);
      }}
      onFocus={onFocusWithin}
    >
      <p id={statusId} className="wb-sr-only" role="status" aria-live="polite">
        {announces ? status : ''}
      </p>
      <EditorGutter lines={lines} linesByNumber={linesByNumber} hints={hints} extraRows={extraRows} gutterRef={gutterRef} />
      <div className="wb-editor__surface">
        <pre className="wb-editor__highlight" ref={preRef} aria-hidden="true">
          {lines.map((line, i) => {
            const below = extraRows.get(i + 1) ?? NO_EXTRA_ROWS;
            return (
              <Fragment key={i}>
                <HighlightedLine
                  line={line}
                  tokens={tokenLines[i] ?? []}
                  diagnostic={linesByNumber.get(i + 1)}
                  hintFrom={hints.get(i + 1)}
                  occurrences={occurrences.get(i) ?? NO_OCCURRENCES}
                  findRanges={findDecor?.byLine.get(i) ?? NO_RANGES}
                  currentFind={findDecor?.currentLine === i ? findDecor.current : undefined}
                  messageBelow={hasMessageRows(below)}
                />
                {below.map((row, r) => (
                  <ExtraRowLine row={row} onApplyFix={quickFix.apply} key={r} />
                ))}
              </Fragment>
            );
          })}
        </pre>
        <textarea
          ref={textareaRef}
          className="wb-editor__textarea wb-scrollbar-host"
          value={file.content}
          spellCheck={false}
          wrap="off"
          // The textarea scrolls as far as the drawn text, extra rows included.
          style={{ '--wb-extra-rows': extraRowCount } as CSSProperties}
          onScroll={handleScroll}
          onChange={(e) => onChange(file.id, e.target.value)}
          onPaste={(e) => {
            // A Markdown code block (```vhdl … ```) goes in without its fence lines.
            const code = unwrapCodeFence(e.clipboardData.getData('text/plain'));
            if (code === null) return;
            e.preventDefault();
            const ta = e.currentTarget;
            applyEdit(ta, ta.selectionStart, ta.selectionEnd, code);
          }}
          {...hovered.handlers}
          onSelect={atCaret.onSelect}
          onPointerDown={(e) => {
            tabLeaves.current = false;
            onFindDismiss?.();
            extraRowClicks.onPointerDown(e);
          }}
          onMouseDown={extraRowClicks.onMouseDown}
          onBlur={() => {
            tabLeaves.current = false;
          }}
          onKeyDown={(e) => {
            if (isQuickFixKey(e) && quickFix.applyAtCaret()) {
              e.preventDefault();
              return;
            }
            // A key that may move the caret clears the extra rows first: below them the
            // drawn text is not where the textarea's caret is.
            if (extraRowCount > 0 && !MODIFIER_KEYS.includes(e.key)) onDismissDiagnostics?.(file.id);
            if (e.key === 'Tab' && handleTab(e.currentTarget, e.shiftKey, e.ctrlKey || e.altKey || e.metaKey)) {
              e.preventDefault();
              return;
            }
            if (MODIFIER_KEYS.includes(e.key)) return; // Esc, Shift, Tab: the Shift of Shift+Tab must not undo the Esc
            const closedFind = e.key === 'Escape' && onFindEscape?.();
            if (closedFind) e.preventDefault();
            // After Esc, the next Tab leaves the editor, so the keyboard is never trapped in it.
            tabLeaves.current = e.key === 'Escape' && !closedFind;
          }}
          aria-label={label ?? `${file.name} source`}
          aria-describedby={statusId}
        />
        <OverlayScrollbar targetRef={textareaRef} axis="y" metrics={scroll.y} endInset={cornerInset} />
        <OverlayScrollbar targetRef={textareaRef} axis="x" metrics={scroll.x} endInset={cornerInset} />
      </div>
    </div>
  );
}
