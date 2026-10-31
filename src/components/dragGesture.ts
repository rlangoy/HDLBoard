// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** What every drag in HDLBoard shares: the waveform's signals and the Board pane's panels. */

/** A press that moves less than this is a click, not a drag. */
export const DRAG_THRESHOLD_PX = 4;

/** The click a browser sends after the release of a drag would act on whatever is under the pointer. */
export function swallowNextClick(): void {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();
  };
  window.addEventListener('click', swallow, { capture: true, once: true });
  window.setTimeout(() => window.removeEventListener('click', swallow, true), 0);
}
