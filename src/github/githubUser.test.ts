// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { GitHubHttp } from './githubHttp';
import { getSignedInUser } from './githubUser';
import { FAKE_LOGIN, FakeGitHub } from './testSupport/fakeGitHub';

function signInWithScopes(scopes: string | null) {
  const github = new FakeGitHub();
  github.grantedScopes = scopes;
  return getSignedInUser(new GitHubHttp('token', github.fetch));
}

describe('getSignedInUser', () => {
  it('reads the user of a token with gist access', async () => {
    expect((await signInWithScopes('gist, read:user')).login).toBe(FAKE_LOGIN);
  });

  it('refuses a token that cannot read or save gists', async () => {
    await expect(signInWithScopes('repo')).rejects.toMatchObject({ kind: 'no-permission' });
  });

  it('accepts a fine-grained token, which names no scopes', async () => {
    expect((await signInWithScopes(null)).login).toBe(FAKE_LOGIN);
  });
});
