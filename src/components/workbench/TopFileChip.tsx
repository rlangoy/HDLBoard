// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { TOP_FILE_TEXT, chipText, chipTitle } from './topFileText';
import type { TopFileSuggestion } from './topFileSuggestion';

export interface TopFileChipProps {
  suggestion: TopFileSuggestion;
  onMakeTop: () => void;
  onDismiss: () => void;
}

/**
 * The pane header's quiet offer, before Start is ever pressed: the file on screen looks
 * like the Top-File and is not it. Shaped like the testbench suggestion chip, in the
 * Top-File's blue with the Files dot, so the two read as one thing. `role="status"`,
 * and it never takes focus.
 */
export function TopFileChip({ suggestion, onMakeTop, onDismiss }: TopFileChipProps) {
  return (
    <div className="wb-tbchip wb-tbchip--top" role="status" title={chipTitle(suggestion)}>
      <span className="wb-tbchip__dot" aria-hidden="true" />
      <span className="wb-tbchip__text">{chipText(suggestion.fileName)}</span>
      <button type="button" className="wb-tbchip__open" onClick={onMakeTop}>
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
  );
}
