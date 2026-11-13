// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { childEnv } from './childEnv.js';

describe('childEnv', () => {
  const env = { PATH: '/usr/bin', LANG: 'C.UTF-8', GITHUB_CLIENT_SECRET: 's3cret', HDL_MAX_SESSIONS: '4' };

  test('keeps what a program needs on Linux', () => {
    assert.deepEqual(childEnv(env, 'linux'), { PATH: '/usr/bin', LANG: 'C.UTF-8' });
  });

  test('keeps no secret', () => {
    assert.equal(childEnv(env, 'linux').GITHUB_CLIENT_SECRET, undefined);
  });

  test('matches Windows names without case, keeping their spelling', () => {
    const windows = { Path: 'C:\\Windows', SystemRoot: 'C:\\Windows', GITHUB_CLIENT_SECRET: 's3cret' };
    assert.deepEqual(childEnv(windows, 'win32'), { Path: 'C:\\Windows', SystemRoot: 'C:\\Windows' });
  });

  test('matches Linux names with case', () => {
    assert.deepEqual(childEnv({ Path: '/usr/bin' }, 'linux'), {});
  });
});
