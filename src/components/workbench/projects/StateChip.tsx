// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { AlertIcon, CheckIcon } from '../icons';

/** The open project has changes its save destination does not hold. */
export function UnsavedChip() {
  return (
    <span className="wb-projects-chip is-unsaved">
      <AlertIcon aria-hidden="true" />
      Unsaved changes
    </span>
  );
}

/** Whether one place holds the open project as it is now. */
export type SavedState = 'saved' | 'changed' | 'not-saved';

const SAVED_LABEL: Record<SavedState, string> = {
  saved: 'Saved',
  changed: 'Unsaved changes',
  'not-saved': 'Not saved here',
};

export function SavedChip({ state }: { state: SavedState }) {
  return (
    <span className={`wb-projects-chip is-${state}`}>
      {state === 'saved' ? <CheckIcon aria-hidden="true" /> : <span className="wb-projects-chip__dot" aria-hidden="true" />}
      {SAVED_LABEL[state]}
    </span>
  );
}
