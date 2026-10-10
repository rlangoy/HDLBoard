// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { countLines, lineHeightOrFallback } from '../diagnosticLocation';
import type { CharRange } from '../vhdlHighlight';
import { applyEdit } from './applyEdit';
import { MAX_SEED_LENGTH, cleanQuery, findMatches, lineOfOffset, matchesByLine, replaceAllText, stillMatches, type FindResult, type TextMatch } from './findMatches';
import { anchorAfterReplace, firstAtOrAfter, stepIndex } from './findNavigation';
import { counterText, replacedAll } from './findText';

/** Above this much text the search waits 80 ms after the last keystroke (§ 5.2). */
export const DEBOUNCE_ABOVE_CHARS = 200_000;
const DEBOUNCE_MS = 80;
/** How long 0 matches must last before the replace controls hide (D9a). */
export const REPLACE_HIDE_MS = 400;
/** How long "Replaced n" shows (same as the Copy button's tick). */
const CONFIRMATION_MS = 1500;

/** The file a pane's search covers. */
export interface FindFile {
  readonly id: string;
  readonly content: string;
}

/** What a pane's code draws for its search (§ 5.4): ranges by 0-based line, and the current match on its line. */
export interface FindDecor {
  readonly byLine: ReadonlyMap<number, readonly CharRange[]>;
  readonly currentLine: number;
  readonly current: CharRange | undefined;
}

/** One pane's search (docs/impl_search.md § 6.3). Each pane has its own (S1). */
export interface FindController {
  readonly open: boolean;
  readonly query: string;
  readonly replacement: string;
  readonly replaceOpen: boolean;
  /** Whether Replace ⌄, Replace All and the replace row show (D9a). */
  readonly replaceVisible: boolean;
  readonly matchCount: number;
  readonly currentIndex: number;
  /** `x of n`, `No results`, `Replaced n`, or nothing. */
  readonly counter: string;
  readonly noResults: boolean;
  /** Changes whenever the Find field should take focus (and select its text). */
  readonly focusFindToken: number;
  /** Changes whenever the Replace field should take focus. */
  readonly focusReplaceToken: number;
  /** For the pane's code; null while closed or without matches. */
  readonly decor: FindDecor | null;
  /** The pane's textarea registers itself here (a callback ref). */
  readonly attach: (textarea: HTMLTextAreaElement | null) => void;
  readonly openBar: (options?: { seedFromSelection?: boolean; replace?: boolean }) => void;
  readonly close: () => void;
  readonly toggle: () => void;
  readonly setQuery: (query: string) => void;
  readonly setReplacement: (replacement: string) => void;
  readonly toggleReplace: () => void;
  readonly step: (dir: 1 | -1) => void;
  readonly replaceCurrent: () => void;
  readonly replaceAll: () => void;
}

const NO_RESULT: FindResult = { matches: [], capped: false };

/** What is waiting to be scrolled into view after the next render. */
type PendingReveal = { readonly afterEditOf: string | null } | null;

/**
 * One pane's Find bar state over its file. The current match is derived from an
 * *anchor* offset (findNavigation.ts): opening sets it to the caret, stepping to
 * the match stepped to, Replace past the inserted text (D8); an edit in the code
 * leaves it, so the current match stays near where it was (D14). Nothing is
 * searched while the bar is closed (D14a).
 */
export function useFind(file: FindFile | undefined): FindController {
  const [open, setOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [replacement, setReplacement] = useState('');
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [anchor, setAnchor] = useState(0);
  const [focusFindToken, setFocusFindToken] = useState(0);
  const [focusReplaceToken, setFocusReplaceToken] = useState(0);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingReveal = useRef<PendingReveal>(null);

  const content = file?.content ?? '';
  const searched = useDebounced(query, content.length > DEBOUNCE_ABOVE_CHARS ? DEBOUNCE_MS : 0);
  const result = useMemo(() => (open ? findMatches(content, searched) : NO_RESULT), [open, content, searched]);
  const { matches } = result;
  const currentIndex = firstAtOrAfter(matches, anchor);
  const current: TextMatch | undefined = matches[currentIndex];
  const byLine = useMemo(() => matchesByLine(content, matches), [content, matches]);
  const decor = useMemo(() => decorFor(content, byLine, current), [content, byLine, current]);
  const replaceVisible = useReplaceVisible(matches.length > 0);
  useConfirmationTimeout(confirmation, setConfirmation);

  // D13: another file in this pane: keep the query, start again from the caret.
  const fileId = file?.id;
  useLayoutEffect(() => {
    setAnchor(textareaRef.current?.selectionStart ?? 0);
  }, [fileId]);

  // Scroll the current match into view after the find action that asked for it.
  useLayoutEffect(() => {
    const pending = pendingReveal.current;
    const textarea = textareaRef.current;
    if (!pending || !textarea || !open) return;
    if (pending.afterEditOf !== null && pending.afterEditOf === content) return; // the edit has not arrived yet
    if (searched !== query) return; // still debouncing
    pendingReveal.current = null;
    if (current) revealMatch(textarea, content, current);
  });

  const attach = useCallback((textarea: HTMLTextAreaElement | null) => {
    textareaRef.current = textarea;
  }, []);

  const requestReveal = (afterEditOf: string | null = null) => {
    pendingReveal.current = { afterEditOf };
  };

  const openBar = (options: { seedFromSelection?: boolean; replace?: boolean } = {}) => {
    const textarea = textareaRef.current;
    const seed = options.seedFromSelection && textarea ? selectedSeed(textarea) : undefined;
    if (seed !== undefined) setQueryState(cleanQuery(seed));
    if ((!open || seed !== undefined) && textarea) setAnchor(textarea.selectionStart);
    if (options.replace) setReplaceOpen(true);
    setOpen(true);
    setFocusFindToken((t) => t + 1);
    requestReveal();
  };

  const close = () => {
    setOpen(false);
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    if (current) textarea.setSelectionRange(current.start, current.end);
  };

  const step = (dir: 1 | -1) => {
    const next = stepIndex(currentIndex, matches.length, dir);
    if (next < 0) return;
    setAnchor(matches[next].start);
    requestReveal();
  };

  const replaceCurrent = () => {
    const textarea = textareaRef.current;
    if (!textarea || !current) return;
    if (!stillMatches(textarea.value, current, query)) {
      requestReveal();
      return;
    }
    setAnchor(anchorAfterReplace(current, replacement.length));
    requestReveal(textarea.value);
    applyEdit(textarea, current.start, current.end, replacement);
  };

  const replaceAll = () => {
    const textarea = textareaRef.current;
    if (!replaceOpen) {
      // D9: never "replace with nothing" by accident; show the field first.
      setReplaceOpen(true);
      setFocusReplaceToken((t) => t + 1);
      return;
    }
    if (!textarea || query.length === 0) return;
    // Every match, not only the highlighted MAX_MATCHES.
    const all = findMatches(textarea.value, query, Number.POSITIVE_INFINITY).matches;
    if (all.length === 0) return;
    const { text, caret } = replaceAllText(textarea.value, all, replacement);
    applyEdit(textarea, 0, textarea.value.length, text, { keepView: true, caret });
    setConfirmation(replacedAll(all.length));
  };

  return {
    open,
    query,
    replacement,
    replaceOpen,
    replaceVisible,
    matchCount: matches.length,
    currentIndex,
    counter: confirmation ?? counterText(searched, currentIndex, matches.length, result.capped),
    noResults: open && searched.length > 0 && matches.length === 0,
    focusFindToken,
    focusReplaceToken,
    decor: open ? decor : null,
    attach,
    openBar,
    close,
    toggle: () => (open ? close() : openBar()),
    setQuery: (q) => {
      setQueryState(cleanQuery(q));
      setConfirmation(null);
      requestReveal();
    },
    setReplacement: (r) => setReplacement(cleanQuery(r)),
    toggleReplace: () => setReplaceOpen((o) => !o),
    step,
    replaceCurrent,
    replaceAll,
  };
}

/** The selection Ctrl+F takes as the query: one line, at most MAX_SEED_LENGTH (D10). */
function selectedSeed(textarea: HTMLTextAreaElement): string | undefined {
  const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  if (selected.length === 0 || selected.length > MAX_SEED_LENGTH || selected.includes('\n')) return undefined;
  return selected;
}

function decorFor(content: string, byLine: ReadonlyMap<number, readonly CharRange[]>, current: TextMatch | undefined): FindDecor | null {
  if (byLine.size === 0) return null;
  if (!current) return { byLine, currentLine: -1, current: undefined };
  const lineStart = content.lastIndexOf('\n', current.start - 1) + 1;
  return {
    byLine,
    currentLine: lineOfOffset(content, current.start),
    current: { start: current.start - lineStart, end: current.end - lineStart },
  };
}

/**
 * Scrolls a match into view (§ 5.4): its line to the middle when it is off screen,
 * and sideways from the drawn current-match span (never column × ch arithmetic).
 * If the span is not drawn yet, it measures again on the next frame.
 */
function revealMatch(textarea: HTMLTextAreaElement, content: string, match: TextMatch) {
  const lineHeight = lineHeightOrFallback(getComputedStyle(textarea).lineHeight, textarea.scrollHeight, countLines(content));
  const top = lineOfOffset(content, match.start) * lineHeight;
  if (top < textarea.scrollTop || top + lineHeight > textarea.scrollTop + textarea.clientHeight) {
    textarea.scrollTop = Math.max(0, top - textarea.clientHeight / 2);
  }
  if (!revealSideways(textarea)) requestAnimationFrame(() => revealSideways(textarea));
}

function revealSideways(textarea: HTMLTextAreaElement): boolean {
  const pre = textarea.parentElement?.querySelector('pre');
  const pieces = pre?.querySelectorAll<HTMLElement>('.wb-editor__find-current');
  if (!pre || !pieces || pieces.length === 0) return false;
  const preLeft = pre.getBoundingClientRect().left - pre.scrollLeft;
  const left = pieces[0].getBoundingClientRect().left - preLeft;
  const right = pieces[pieces.length - 1].getBoundingClientRect().right - preLeft;
  const view = textarea.clientWidth;
  if (left < textarea.scrollLeft || right > textarea.scrollLeft + view) {
    textarea.scrollLeft = Math.max(0, left - view / 3);
  }
  return true;
}

function useDebounced(value: string, delay: number): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (delay === 0) return undefined;
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return delay === 0 ? value : settled;
}

/** D9a: shown at once with matches; hidden only once 0 matches have lasted REPLACE_HIDE_MS. */
function useReplaceVisible(hasMatches: boolean): boolean {
  const [lingering, setLingering] = useState(false);
  useEffect(() => {
    if (hasMatches) {
      setLingering(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setLingering(false), REPLACE_HIDE_MS);
    return () => window.clearTimeout(timer);
  }, [hasMatches]);
  return hasMatches || lingering;
}

function useConfirmationTimeout(confirmation: string | null, set: (c: string | null) => void) {
  useEffect(() => {
    if (confirmation === null) return undefined;
    const timer = window.setTimeout(() => set(null), CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [confirmation, set]);
}
