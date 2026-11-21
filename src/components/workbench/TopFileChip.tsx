// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

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
  return (
    <div className="wb-tbchip wb-tbchip--top" role="status" title={chipTitle(suggestion)}>
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
      {/* The × comes first: shown last, it folds away after the label. The label repeats the ⓘ for the mouse, so it is hidden from the keyboard and screen readers. */}
      <span className="wb-tbchip__rest">
        <button
          type="button"
          className="wb-tbchip__dismiss"
          aria-label={TOP_FILE_TEXT.dismiss}
          title={TOP_FILE_TEXT.dismiss}
          onClick={onDismiss}
        >
          ×
        </button>
        <button type="button" className="wb-tbchip__open" tabIndex={-1} aria-hidden="true" onClick={onMakeTop}>
          {TOP_FILE_TEXT.makeTop}
        </button>
      </span>
    </div>
  );
}
