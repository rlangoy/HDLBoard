// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { memo, useId, useMemo, useRef, type RefObject, type UIEvent } from 'react';
import { cx } from '../board';
import { describeHint, describeLine, inlineText, summarize } from './diagnosticText';
import { hintLines, isFollowOnLine, isQuietLine, visibleSpans, type LineDiagnostic } from './diagnosticStore';
import { languageOfName } from './fileKinds';
import { OverlayScrollbar, SCROLLBAR_PX, useScrollMetrics } from './OverlayScrollbar';
import { isOverflowing } from './scrollThumb';
import { useRevealLine, type RevealRequest } from './useRevealLine';
import { tokenizeSource } from './highlight';
import type { CharRange, Token } from './vhdlHighlight';
import { decorateLine, type DecoratedPiece } from './symbols/decorateLine';
import { occurrencesByLine } from './symbols/occurrences';
import { buildSymbolIndex } from './symbols/symbolIndex';
import type { Occurrence, OccurrenceKind } from './symbols/types';
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
  return piece.occurrence ? <span className={OCCURRENCE_CLASS[piece.occurrence]}>{underlined}</span> : <>{underlined}</>;
}

const HighlightedLine = memo(function HighlightedLine({
  line,
  tokens,
  diagnostic,
  hintFrom,
  occurrences,
}: {
  line: string;
  /** The line's tokens (`tokenizeSource`); together they are `line`. */
  tokens: readonly Token[];
  diagnostic?: LineDiagnostic;
  /** Rules D and E point at this line from that marked line. */
  hintFrom?: LineDiagnostic;
  /** The hovered symbol's declaration and references on this line. */
  occurrences: readonly Occurrence[];
}) {
  const pieces = decorateLine(tokens, diagnostic ? visibleSpans(diagnostic) : NO_RANGES, occurrences);
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
}: EditorSurfaceProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scroll = useScrollMetrics(textareaRef);
  // Where both bars show, each stops short of the corner the other one runs into.
  const bothBars = isOverflowing(scroll.x) && isOverflowing(scroll.y);
  const cornerInset = bothBars ? SCROLLBAR_PX : 0;
  const lines = file.content.split('\n');
  const language = languageOfName(file.name);
  // Whole file at once: a Verilog block comment runs across lines. Recomputed only when the text or language changes.
  const tokenLines = useMemo(() => tokenizeSource(language, file.content.split('\n')), [language, file.content]);
  // Symbol occurrence highlighting: analysed once per edit, looked up on hover.
  const symbolIndex = useMemo(() => buildSymbolIndex(language, tokenLines), [language, tokenLines]);
  const hovered = useHoveredSymbol(lines, symbolIndex);
  const occurrences = useMemo(() => occurrencesByLine(hovered.symbol), [hovered.symbol]);
  const linesByNumber = useMemo(() => new Map(diagnostics.map((d) => [d.line, d])), [diagnostics]);
  const hints = useMemo(() => hintLines(diagnostics), [diagnostics]);
  // Computed only from the stored lines, so a repeating assertion that adds
  // nothing leaves the text unchanged and the live region silent.
  const status = useMemo(() => summarize(file.name, diagnostics), [file.name, diagnostics]);
  const statusId = useId();
  useRevealLine(textareaRef, file, reveal);

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
          aria-label={label ?? `${file.name} source`}
          aria-describedby={statusId}
        />
        <OverlayScrollbar targetRef={textareaRef} axis="y" metrics={scroll.y} endInset={cornerInset} />
        <OverlayScrollbar targetRef={textareaRef} axis="x" metrics={scroll.x} endInset={cornerInset} />
      </div>
    </div>
  );
}
