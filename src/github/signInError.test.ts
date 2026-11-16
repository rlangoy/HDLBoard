// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { toSignInError } from './signInError';

describe('toSignInError', () => {
  it("tells a student over the server's sign-in limit to wait, not that sign-in failed", () => {
    const error = toSignInError({ error: 'too_many_requests', error_description: 'ignored' });
    expect(error.kind).toBe('unavailable');
    expect(error.message).toBe('Too many GitHub sign-ins from your network in the last minute. Wait a minute and try again.');
  });
});
