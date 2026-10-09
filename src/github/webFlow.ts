// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { AuthPost } from './authProxy';
import { GIST_SCOPE } from './config';
import { codeChallengeFor, randomUrlSafeString } from './pkce';
import { SignInError, toSignInError } from './signInError';

/**
 * GitHub's OAuth web flow with PKCE, the one-click sign-in: GitHub shows one
 * "Authorize" page (and nothing at all once the app is authorized), then returns
 * a code that the backend exchanges for a token, adding the client secret.
 * Only offered when the backend holds the secret (server/src/githubAuth.ts).
 */

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';

export interface AuthorizationRequest {
  /** The GitHub page to open. */
  url: string;
  state: string;
  codeVerifier: string;
}

/** The query parameters GitHub sends back to the callback page. */
export interface AuthorizationCallback {
  code: string | null;
  state: string | null;
  error: string | null;
}

export class WebFlowSignIn {
  constructor(
    private readonly clientId: string,
    private readonly redirectUri: string,
    private readonly post: AuthPost,
  ) {}

  async createRequest(): Promise<AuthorizationRequest> {
    const state = randomUrlSafeString();
    const codeVerifier = randomUrlSafeString();
    const query = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: GIST_SCOPE,
      state,
      code_challenge: await codeChallengeFor(codeVerifier),
      code_challenge_method: 'S256',
    });
    return { url: `${AUTHORIZE_URL}?${query}`, state, codeVerifier };
  }

  async exchangeForToken(request: AuthorizationRequest, callback: AuthorizationCallback): Promise<string> {
    const code = requireCode(request, callback);
    const answer = await this.post('web/token', {
      client_id: this.clientId,
      code,
      code_verifier: request.codeVerifier,
      redirect_uri: this.redirectUri,
    });
    if (typeof answer.access_token === 'string') return answer.access_token;
    throw toSignInError(answer);
  }
}

function requireCode(request: AuthorizationRequest, callback: AuthorizationCallback): string {
  if (callback.state !== request.state) {
    throw new SignInError('unexpected', 'The answer from GitHub did not belong to this sign-in. Try again.');
  }
  if (callback.error !== null) throw toSignInError({ error: callback.error });
  if (callback.code === null) throw new SignInError('unexpected', 'GitHub returned no code.');
  return callback.code;
}
