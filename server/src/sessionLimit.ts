// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * What a full server (`HDL_MAX_SESSIONS`) does with one more connection. In order:
 *
 *  1. It closes the session that has been idle longest — not compiling or running. One idle
 *     less than `HDL_IDLE_GRACE_SECONDS` is spared, unless its address has another session
 *     too: one student's extra tabs give way before anyone else's only one.
 *  2. Failing that, it closes the oldest session open at least `HDL_REPLACE_AFTER_MINUTES`,
 *     an idle one before a simulating one.
 *  3. Failing that, it refuses the new connection.
 *
 * A `HDL_REPLACE_AFTER_MINUTES` of 0 turns replacing off: every new connection is refused.
 * Each student turned away is told why in an `ERROR busy` frame, and the server logs it.
 */

import { MS_PER_MINUTE } from './timeUnits.js';

/** Where the offline version (the Windows and Linux apps) is downloaded. */
export const RELEASES_URL = 'https://github.com/rlangoy/HDLBoard/releases';

const OFFLINE_HINT = `download the offline version of HDLBoard to simulate on your own computer: ${RELEASES_URL}`;

/** One open connection, as the choice of which to close sees it. */
export interface OpenSession {
  /** When the connection opened, in ms (`Date.now()`). */
  readonly openedAt: number;
  /** Whether it is compiling or running a simulation right now. */
  readonly simulating: boolean;
  /** When it last stopped simulating, or when it opened if it never simulated. */
  readonly idleSince: number;
  /** Where the student connects from (clientAddress.ts). */
  readonly clientAddress: string;
}

/** The connection that wants a place. */
export interface Newcomer {
  readonly clientAddress: string;
  /** When it connected, in ms. */
  readonly at: number;
}

/** How many of `open`, with the newcomer, come from `address`. */
export function sessionsFrom(address: string, open: readonly OpenSession[], newcomer: Newcomer): number {
  const newcomerShares = newcomer.clientAddress === address ? 1 : 0;
  return open.filter((session) => session.clientAddress === address).length + newcomerShares;
}

export class ReplacementPolicy {
  constructor(
    private readonly replaceAfterMs: number,
    private readonly idleGraceMs: number,
  ) {}

  /** The session to close for `newcomer`, or undefined: the newcomer is refused. */
  sessionToClose<T extends OpenSession>(open: readonly T[], newcomer: Newcomer): T | undefined {
    const replacingIsOff = this.replaceAfterMs <= 0;
    if (replacingIsOff) return undefined;
    return this.longestIdle(open, newcomer) ?? this.oldest(open, newcomer.at);
  }

  private longestIdle<T extends OpenSession>(open: readonly T[], newcomer: Newcomer): T | undefined {
    const closable = open.filter((session) => isIdle(session) && this.mayCloseIdle(session, open, newcomer));
    return first(closable, (a, b) => a.idleSince - b.idleSince);
  }

  private mayCloseIdle(session: OpenSession, open: readonly OpenSession[], newcomer: Newcomer): boolean {
    const pastGrace = newcomer.at - session.idleSince >= this.idleGraceMs;
    const sharesAddress = sessionsFrom(session.clientAddress, open, newcomer) > 1;
    return pastGrace || sharesAddress;
  }

  private oldest<T extends OpenSession>(open: readonly T[], now: number): T | undefined {
    const oldEnough = open.filter((session) => now - session.openedAt >= this.replaceAfterMs);
    return first(oldEnough, idleFirstThenOldest);
  }
}

function isIdle(session: OpenSession): boolean {
  return !session.simulating;
}

/** An idle session before a simulating one — its student loses nothing running — then the older. */
function idleFirstThenOldest(a: OpenSession, b: OpenSession): number {
  if (a.simulating !== b.simulating) return a.simulating ? 1 : -1;
  return a.openedAt - b.openedAt;
}

function first<T>(items: readonly T[], order: (a: T, b: T) => number): T | undefined {
  return [...items].sort(order)[0];
}

/** To the student whose idle session was closed to make room. */
export function closedIdleText(): string {
  return (
    'Your simulation session was closed because it was not simulating and another student needed the place. ' +
    `Click Start to try again, or ${OFFLINE_HINT}`
  );
}

/** To the student whose simulation was closed to make room. */
export function closedSimulatingText(): string {
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

/** What every `ERROR busy` line in the server log starts with. */
export const BUSY_LOG_PREFIX = 'hdl-board: ERROR busy:';

/** The server log's line for a session closed to make room; `sameAddress` counts the newcomer too. */
export function closedLogLine(closed: OpenSession, sameAddress: number, now: number): string {
  const openMinutes = wholeMinutes(now - closed.openedAt);
  return `${BUSY_LOG_PREFIX} closed a session open ${openMinutes} min (${stateNote(closed, sameAddress, now)}) to make room for a new one`;
}

function stateNote(closed: OpenSession, sameAddress: number, now: number): string {
  if (closed.simulating) return 'simulating';
  const idle = `idle ${wholeMinutes(now - closed.idleSince)} min`;
  return sameAddress > 1 ? `${idle}, ${sameAddress} sessions from its address` : idle;
}

/** The server log's line for a newcomer refused because no session could be closed. */
export function refusedLogLine(open: readonly OpenSession[]): string {
  const simulating = open.filter((session) => session.simulating).length;
  const idle = open.length - simulating;
  return `${BUSY_LOG_PREFIX} refused a new session, all ${open.length} in use (${simulating} simulating, ${idle} idle)`;
}

function wholeMinutes(ms: number): number {
  return Math.floor(ms / MS_PER_MINUTE);
}
