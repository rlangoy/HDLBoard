// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { RELEASES_URL, fullText, replacedText, sessionToReplace, type OpenSession } from './sessionLimit.js';

const MINUTE = 60_000;
const NOW = 100 * MINUTE;
const NINE_MINUTES = 9 * MINUTE;

/** A session opened `minutesAgo` before NOW. */
const open = (name: string, minutesAgo: number, simulating = false) => ({ name, openedAt: NOW - minutesAgo * MINUTE, simulating });
const pick = (sessions: readonly (OpenSession & { name: string })[], replaceAfterMs = NINE_MINUTES) =>
  sessionToReplace(sessions, NOW, replaceAfterMs)?.name;

describe('sessionToReplace', () => {
  test('none when every session is younger than the limit', () => {
    assert.equal(pick([open('a', 8), open('b', 1)]), undefined);
  });

  test('a session exactly at the limit is old enough', () => {
    assert.equal(pick([open('a', 9)]), 'a');
  });

  test('the oldest of those past the limit', () => {
    assert.equal(pick([open('a', 10), open('b', 30), open('c', 2)]), 'b');
  });

  test('one not simulating before an older one that is', () => {
    assert.equal(pick([open('busy', 60, true), open('idle', 12)]), 'idle');
  });

  test('a simulating one when it is the only one past the limit', () => {
    assert.equal(pick([open('busy', 20, true), open('young', 3)]), 'busy');
  });

  test('never, with a limit of 0', () => {
    assert.equal(pick([open('a', 600)], 0), undefined);
  });

  test('none of no sessions', () => {
    assert.equal(pick([]), undefined);
  });
});

describe('the busy texts', () => {
  test('both point to the offline version', () => {
    assert.ok(replacedText().endsWith(RELEASES_URL));
    assert.ok(fullText(4).endsWith(RELEASES_URL));
  });

  test('the closed student is told it was the load', () => {
    assert.match(replacedText(), /closed because the server is under heavy load/);
  });

  test('the refused student is told how many sessions there are', () => {
    assert.match(fullText(4), /all 4 simulation sessions are in use/);
    assert.match(fullText(1), /its only simulation session is in use/);
  });
});
