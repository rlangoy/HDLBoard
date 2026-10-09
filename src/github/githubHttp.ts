// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { GITHUB_API_URL, GITHUB_API_VERSION } from './config';

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export const browserFetch: FetchFn = (input, init) => fetch(input, init);

export type GitHubErrorKind = 'token-rejected' | 'no-permission' | 'rate-limited' | 'not-found' | 'rejected' | 'network' | 'http';

export class GitHubApiError extends Error {
  constructor(
    readonly kind: GitHubErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export interface JsonWithHeaders<T> {
  body: T;
  headers: Headers;
}

const HTTP_NO_CONTENT = 204;
const MAX_ERROR_DETAIL_LENGTH = 200;

/**
 * Sends authorized JSON requests to the GitHub REST API. The access token is
 * only sent to {@link GITHUB_API_URL}; raw file downloads never carry it.
 */
export class GitHubHttp {
  constructor(
    private readonly accessToken: string,
    private readonly fetchFn: FetchFn = browserFetch,
  ) {}

  async getJson<T>(path: string): Promise<T> {
    return (await this.getJsonWithHeaders<T>(path)).body;
  }

  async getJsonWithHeaders<T>(path: string): Promise<JsonWithHeaders<T>> {
    const response = await this.request('GET', path);
    return { body: (await response.json()) as T, headers: response.headers };
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    return (await (await this.request('POST', path, body)).json()) as T;
  }

  async patchJson<T>(path: string, body: unknown): Promise<T> {
    return (await (await this.request('PATCH', path, body)).json()) as T;
  }

  async delete(path: string): Promise<void> {
    await this.request('DELETE', path);
  }

  async getRawText(url: string): Promise<string> {
    const response = await this.send(url, { cache: 'no-store' });
    if (!response.ok) throw await toApiError(response);
    return response.text();
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const response = await this.send(`${GITHUB_API_URL}${path}`, {
      method,
      headers: this.apiHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    if (!response.ok) throw await toApiError(response);
    return response.status === HTTP_NO_CONTENT ? new Response('null') : response;
  }

  private apiHeaders(): Record<string, string> {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    };
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(url, init);
    } catch {
      throw new GitHubApiError('network', `Could not reach ${new URL(url).host}. Check the internet connection and try again.`);
    }
  }
}

async function toApiError(response: Response): Promise<GitHubApiError> {
  const detail = await readErrorMessage(response);
  switch (response.status) {
    case 401:
      return new GitHubApiError('token-rejected', 'GitHub did not accept the sign-in: the token is wrong, expired or was revoked. Sign in again.');
    case 403:
    case 429:
      return isRateLimited(response)
        ? new GitHubApiError('rate-limited', `GitHub asks HDLBoard to wait. Try again after ${rateLimitReset(response)}.`)
        : new GitHubApiError('no-permission', `GitHub refused access (${detail}). Sign in again and allow access to gists.`);
    case 404:
      return new GitHubApiError('not-found', 'Not found on GitHub: it may have been deleted.');
    case 422:
      return new GitHubApiError('rejected', `GitHub did not accept the change: ${detail}`);
    default:
      return new GitHubApiError('http', `GitHub answered HTTP ${response.status}: ${detail}`);
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  try {
    const message = (JSON.parse(text) as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  } catch {
    // Not JSON: fall back to the raw text.
  }
  return text.slice(0, MAX_ERROR_DETAIL_LENGTH) || response.statusText;
}

function isRateLimited(response: Response): boolean {
  return response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0';
}

function rateLimitReset(response: Response): string {
  const resetEpochSeconds = Number(response.headers.get('x-ratelimit-reset'));
  return Number.isFinite(resetEpochSeconds) && resetEpochSeconds > 0
    ? new Date(resetEpochSeconds * 1000).toLocaleTimeString()
    : 'a while';
}
