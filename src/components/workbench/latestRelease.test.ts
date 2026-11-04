// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { fetchLatestRelease, LATEST_RELEASE_URL, parseRelease } from './latestRelease';

const GITHUB_RELEASE = {
  tag_name: 'v1.6.1',
  name: 'HDLBoard 1.6.1',
  html_url: 'https://github.com/rlangoy/HDLBoard/releases/tag/v1.6.1',
};

function answering(status: number, body: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(body), { status });
}

describe('parseRelease', () => {
  test("takes the number, the title and the page from GitHub's release", () => {
    expect(parseRelease(GITHUB_RELEASE)).toEqual({
      version: '1.6.1',
      name: 'HDLBoard 1.6.1',
      url: 'https://github.com/rlangoy/HDLBoard/releases/tag/v1.6.1',
    });
  });

  test('names a release without a title after its version', () => {
    expect(parseRelease({ ...GITHUB_RELEASE, name: null }).name).toBe('HDLBoard 1.6.1');
  });

  test('refuses a tag without a number', () => {
    expect(() => parseRelease({ ...GITHUB_RELEASE, tag_name: 'latest' })).toThrow('no version number');
  });

  test('refuses a page outside the HDLBoard repository', () => {
    expect(() => parseRelease({ ...GITHUB_RELEASE, html_url: 'https://example.com/v9' })).toThrow('no page');
  });

  test('refuses an answer that is not an object', () => {
    expect(() => parseRelease(null)).toThrow('no version number');
  });
});

test('asks the release of the repository the app links to', () => {
  expect(LATEST_RELEASE_URL).toBe('https://api.github.com/repos/rlangoy/HDLBoard/releases/latest');
});

describe('fetchLatestRelease', () => {
  test("asks GitHub's latest-release address", async () => {
    const asked: string[] = [];
    const recording: typeof fetch = async (url) => {
      asked.push(String(url));
      return new Response(JSON.stringify(GITHUB_RELEASE));
    };
    await fetchLatestRelease(recording);
    expect(asked).toEqual([LATEST_RELEASE_URL]);
  });

  test('gives the release GitHub answered with', async () => {
    expect((await fetchLatestRelease(answering(200, GITHUB_RELEASE))).version).toBe('1.6.1');
  });

  test("fails with GitHub's status when it says no", async () => {
    await expect(fetchLatestRelease(answering(403, { message: 'rate limited' }))).rejects.toThrow('GitHub answered 403');
  });
});
