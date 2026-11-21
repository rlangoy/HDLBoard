// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useLayoutEffect, useRef } from 'react';
import { TOP_FILE_TEXT, chipTitle, makeTopLabel } from './topFileText';
import type { TopFileSuggestion } from './topFileSuggestion';

export interface TopFileChipProps {
  suggestion: TopFileSuggestion;
  onMakeTop: () => void;
  onDismiss: () => void;
}

/**
 * The pane header's quiet offer, before Start is ever pressed: the file on screen looks
 * like the Top-File and is not it. Only the action is shown, so it fits a narrow pane;
 * the reason is its tooltip, and a screen reader hears the file's name. Shaped like the
 * testbench suggestion chip, in the Top-File's blue, so the two read
 * as one thing. `role="status"`, and it never takes focus.
 */
export function TopFileChip({ suggestion, onMakeTop, onDismiss }: TopFileChipProps) {
  const { slotRef, sizerRef, chipRef } = useFold();
  return (
    <div className="wb-tbchip-slot" ref={slotRef}>
      <span className="wb-tbchip wb-tbchip--top wb-tbchip__sizer" ref={sizerRef} aria-hidden="true">
        <span className="wb-tbchip__info" />
        <span className="wb-tbchip__open wb-tbchip__label">{TOP_FILE_TEXT.makeTop}</span>
        <span className="wb-tbchip__dismiss" />
      </span>
      <div className="wb-tbchip wb-tbchip--top" ref={chipRef} role="status" title={chipTitle(suggestion)}>
        {/* The ⓘ sets the Top File, and is all that stays when the header is tight. */}
        <button
          type="button"
          className="wb-tbchip__open wb-tbchip__info"
          aria-label={makeTopLabel(suggestion.label)}
          onClick={onMakeTop}
        >
          <svg className="wb-tbchip__icon" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="8" cy="4.9" r="1" fill="currentColor" />
            <path d="M8 7.2v4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        {/* The label repeats the ⓘ for the mouse, so it is hidden from the keyboard and screen readers. */}
        <button type="button" className="wb-tbchip__open wb-tbchip__label" tabIndex={-1} aria-hidden="true" onClick={onMakeTop}>
          {TOP_FILE_TEXT.makeTop}
        </button>
        <button
          type="button"
          className="wb-tbchip__dismiss"
          aria-label={TOP_FILE_TEXT.dismiss}
          title={TOP_FILE_TEXT.dismiss}
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
}

/** Half a pixel: the slot's width is fractional, and a chip that just fits must not fold. */
const FIT_SLACK_PX = 0.5;

/**
 * Folds the chip in steps as the header gets tight: first the label goes, leaving a fixed
 * gap before the ×; then the × goes, leaving the ⓘ. The slot takes whatever width the
 * header gives it (its natural width is the hidden full-size copy's), so folding never
 * changes the slot's size and never feeds back. The step is set on the chip straight from
 * the observer, before the frame is painted.
 */
function useFold() {
  const slotRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLSpanElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const slot = slotRef.current;
    const sizer = sizerRef.current;
    const chip = chipRef.current;
    if (!slot || !sizer || !chip || typeof ResizeObserver === 'undefined') return undefined;
    chip.dataset.fold = 'label';
    const foldedWidth = chip.getBoundingClientRect().width; // no text, so no font changes it
    const fold = () => {
      const room = slot.getBoundingClientRect().width + FIT_SLACK_PX;
      if (room >= sizer.getBoundingClientRect().width) delete chip.dataset.fold;
      else chip.dataset.fold = room >= foldedWidth ? 'label' : 'all';
    };
    fold();
    const observer = new ResizeObserver(fold);
    observer.observe(slot);
    observer.observe(sizer); // the label's font arriving late
    return () => observer.disconnect();
  }, []);
  return { slotRef, sizerRef, chipRef };
}
