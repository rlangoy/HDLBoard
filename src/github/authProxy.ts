// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { browserFetch, type FetchFn } from './githubHttp';
import { SignInError } from './signInError';

/**
 * The backend's sign-in routes (server/src/githubAuth.ts). github.com sends no
 * CORS headers on its OAuth endpoints, and the web flow needs the client secret,
 * which only the server holds.
 */

export type AuthRoute = 'device/code' | 'device/token' | 'web/token';

/** Posts one OAuth request through the backend and returns GitHub's JSON answer. */
export type AuthPost = (route: AuthRoute, params: Record<string, string>) => Promise<Record<string, unknown>>;

export interface AuthProxyConfig {
  /** The OAuth App the backend forwards for. */
  clientId: string;
  /** True when the backend holds a client secret, so one-click sign-in is possible. */
  webFlow: boolean;
}

const UNAVAILABLE_MESSAGE =
  'GitHub sign-in needs the HDLBoard server, and it cannot be reached. You can still sign in with a personal access token.';

export class AuthProxy {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn = browserFetch,
  ) {}

  readonly post: AuthPost = async (route, params) => {
    const response = await this.send(`${this.baseUrl}/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(params),
    });
    return parseJsonAnswer(response);
  };

  async readConfig(): Promise<AuthProxyConfig> {
    const answer = await parseJsonAnswer(await this.send(`${this.baseUrl}/config`, { cache: 'no-store' }));
    if (typeof answer.clientId !== 'string') throw new SignInError('unavailable', UNAVAILABLE_MESSAGE);
    return { clientId: answer.clientId, webFlow: answer.webFlow === true };
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchFn(url, init);
    } catch {
      throw new SignInError('unavailable', UNAVAILABLE_MESSAGE);
    }
  }
}

async function parseJsonAnswer(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    throw new SignInError('unavailable', UNAVAILABLE_MESSAGE);
  }
}
