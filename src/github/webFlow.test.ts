// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import type { AuthPost } from './authProxy';
import { codeChallengeFor } from './pkce';
import { SignInError } from './signInError';
import { WebFlowSignIn } from './webFlow';

const REDIRECT_URI = 'http://localhost:5195/github-callback.html';

function recordingPost(answer: Record<string, unknown>) {
  const sent: Record<string, string>[] = [];
  const post: AuthPost = async (_route, params) => {
    sent.push(params);
    return answer;
  };
  return { post, sent };
}

async function signInErrorKind(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as SignInError).kind;
  }
  return 'no error';
}

describe('codeChallengeFor', () => {
  it('matches the S256 example in RFC 7636', async () => {
    expect(await codeChallengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('WebFlowSignIn', () => {
  it('asks GitHub for gist access with a PKCE challenge', async () => {
    const request = await new WebFlowSignIn('client', REDIRECT_URI, recordingPost({}).post).createRequest();
    const query = new URL(request.url).searchParams;
    expect([query.get('scope'), query.get('code_challenge_method'), query.get('code_challenge')]).toEqual([
      'gist',
      'S256',
      await codeChallengeFor(request.codeVerifier),
    ]);
  });

  it('exchanges the code together with the verifier', async () => {
    const { post, sent } = recordingPost({ access_token: 'tok' });
    const signIn = new WebFlowSignIn('client', REDIRECT_URI, post);
    const request = await signIn.createRequest();
    await signIn.exchangeForToken(request, { code: 'c', state: request.state, error: null });
    expect(sent[0]).toEqual({ client_id: 'client', code: 'c', code_verifier: request.codeVerifier, redirect_uri: REDIRECT_URI });
  });

  it('returns the access token', async () => {
    const signIn = new WebFlowSignIn('client', REDIRECT_URI, recordingPost({ access_token: 'tok' }).post);
    const request = await signIn.createRequest();
    expect(await signIn.exchangeForToken(request, { code: 'c', state: request.state, error: null })).toBe('tok');
  });

  it('rejects an answer that belongs to another sign-in', async () => {
    const signIn = new WebFlowSignIn('client', REDIRECT_URI, recordingPost({ access_token: 'tok' }).post);
    const request = await signIn.createRequest();
    expect(await signInErrorKind(signIn.exchangeForToken(request, { code: 'c', state: 'other', error: null }))).toBe('unexpected');
  });

  it('reports a declined authorization', async () => {
    const signIn = new WebFlowSignIn('client', REDIRECT_URI, recordingPost({}).post);
    const request = await signIn.createRequest();
    const callback = { code: null, state: request.state, error: 'access_denied' };
    expect(await signInErrorKind(signIn.exchangeForToken(request, callback))).toBe('denied');
  });
});
