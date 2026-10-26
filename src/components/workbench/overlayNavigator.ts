// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Asks whether to leave; calls `proceed` once the user agrees (at once when nothing is at stake). */
export type LeaveGuard = (proceed: () => void) => void;

/**
 * Runs navigation actions, first asking the registered guard while `guarded()` holds.
 * Actions that run after the guard agrees are not guarded again, however many
 * navigations they trigger themselves.
 */
export function createNavigator(guarded: () => boolean) {
  let guard: LeaveGuard | null = null;
  let running = false;
  const run = (action: () => void) => {
    const outer = running;
    running = true;
    try {
      action();
    } finally {
      running = outer;
    }
  };
  return {
    registerGuard(next: LeaveGuard | null) {
      guard = next;
    },
    navigate(action: () => void) {
      if (!running && guard && guarded()) guard(() => run(action));
      else run(action);
    },
  };
}
