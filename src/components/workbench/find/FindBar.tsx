// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { cx } from '../../board';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, SearchIcon } from '../icons';
import { usePaneFind } from './FindContext';
import { FIND_TEXT, findLabel, replaceLabel } from './findText';
import { REPLACE_HIDE_MS } from './useFind';
import './FindBar.css';

/** Below this width the bar wraps (§ 5.5). Kept in step with the container query in FindBar.css. */
export const FINDBAR_WRAP_PX = 420;

/**
 * A pane's Find bar, under its header (docs/impl_search.md § 5.2, § 5.3): the Find
 * field, previous / next, the counter, and while there are matches Replace ⌄ and
 * Replace All (D9a); the replace row below when open. Searches this pane's file only (S1).
 */
export function FindBar({ fileName }: { fileName: string }) {
  const find = usePaneFind();
  const findRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const focusWasInReplaceRow = useRef(false);
  const live = useLiveCounter(find?.counter ?? '', find?.query ?? '');

  useEffect(() => {
    if (!find?.focusFindToken) return;
    findRef.current?.focus();
    findRef.current?.select();
  }, [find?.focusFindToken]);

  useEffect(() => {
    if (find?.focusReplaceToken) replaceRef.current?.focus();
  }, [find?.focusReplaceToken]);

  const replaceRowShown = Boolean(find?.replaceVisible && find.replaceOpen);
  // § 5.3: the replace row went away under the cursor; keep focus in the bar.
  useEffect(() => {
    if (replaceRowShown || !focusWasInReplaceRow.current) return;
    focusWasInReplaceRow.current = false;
    findRef.current?.focus();
  }, [replaceRowShown]);

  if (!find?.open) return null;
  const hasMatches = find.matchCount > 0;

  const onBarKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    find.close();
  };
  const onFindKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    find.step(e.shiftKey ? -1 : 1);
  };
  const onReplaceKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) find.replaceAll();
    else find.replaceCurrent();
  };

  return (
    <div className="wb-findbar" role="search" aria-label={findLabel(fileName)} onKeyDown={onBarKeyDown}>
      <div className="wb-findbar__row">
        <span className={cx('wb-findbar__field', find.noResults && 'is-invalid')}>
          <SearchIcon className="wb-findbar__glass" aria-hidden="true" />
          <input
            ref={findRef}
            type="text"
            className="wb-findbar__input"
            value={find.query}
            placeholder={FIND_TEXT.findPlaceholder}
            aria-label={findLabel(fileName)}
            aria-invalid={find.noResults || undefined}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => find.setQuery(e.target.value)}
            onKeyDown={onFindKeyDown}
          />
          {find.query.length > 0 && (
            <button
              type="button"
              className="wb-findbar__clear"
              aria-label={FIND_TEXT.clearQuery}
              title={FIND_TEXT.clearQuery}
              onClick={() => {
                find.setQuery('');
                findRef.current?.focus();
              }}
            >
              <CloseIcon aria-hidden="true" />
            </button>
          )}
        </span>
        <span className="wb-findbar__steps">
          <button type="button" className="wb-findbar__step" aria-label={FIND_TEXT.previous} title={FIND_TEXT.previous} disabled={!hasMatches} onClick={() => find.step(-1)}>
            <ChevronUpIcon aria-hidden="true" />
          </button>
          <button type="button" className="wb-findbar__step" aria-label={FIND_TEXT.next} title={FIND_TEXT.next} disabled={!hasMatches} onClick={() => find.step(1)}>
            <ChevronDownIcon aria-hidden="true" />
          </button>
        </span>
        <span className="wb-findbar__count">{find.counter}</span>
        {find.replaceVisible && (
          <span className="wb-findbar__actions">
            <button
              type="button"
              className={cx('wb-findbar__btn', 'wb-findbar__toggle', find.replaceOpen && 'is-open')}
              aria-expanded={find.replaceOpen}
              title={find.replaceOpen ? FIND_TEXT.hideReplace : FIND_TEXT.showReplace}
              onClick={() => find.toggleReplace()}
            >
              {FIND_TEXT.replaceToggle}
              <ChevronDownIcon aria-hidden="true" />
            </button>
            <button type="button" className="wb-findbar__btn wb-findbar__btn--primary" title={FIND_TEXT.replaceAllTitle} onClick={() => find.replaceAll()}>
              {FIND_TEXT.replaceAll}
            </button>
          </span>
        )}
        <button type="button" className="wb-findbar__close" aria-label={FIND_TEXT.close} title={FIND_TEXT.close} onClick={() => find.close()}>
          <CloseIcon aria-hidden="true" />
        </button>
      </div>
      {replaceRowShown && (
        <div
          className="wb-findbar__row wb-findbar__row--replace"
          onFocus={() => {
            focusWasInReplaceRow.current = true;
          }}
          onBlur={(e) => {
            if (e.relatedTarget) focusWasInReplaceRow.current = false;
          }}
        >
          <span className="wb-findbar__field">
            <input
              ref={replaceRef}
              type="text"
              className="wb-findbar__input"
              value={find.replacement}
              placeholder={FIND_TEXT.replacePlaceholder}
              aria-label={replaceLabel(fileName)}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => find.setReplacement(e.target.value)}
              onKeyDown={onReplaceKeyDown}
            />
          </span>
          <button type="button" className="wb-findbar__btn" title={FIND_TEXT.replaceTitle} onClick={() => find.replaceCurrent()}>
            {FIND_TEXT.replace}
          </button>
        </div>
      )}
      <span className="wb-sr-only" aria-live="polite">
        {live}
      </span>
    </div>
  );
}

/**
 * The screen-reader copy of the counter (§ 5.2): it follows the visible counter
 * REPLACE_HIDE_MS after the last keystroke in the Find field, so one result is read
 * per pause, and at once for anything else (stepping, replacing).
 */
function useLiveCounter(counter: string, query: string): string {
  const [live, setLive] = useState(counter);
  const typedAt = useRef(0);
  useEffect(() => {
    typedAt.current = Date.now();
  }, [query]);
  useEffect(() => {
    const wait = typedAt.current + REPLACE_HIDE_MS - Date.now();
    if (wait <= 0) {
      setLive(counter);
      return undefined;
    }
    const timer = window.setTimeout(() => setLive(counter), wait);
    return () => window.clearTimeout(timer);
  }, [counter]);
  return live;
}
