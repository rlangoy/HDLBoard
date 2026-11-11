// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  RELEASES_URL,
  ReplacementPolicy,
  closedIdleText,
  closedLogLine,
  closedSimulatingText,
  fullText,
  refusedLogLine,
  sessionsFrom,
  type Newcomer,
  type OpenSession,
} from './sessionLimit.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const NOW = 100 * MINUTE;
const NINE_MINUTES = 9 * MINUTE;
const ONE_MINUTE_GRACE = MINUTE;

interface Named extends OpenSession {
  readonly name: string;
}

interface Shape {
  /** Minutes since it opened. */
  readonly open: number;
  /** Seconds it has been idle; omitted, it is simulating. */
  readonly idle?: number;
  readonly from?: string;
}

const session = (name: string, { open, idle, from = `address-${name}` }: Shape): Named => ({
  name,
  openedAt: NOW - open * MINUTE,
  simulating: idle === undefined,
  idleSince: NOW - (idle ?? open * 60) * SECOND,
  clientAddress: from,
});

const newcomerFrom = (clientAddress: string): Newcomer => ({ clientAddress, at: NOW });
const STRANGER = newcomerFrom('address-new');

const pick = (open: readonly Named[], newcomer = STRANGER, replaceAfterMs = NINE_MINUTES) =>
  new ReplacementPolicy(replaceAfterMs, ONE_MINUTE_GRACE).sessionToClose(open, newcomer)?.name;

describe('ReplacementPolicy: idle sessions first', () => {
  test('a young idle session past the grace period', () => {
    assert.equal(pick([session('idle', { open: 2, idle: 90 })]), 'idle');
  });

  test('an idle session exactly at the grace period', () => {
    assert.equal(pick([session('idle', { open: 2, idle: 60 })]), 'idle');
  });

  test('the one idle longest, not the one opened first', () => {
    const open = [session('openedFirst', { open: 40, idle: 70 }), session('idleLongest', { open: 5, idle: 240 })];
    assert.equal(pick(open), 'idleLongest');
  });

  test('an idle session before an older simulating one', () => {
    assert.equal(pick([session('busy', { open: 60 }), session('idle', { open: 3, idle: 120 })]), 'idle');
  });
});

describe('ReplacementPolicy: the grace period', () => {
  test('spares an idle session within it', () => {
    assert.equal(pick([session('fresh', { open: 2, idle: 30 })]), undefined);
  });

  test('does not spare one whose address has another session', () => {
    const open = [session('tab1', { open: 2, idle: 5, from: 'lab' }), session('tab2', { open: 1, from: 'lab' })];
    assert.equal(pick(open), 'tab1');
  });

  test('does not spare one whose address the newcomer shares', () => {
    assert.equal(pick([session('oldTab', { open: 2, idle: 5, from: 'lab' })], newcomerFrom('lab')), 'oldTab');
  });
});

describe('ReplacementPolicy: then sessions open past the limit', () => {
  test('a simulating one open exactly at the limit', () => {
    assert.equal(pick([session('busy', { open: 9 })]), 'busy');
  });

  test('the oldest of those past the limit', () => {
    const open = [session('a', { open: 10 }), session('b', { open: 30 }), session('young', { open: 2 })];
    assert.equal(pick(open), 'b');
  });

  test('an idle one within the grace period before a simulating one', () => {
    const open = [session('busy', { open: 60 }), session('justStopped', { open: 12, idle: 10 })];
    assert.equal(pick(open), 'justStopped');
  });

  test('none when every simulating session is younger than the limit', () => {
    assert.equal(pick([session('a', { open: 8 }), session('b', { open: 1 })]), undefined);
  });
});

describe('ReplacementPolicy: turned off', () => {
  test('closes nothing with a limit of 0, not even an idle session', () => {
    assert.equal(pick([session('idle', { open: 600, idle: 3600 })], STRANGER, 0), undefined);
  });

  test('closes nothing of no sessions', () => {
    assert.equal(pick([]), undefined);
  });
});

describe('sessionsFrom', () => {
  test('counts the open sessions from an address and the newcomer', () => {
    const open = [session('a', { open: 1, from: 'lab' }), session('b', { open: 1, from: 'home' })];
    assert.equal(sessionsFrom('lab', open, newcomerFrom('lab')), 2);
  });
});

describe('the busy texts', () => {
  test('the idle text points to the offline version', () => {
    assert.ok(closedIdleText().endsWith(RELEASES_URL));
  });

  test('the simulating text points to the offline version', () => {
    assert.ok(closedSimulatingText().endsWith(RELEASES_URL));
  });

  test('the refused text points to the offline version', () => {
    assert.ok(fullText(4).endsWith(RELEASES_URL));
  });

  test('the idle student is told it was not simulating', () => {
    assert.match(closedIdleText(), /closed because it was not simulating/);
  });

  test('the simulating student is told it was the load', () => {
    assert.match(closedSimulatingText(), /closed because the server is under heavy load/);
  });

  test('the refused student is told how many sessions there are', () => {
    assert.match(fullText(4), /all 4 simulation sessions are in use/);
  });

  test('a one-session server says so', () => {
    assert.match(fullText(1), /its only simulation session is in use/);
  });
});

describe('the log lines', () => {
  test('a closed idle session, with how long it was open and idle', () => {
    assert.equal(
      closedLogLine(session('a', { open: 26, idle: 240 }), 1, NOW),
      'hdl-board: ERROR busy: closed a session open 26 min (idle 4 min) to make room for a new one',
    );
  });

  test('a closed idle session that shares its address', () => {
    assert.equal(
      closedLogLine(session('a', { open: 3, idle: 5 }), 2, NOW),
      'hdl-board: ERROR busy: closed a session open 3 min (idle 0 min, 2 sessions from its address) to make room for a new one',
    );
  });

  test('a closed simulating session', () => {
    assert.equal(
      closedLogLine(session('a', { open: 12 }), 1, NOW),
      'hdl-board: ERROR busy: closed a session open 12 min (simulating) to make room for a new one',
    );
  });

  test('a refused newcomer, with what the open sessions were doing', () => {
    const open = [session('a', { open: 1 }), session('b', { open: 2 }), session('c', { open: 3, idle: 10 })];
    assert.equal(refusedLogLine(open), 'hdl-board: ERROR busy: refused a new session, all 3 in use (2 simulating, 1 idle)');
  });
});
