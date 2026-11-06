// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What a full server does with one more connection (`HDL_MAX_SESSIONS`): it closes a
 * session that has been open a long time (`HDL_REPLACE_AFTER_MINUTES`) and takes the new
 * one, or, when every session is younger than that, refuses the new one. Both students
 * are told why in an `ERROR busy` frame, with where to get HDLBoard to run on their own
 * computer.
 */

export const MS_PER_MINUTE = 60_000;

/** Where the offline version (the Windows and Linux apps) is downloaded. */
export const RELEASES_URL = 'https://github.com/rlangoy/HDLBoard/releases';

const OFFLINE_HINT = `download the offline version of HDLBoard to simulate on your own computer: ${RELEASES_URL}`;

/** One open connection, as the choice of which to close sees it. */
export interface OpenSession {
  /** When the connection opened, in ms (`Date.now()`). */
  readonly openedAt: number;
  /** Whether it is compiling or running a simulation right now. */
  readonly simulating: boolean;
}

/**
 * The session to close for a new one: of those open at least `replaceAfterMs`, one that is
 * not simulating if there is one — its student loses nothing running — and the oldest
 * among those. Undefined when none is old enough, or when `replaceAfterMs` is 0 (never).
 */
export function sessionToReplace<T extends OpenSession>(open: Iterable<T>, now: number, replaceAfterMs: number): T | undefined {
  if (replaceAfterMs <= 0) return undefined;
  let best: T | undefined;
  for (const candidate of open) {
    if (now - candidate.openedAt < replaceAfterMs) continue;
    if (best === undefined || better(candidate, best)) best = candidate;
  }
  return best;
}

function better(a: OpenSession, b: OpenSession): boolean {
  if (a.simulating !== b.simulating) return !a.simulating;
  return a.openedAt < b.openedAt;
}

/** To the student whose session was closed to make room. */
export function replacedText(): string {
  return (
    'Your simulation session was closed because the server is under heavy load and another student needed the place. ' +
    `Click Start to try again, or ${OFFLINE_HINT}`
  );
}

/** To the student who could not get a session. */
export function fullText(maxSessions: number): string {
  const all = maxSessions === 1 ? 'its only simulation session is' : `all ${maxSessions} simulation sessions are`;
  return `The server is busy: ${all} in use. Try again in a few minutes, or ${OFFLINE_HINT}`;
}
