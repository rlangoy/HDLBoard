// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { GitHubApiError, GitHubHttp, type FetchFn } from './githubHttp';

function answering(status: number, body: unknown, headers: Record<string, string> = {}): FetchFn {
  return async () => new Response(JSON.stringify(body), { status, headers });
}

async function errorKindFor(fetchFn: FetchFn): Promise<string> {
  try {
    await new GitHubHttp('token', fetchFn).getJson('/user');
  } catch (error) {
    return (error as GitHubApiError).kind;
  }
  return 'no error';
}

describe('GitHubHttp', () => {
  it('sends the token as a Bearer header', async () => {
    let sentHeaders: Record<string, string> = {};
    const capture: FetchFn = async (_url, init) => {
      sentHeaders = init?.headers as Record<string, string>;
      return new Response('{}');
    };
    await new GitHubHttp('secret-token', capture).getJson('/user');
    expect(sentHeaders.Authorization).toBe('Bearer secret-token');
  });

  it('never sends the token with raw file downloads', async () => {
    let sentInit: RequestInit | undefined;
    const capture: FetchFn = async (_url, init) => {
      sentInit = init;
      return new Response('raw');
    };
    await new GitHubHttp('secret-token', capture).getRawText('https://gist.githubusercontent.com/a/b/raw/c');
    expect(JSON.stringify(sentInit)).not.toContain('secret-token');
  });

  it.each([
    [401, {}, 'token-rejected'],
    [403, { 'x-ratelimit-remaining': '0' }, 'rate-limited'],
    [403, { 'x-ratelimit-remaining': '10' }, 'no-permission'],
    [404, {}, 'not-found'],
    [422, {}, 'rejected'],
    [500, {}, 'http'],
  ])('maps HTTP %i to a %s error', async (status, headers, kind) => {
    expect(await errorKindFor(answering(status, { message: 'x' }, headers))).toBe(kind);
  });

  it('reports a network failure', async () => {
    expect(await errorKindFor(() => Promise.reject(new TypeError('offline')))).toBe('network');
  });

  it('accepts the empty answer to DELETE', async () => {
    const noContent: FetchFn = async () => new Response(null, { status: 204 });
    await expect(new GitHubHttp('token', noContent).delete('/gists/abc')).resolves.toBeUndefined();
  });
});
