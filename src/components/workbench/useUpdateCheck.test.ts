// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Release } from './latestRelease';
import { loadUpdateCheckChoice, newerReleaseAfter, saveUpdateCheckChoice, statusOfRelease, updateCheckEnabled } from './useUpdateCheck';

afterEach(() => vi.unstubAllGlobals());

const RELEASE: Release = { version: '1.6.2', name: 'HDLBoard 1.6.2', url: 'https://github.com/rlangoy/HDLBoard/releases/tag/v1.6.2' };

/** A window with working storage; `desktop` adds the Windows app's bridge. */
function stubWindow({ desktop }: { desktop: boolean }): void {
  const values = new Map<string, string>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
    hdlboard: desktop ? { enabled: true } : undefined,
  });
}

describe('the start-up check', () => {
  test('is off in a browser until the user turns it on', () => {
    stubWindow({ desktop: false });
    expect(updateCheckEnabled()).toBe(false);
  });

  test('is on in the Windows app until the user turns it off', () => {
    stubWindow({ desktop: true });
    expect(updateCheckEnabled()).toBe(true);
  });

  test("follows the user's choice over the Windows default", () => {
    stubWindow({ desktop: true });
    saveUpdateCheckChoice(false);
    expect(updateCheckEnabled()).toBe(false);
  });

  test("follows the user's choice over the browser default", () => {
    stubWindow({ desktop: false });
    saveUpdateCheckChoice(true);
    expect(updateCheckEnabled()).toBe(true);
  });

  test('has no stored choice when storage is blocked, and saving does not throw', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    saveUpdateCheckChoice(true);
    expect(loadUpdateCheckChoice()).toBeNull();
  });
});

describe('statusOfRelease', () => {
  test('a newer release is available', () => {
    expect(statusOfRelease(RELEASE, '1.6.1')).toEqual({ kind: 'available', latest: RELEASE });
  });

  test('the same release is up to date', () => {
    expect(statusOfRelease(RELEASE, '1.6.2').kind).toBe('upToDate');
  });

  test('a build newer than the release is up to date', () => {
    expect(statusOfRelease(RELEASE, '1.7.0').kind).toBe('upToDate');
  });
});

describe('newerReleaseAfter', () => {
  const OLDER_FIND: Release = { ...RELEASE, version: '1.6.1' };

  test('tells about the release a check found', () => {
    expect(newerReleaseAfter({ kind: 'available', latest: RELEASE }, OLDER_FIND)).toBe(RELEASE);
  });

  test('tells about none once a check finds the version running is the latest', () => {
    expect(newerReleaseAfter({ kind: 'upToDate', latest: RELEASE }, OLDER_FIND)).toBeNull();
  });

  test('keeps the known release while a check runs', () => {
    expect(newerReleaseAfter({ kind: 'checking' }, RELEASE)).toBe(RELEASE);
  });

  test('keeps the known release when a check fails', () => {
    expect(newerReleaseAfter({ kind: 'failed', reason: 'offline' }, RELEASE)).toBe(RELEASE);
  });
});
