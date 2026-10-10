// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { memo, useId, useLayoutEffect, useMemo, useRef, type RefObject, type UIEvent } from 'react';
import { cx } from '../board';
import { describeHint, describeLine, inlineText, summarize } from './diagnosticText';
import { hintLines, isFollowOnLine, isQuietLine, visibleSpans, type LineDiagnostic } from './diagnosticStore';
import { OverlayScrollbar, SCROLLBAR_PX, useScrollMetrics } from './OverlayScrollbar';
import { isOverflowing } from './scrollThumb';
import { useRevealLine, type RevealRequest } from './useRevealLine';
import type { CharRange, Token } from './vhdlHighlight';
import type { FindDecor } from './find/useFind';
import { decorateLine, type DecoratedPiece } from './symbols/decorateLine';
import { occurrencesByLine } from './symbols/occurrences';
import type { FileSymbols } from './symbols/fileSymbols';
import type { HdlSymbol, Occurrence, OccurrenceKind } from './symbols/types';
import { useCaretSymbol } from './symbols/useCaretSymbol';
import { useHoveredSymbol } from './symbols/useHoveredSymbol';

/** The file a surface edits. */
export interface EditorTab {
  id: string;
  name: string;
  content: string;
}

const NO_RANGES: readonly CharRange[] = [];
const NO_OCCURRENCES: readonly Occurrence[] = [];

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
}) {
  const pieces = decorateLine(tokens, diagnostic ? visibleSpans(diagnostic) : NO_RANGES, occurrences, findRanges, currentFind);
  const inline = diagnostic ? inlineText(diagnostic) : '';
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
  gutterRef,
}: {
  lines: readonly string[];
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
}: EditorSurfaceProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scroll = useScrollMetrics(textareaRef);
  // Where both bars show, each stops short of the corner the other one runs into.
  const bothBars = isOverflowing(scroll.x) && isOverflowing(scroll.y);
  const cornerInset = bothBars ? SCROLLBAR_PX : 0;
  // Built once per edit by the caller; the same arrays let the memoised gutter and lines skip a highlight change.
  const { lines, tokenLines, index: symbolIndex } = symbols;
  // Symbol occurrence highlighting: looked up on hover or at the text cursor.
  // The pointer wins while it rests on a name.
  const hovered = useHoveredSymbol(file.id, lines, symbolIndex);
  const atCaret = useCaretSymbol(file.id, file.content, symbolIndex);
  const highlighted = hovered.symbol ?? (highlightsCursor ? atCaret.symbol : undefined);
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
  useRevealLine(textareaRef, file, reveal);
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
      <EditorGutter lines={lines} linesByNumber={linesByNumber} hints={hints} gutterRef={gutterRef} />
      <div className="wb-editor__surface">
        <pre className="wb-editor__highlight" ref={preRef} aria-hidden="true">
          {lines.map((line, i) => (
            <HighlightedLine
              line={line}
              tokens={tokenLines[i] ?? []}
              key={i}
              diagnostic={linesByNumber.get(i + 1)}
              hintFrom={hints.get(i + 1)}
              occurrences={occurrences.get(i) ?? NO_OCCURRENCES}
              findRanges={findDecor?.byLine.get(i) ?? NO_RANGES}
              currentFind={findDecor?.currentLine === i ? findDecor.current : undefined}
            />
          ))}
        </pre>
        <textarea
          ref={textareaRef}
          className="wb-editor__textarea wb-scrollbar-host"
          value={file.content}
          spellCheck={false}
          wrap="off"
          onScroll={handleScroll}
          onChange={(e) => onChange(file.id, e.target.value)}
          {...hovered.handlers}
          onSelect={atCaret.onSelect}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && onFindEscape?.()) e.preventDefault();
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
